import { BoxRenderable, TextRenderable } from "@opentui/core"
import type { Context } from "@opencode/plugin/tui/context"
import { createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js"
import { type bindComposer, type Snapshot } from "./composer"
import { automatic, queries, search, type Candidate, type index } from "./search"
import { copy } from "./copy"

export function suggestions(
  context: Context,
  composer: ReturnType<typeof bindComposer>,
  items: () => ReturnType<typeof index>,
  enabled: () => boolean,
  save: (text: string) => void,
) {
  const [open, setOpen] = createSignal(false)
  // Match the native prompt's theme-adjusted surface.
  const background = createMemo(() => context.theme.decrease(context.theme.background.raised.base))
  const popup = new BoxRenderable(context.renderer, {
    id: `occo.suggestions.${composer.marker.num}`,
    position: "absolute",
    zIndex: 101,
    visible: false,
    flexDirection: "column",
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  let cooldown = 0
  let snapshot: Snapshot | undefined
  let results: Candidate[] = []
  let selected = 0
  let manual = false
  let disposed = false
  let bounds = ""

  function close(dismissed = false) {
    clearTimeout(timer)
    if (dismissed) cooldown = Date.now() + 3000
    setOpen(false)
    popup.visible = false
  }

  function paint() {
    if (!open()) return
    const anchor = composer.anchor()
    if (!anchor || anchor.y < 2) return close()
    popup.getChildren().forEach((child) => child.destroyRecursively())
    popup.backgroundColor = background()
    const width = Math.max(1, Math.min(anchor.width, context.renderer.width))
    popup.width = width
    popup.left = Math.max(0, Math.min(anchor.x, context.renderer.width - width))
    const count = Math.min(8, Math.max(1, anchor.y - 1))
    const start = Math.max(0, selected - count + 1)
    const visible = results.slice(start, start + count)
    if (!visible.length)
      popup.add(
        new TextRenderable(context.renderer, {
          content: copy.empty,
          height: 1,
          paddingLeft: 2,
          fg: context.theme.text.muted,
          truncate: true,
        }),
      )
    visible.forEach((item, index) => {
      const highlighted = selected === start + index
      const row = new BoxRenderable(context.renderer, {
        height: 1,
        flexShrink: 0,
        paddingLeft: context.renderer.width < 44 ? 2 : 3,
        paddingRight: 2,
        backgroundColor: highlighted ? context.theme.background.action.primary.focused : background(),
        onMouseDown(event) {
          event.preventDefault()
          event.stopPropagation()
        },
        onMouseUp(event) {
          event.preventDefault()
          event.stopPropagation()
          if (event.button !== 0) return
          selected = start + index
          paint()
        },
      })
      row.add(
        new TextRenderable(context.renderer, {
          content: `${item.entry.saved ? "★" : "·"} ${item.edit.text.replace(/\s+/g, " ").trim()}`,
          height: 1,
          wrapMode: "none",
          truncate: true,
          selectable: false,
          fg: highlighted ? context.theme.text.action.primary.focused : context.theme.text.base,
        }),
      )
      popup.add(row)
    })
    const item = results[selected]
    const controls = new BoxRenderable(context.renderer, {
      flexDirection: "row",
      height: 1,
      flexShrink: 0,
      paddingLeft: context.renderer.width < 44 ? 2 : 3,
      paddingRight: 1,
      gap: 2,
    })
    ;[
      ...(item ? [{ text: `Enter ${copy.insert}`, run: accept }] : []),
      { text: `Esc ${copy.close}`, run: () => close(true) },
    ].forEach((action) =>
      controls.add(
        new TextRenderable(context.renderer, {
          content: action.text,
          fg: context.theme.text.muted,
          selectable: false,
          flexShrink: 0,
          onMouseDown(event) {
            event.preventDefault()
            event.stopPropagation()
          },
          onMouseUp(event) {
            event.preventDefault()
            event.stopPropagation()
            if (event.button === 0) action.run()
          },
        }),
      ),
    )
    if (item)
      controls.add(
        new TextRenderable(context.renderer, {
          content: `↑↓ · ${copy.range[item.range]} · Ctrl+S Save`,
          fg: context.theme.text.muted,
          truncate: true,
          wrapMode: "none",
          height: 1,
          flexShrink: 1,
        }),
      )
    popup.add(controls)
    const height = Math.max(1, visible.length) + 1
    popup.height = height
    // Renderable.height is measured on the next layout pass, not by its setter.
    popup.top = anchor.y - height
    popup.visible = true
    bounds = `${anchor.x}:${anchor.y}:${anchor.width}:${context.renderer.width}:${context.renderer.height}`
  }

  function show() {
    const current = composer.current()
    if (!current) return close()
    snapshot = current
    results = search(items(), queries(current.text, current.cursor))
    selected = 0
    if (!manual && !results.length) return close()
    setOpen(true)
    paint()
  }

  function refresh() {
    if (disposed) return
    clearTimeout(timer)
    const current = composer.current()
    if (!current) return close()
    if (open()) {
      if (!manual && (!enabled() || !automatic(queries(current.text, current.cursor)))) return close()
      return show()
    }
    if (!enabled() || Date.now() < cooldown || !automatic(queries(current.text, current.cursor))) return
    manual = false
    timer = setTimeout(show, 300)
  }

  function toggle() {
    if (open()) return close(true)
    clearTimeout(timer)
    manual = true
    show()
  }

  function accept() {
    const item = results[selected]
    const target = snapshot
    if (!item || !target) return
    close(true)
    const result = composer.apply(target, item.edit)
    if (result !== "applied")
      context.ui.toast.show({ message: result === "protected" ? copy.protected : copy.stale, variant: "warning" })
  }

  function saveSelected() {
    const item = results[selected]
    if (!item) return
    close(true)
    save(item.entry.text)
  }

  context.keymap.layer(() => ({
    priority: 1000,
    target: composer.editor,
    enabled: open(),
    commands: [
      {
        bind: "up",
        run() {
          selected = (selected - 1 + results.length) % Math.max(1, results.length)
          paint()
        },
      },
      {
        bind: "down",
        run() {
          selected = (selected + 1) % Math.max(1, results.length)
          paint()
        },
      },
      { bind: "escape", run: () => close(true) },
      { bind: "return", run: accept },
      { bind: "ctrl+s", run: saveSelected },
    ],
  }))
  createEffect(() => {
    items()
    enabled()
    context.keymap.mode.current()
    context.ui.router.current()
    untrack(refresh)
  })
  createEffect(() => {
    background()
    context.theme.text.base
    untrack(paint)
  })
  onMount(() => {
    context.renderer.root.add(popup)
    context.renderer.setFrameCallback(frame)
    context.renderer.on("resize", paint)
  })
  async function frame() {
    const anchor = composer.anchor()
    if (
      open() &&
      anchor &&
      bounds !== `${anchor.x}:${anchor.y}:${anchor.width}:${context.renderer.width}:${context.renderer.height}`
    )
      paint()
  }
  onCleanup(() => {
    disposed = true
    close()
    context.renderer.removeFrameCallback(frame)
    context.renderer.off("resize", paint)
    popup.destroyRecursively()
  })
  return { refresh, toggle, close }
}
