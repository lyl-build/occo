import { BoxRenderable, TextareaRenderable, InputRenderable, type Renderable } from "@opentui/core"
import type { Context, SlotMap } from "@opencode/plugin/tui/context"

export type TextEdit = { start: number; end: number; text: string }
export type Snapshot = ReturnType<typeof snapshot>

export function snapshot(editor: TextareaRenderable, session: string | undefined) {
  const selection = editor.getSelection()
  return {
    editor,
    session,
    text: editor.plainText,
    cursor: editor.getTextRange(0, editor.cursorOffset).length,
    selection: selection && {
      start: editor.getTextRange(0, selection.start).length,
      end: editor.getTextRange(0, selection.end).length,
    },
    marks: editor.extmarks.getAll().map((mark) => ({
      id: mark.id,
      start: editor.getTextRange(0, mark.start).length,
      end: editor.getTextRange(0, mark.end).length,
      type: mark.typeId,
      virtual: mark.virtual,
      data: JSON.stringify(mark.data),
      pasted: typeof mark.data?.pasted === "string" ? String(mark.data.pasted) : undefined,
    })),
  }
}

export function applyEdit(saved: Snapshot, current: Snapshot, edit: TextEdit) {
  if (
    saved.editor !== current.editor ||
    saved.editor.isDestroyed ||
    saved.session !== current.session ||
    saved.text !== current.text ||
    saved.cursor !== current.cursor ||
    JSON.stringify(saved.selection) !== JSON.stringify(current.selection) ||
    JSON.stringify(saved.marks) !== JSON.stringify(current.marks)
  )
    return "stale"
  if (edit.start < 0 || edit.end < edit.start || edit.end > saved.text.length) return "range"
  if (
    saved.marks.some(
      (mark) =>
        (edit.start < mark.end && edit.end > mark.start) ||
        (edit.start === edit.end && edit.start > mark.start && edit.start < mark.end),
    )
  )
    return "protected"
  const editor = current.editor
  const start = editor.editBuffer.measureText(saved.text.slice(0, edit.start))
  const end = editor.editBuffer.measureText(saved.text.slice(0, edit.end))
  // Reject a JS index inside a grapheme, rather than silently rounding the edit.
  if (editor.getTextRange(0, start).length !== edit.start || editor.getTextRange(0, end).length !== edit.end)
    return "range"
  if (start !== end) editor.setSelection(start, end)
  if (start === end) editor.cursorOffset = start
  editor.insertText(edit.text)
  return "applied"
}

export function savedText(saved: Snapshot, selection = false) {
  const range = selection ? saved.selection : { start: 0, end: saved.text.length }
  if (!range) return ""
  const marks = saved.marks
    .filter((mark) => mark.start < range.end && mark.end > range.start)
    .toSorted((a, b) => b.start - a.start)
  if (marks.some((mark) => mark.start < range.start || mark.end > range.end)) return ""
  return marks.reduce(
    (text, mark) => text.slice(0, mark.start - range.start) + (mark.pasted ?? "") + text.slice(mark.end - range.start),
    saved.text.slice(range.start, range.end),
  )
}

export function bindComposer(context: Context, input: SlotMap["prompt.footer"], changed: () => void) {
  const marker = new BoxRenderable(context.renderer, { width: 0, height: 0, position: "absolute" })
  let editor: TextareaRenderable | undefined
  let anchor: Renderable | undefined
  let disposed = false
  const detach = () => {
    editor?.editBuffer.off("content-changed", changed)
    editor?.editBuffer.off("cursor-changed", changed)
    editor?.off("traits-changed", changed)
    editor?.off("destroyed", attach)
    editor = undefined
    anchor = undefined
  }
  const attach = () => {
    if (disposed) return
    if (!editor || editor.isDestroyed || !editor.parent) {
      detach()
      const binding = findComposer(marker, context.renderer.root)
      editor = binding?.editor
      anchor = binding?.anchor
      editor?.editBuffer.on("content-changed", changed)
      editor?.editBuffer.on("cursor-changed", changed)
      editor?.on("traits-changed", changed)
      editor?.on("destroyed", attach)
    }
    changed()
  }
  const current = (allowSelection = false, allowBlur = false) => {
    const route = context.ui.router.current()
    if (
      !editor ||
      editor.isDestroyed ||
      !editor.visible ||
      !editor.parent ||
      marker.isDestroyed ||
      input.mode !== "normal"
    )
      return
    if (route.type === "plugin" || (route.type === "session" ? route.sessionID : undefined) !== input.sessionID) return
    if (
      !allowBlur &&
      (context.renderer.currentFocusedEditor !== editor || !editor.focused || context.keymap.mode.current() !== "base")
    )
      return
    if (!allowSelection && (editor.hasSelection() || context.renderer.hasSelection)) return
    // The managed prompt always suspends OpenTUI's default keymap and captures Tab.
    if (editor.traits.capture?.includes("navigate") || editor.traits.capture?.includes("submit")) return
    return snapshot(editor, input.sessionID)
  }
  return {
    marker,
    editor: () => editor,
    anchor: () => anchor,
    current,
    mount() {
      attach()
      context.renderer.on("focused_editor", attach)
    },
    apply(saved: Snapshot, edit: TextEdit) {
      const value = current(true)
      return value ? applyEdit(saved, value, edit) : "stale"
    },
    dispose() {
      disposed = true
      context.renderer.off("focused_editor", attach)
      detach()
    },
  }
}

function findComposer(marker: Renderable, root: Renderable) {
  const editors = (node: Renderable): TextareaRenderable[] =>
    node instanceof TextareaRenderable && !(node instanceof InputRenderable)
      ? [node]
      : node.getChildren().flatMap((child) => editors(child))
  // The 2.3.0 footer and editor share the prompt container. Never search the app.
  for (let node = marker.parent, depth = 0; node && node !== root && depth < 4; node = node.parent, depth++) {
    const found = editors(node)
    if (found.length > 1) return
    if (found.length === 1) return { editor: found[0], anchor: node }
  }
}
