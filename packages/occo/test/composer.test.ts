import { describe, expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { applyEdit, snapshot, savedText } from "../src/composer"

describe("native range edits", () => {
  test("insertion is one undo; stale text, cursor, selection, marks cannot edit", async () => {
    await using host = await createTestRenderer({})
    const editor = new TextareaRenderable(host.renderer, { initialValue: "你好 😀 tail" })
    host.renderer.root.add(editor)
    editor.cursorOffset = editor.editBuffer.measureText("你好 ")
    const before = snapshot(editor, "a")
    expect(applyEdit(before, before, { start: 3, end: 3, text: "插入" })).toBe("applied")
    expect(editor.plainText).toBe("你好 插入😀 tail")
    editor.undo()
    expect(editor.plainText).toBe(before.text)
    expect(applyEdit(before, { ...before, text: "changed" }, { start: 0, end: 0, text: "bad" })).toBe("stale")
    expect(applyEdit(before, { ...before, cursor: 0 }, { start: 0, end: 0, text: "bad" })).toBe("stale")
    expect(applyEdit(before, { ...before, selection: { start: 0, end: 2 } }, { start: 0, end: 0, text: "bad" })).toBe(
      "stale",
    )
    editor.setSelection(0, editor.editBuffer.measureText("你好"))
    expect(savedText(snapshot(editor, "a"), true)).toBe("你好")
    expect(editor.plainText).toBe(before.text)
  })
  test.each(["hello world", "你好世界", "a😀é中\n\tline end"])("replace and undo: %s", async (text) => {
    await using host = await createTestRenderer({ width: 80, height: 24 })
    const editor = new TextareaRenderable(host.renderer, { initialValue: text })
    host.renderer.root.add(editor)
    editor.gotoBufferEnd()
    const before = snapshot(editor, "session")
    expect(
      applyEdit(before, snapshot(editor, "session"), { start: 0, end: text.length, text: "替换\n  code 😀" }),
    ).toBe("applied")
    expect(editor.plainText).toBe("替换\n  code 😀")
    editor.undo()
    editor.undo()
    expect(editor.plainText).toBe(text)
    editor.redo()
    editor.redo()
    expect(editor.plainText).toBe("替换\n  code 😀")
  })

  test("preserves and protects native attachment marks; expands saved paste", async () => {
    await using host = await createTestRenderer({})
    const editor = new TextareaRenderable(host.renderer, { initialValue: "你好 [paste] tail" })
    host.renderer.root.add(editor)
    const mark = editor.extmarks.create({ start: 5, end: 12, virtual: true, data: { pasted: "full\npaste" } })
    editor.gotoBufferEnd()
    const before = snapshot(editor, "a")
    expect(savedText(before)).toBe("你好 full\npaste tail")
    expect(applyEdit(before, before, { start: 3, end: 10, text: "bad" })).toBe("protected")
    expect(applyEdit(before, { ...before, session: "b" }, { start: 0, end: 2, text: "新" })).toBe("stale")
    expect(applyEdit(before, before, { start: 0, end: 2, text: "更新你好" })).toBe("applied")
    expect(editor.extmarks.get(mark)?.start).toBe(9)
    editor.undo()
    editor.undo()
    expect(editor.plainText).toBe(before.text)
    expect(editor.extmarks.get(mark)?.start).toBe(5)
    const saved = snapshot(editor, "a")
    editor.extmarks.create({ start: 0, end: 4 })
    expect(applyEdit(saved, snapshot(editor, "a"), { start: saved.cursor, end: saved.cursor, text: "bad" })).toBe(
      "stale",
    )
  })
})
