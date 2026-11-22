import { expect, test } from "bun:test"
import { RGBA, TextAttributes, type StyledText } from "@opentui/core"
import { complete, prepare, displayHits } from "../src/search"
import { alternateBackground, preview, suggestionFooter, suggestionWindow, formatTime } from "../src/suggestions"

const text = (lines: StyledText[]) => lines.map((line) => line.chunks.map((chunk) => chunk.text).join(""))
function saved(body: string, query = "") {
  return complete(
    prepare([], [{ id: "saved", text: body, updatedAt: 1 }]),
    { text: query, cursor: query.length },
    true,
  )[0]
}

test("alternate background changes only HSL lightness by eight percentage points", () => {
  for (const sample of [
    { rgb: [0.6, 0.2, 0.2], dark: [0.72, 0.24, 0.24], light: [0.48, 0.16, 0.16] },
    { rgb: [0.2, 0.6, 0.2], dark: [0.24, 0.72, 0.24], light: [0.16, 0.48, 0.16] },
    { rgb: [0.2, 0.2, 0.6], dark: [0.24, 0.24, 0.72], light: [0.16, 0.16, 0.48] },
    { rgb: [0.8, 0.6, 0.6], dark: [0.853333, 0.706667, 0.706667], light: [0.746667, 0.493333, 0.493333] },
    { rgb: [0.7, 0.2, 0.2], dark: [0.791111, 0.268889, 0.268889], light: [0.575556, 0.164444, 0.164444] },
    { rgb: [0.25, 0.25, 0.25], dark: [0.33, 0.33, 0.33], light: [0.17, 0.17, 0.17] },
    { rgb: [0, 0, 0], dark: [0.08, 0.08, 0.08], light: [0, 0, 0] },
    { rgb: [1, 1, 1], dark: [1, 1, 1], light: [0.92, 0.92, 0.92] },
    { rgb: [0.02, 0.02, 0.02], dark: [0.1, 0.1, 0.1], light: [0, 0, 0] },
    { rgb: [0.98, 0.98, 0.98], dark: [1, 1, 1], light: [0.9, 0.9, 0.9] },
  ]) {
    for (const alpha of [0, 0.5, 1]) {
      const base = RGBA.fromValues(sample.rgb[0], sample.rgb[1], sample.rgb[2], alpha)
      const original = base.toInts()
      for (const mode of ["dark", "light"] as const) {
        const result = alternateBackground(base, mode)
        // OpenTUI quantizes input and output channels to 8-bit RGB.
        ;[result.r, result.g, result.b].forEach((value, index) =>
          expect(Math.abs(value - sample[mode][index])).toBeLessThanOrEqual(1 / 255),
        )
        expect(result.a).toBe(base.a)
        expect(base.toInts()).toEqual(original)
      }
    }
  }
})

test("footer separates actions from position and history state", () => {
  expect(suggestionFooter(100, 2, 26, "ready")).toEqual({
    left: [
      { key: "Enter", label: "Insert", action: "insert" },
      { key: "Ctrl+S", label: "Save", action: "save" },
      { key: "Esc", label: "Close", action: "close" },
    ],
    right: { text: "↑↓ 3/26", kind: "ready" },
  })
  expect(suggestionFooter(100, 0, 1, "ready").right).toBeUndefined()
  expect(suggestionFooter(100, 0, 0, "ready")).toEqual({
    left: [{ key: "Esc", label: "Close", action: "close" }],
    right: undefined,
  })
  expect(suggestionFooter(100, 2, 26, "loading").right?.text).toBe("Loading history…")
  expect(suggestionFooter(100, 2, 26, "failed").right?.text).toBe("History incomplete · Esc → F12")
  expect(suggestionFooter(56, 2, 26, "failed").left.some((item) => item.action === "save")).toBe(true)
  expect(suggestionFooter(56, 2, 26, "failed").right?.text).toBe("History incomplete")
  expect(suggestionFooter(36, 2, 26, "failed").left.map((item) => item.key)).toEqual(["Enter", "Esc"])
  expect(suggestionFooter(36, 2, 26, "failed").right?.text).toBe("History incomplete")
  expect(suggestionFooter(22, 2, 26, "failed").right?.text).toBe("Incomplete")
})

test("footer fits every boundary without splitting labels or changing action order", () => {
  for (const total of [0, 1, 26, 10000]) {
    for (const status of ["ready", "loading", "failed"] as const) {
      for (let width = 0; width <= 100; width++) {
        const footer = suggestionFooter(width, Math.max(0, total - 1), total, status)
        const content = [
          ...footer.left.map((item) => item.key + (item.label ? ` ${item.label}` : "")),
          ...(footer.right ? [footer.right.text] : []),
        ].join("  ")
        expect(Bun.stringWidth(content)).toBeLessThanOrEqual(width)
        expect(content).not.toContain("\n")
        expect(footer.left.map((item) => item.action)).toEqual(
          (["insert", "save", "close"] as const).filter((action) => footer.left.some((item) => item.action === action)),
        )
        if (width >= (total ? 5 : 3)) expect(footer.left[0]?.action).toBe(total ? "insert" : "close")
        if (!total) expect(footer.left.every((item) => item.action === "close")).toBe(true)
        if (status !== "ready" && width >= 32) expect(footer.right?.kind).toBe(status)
      }
    }
  }
})

test("conversation preview uses the insertion suffix and translates hits", () => {
  const body = "  const value = 1\n    run(value)"
  const item = complete(prepare([{ id: "code", text: body, saved: false, time: 1 }]), { text: "value", cursor: 5 })[0]
  expect(text(preview(item, 40))).toEqual(["value = 1", "    run(value)"])
  expect(preview(item, 40)[0].chunks[0].attributes).toBe(TextAttributes.BOLD | TextAttributes.UNDERLINE)
  expect(item.edit.text).toBe("value = 1\n    run(value)")
})

test("saved preview starts at the original beginning, not its search hit", () => {
  const item = saved("Please **inspect** this change.\n  Keep formatting.", "inspect")
  expect(text(preview(item, 50))).toEqual(["Please **inspect** this change.", "  Keep formatting."])
  expect(displayHits(item)).toEqual([{ start: 9, end: 16 }])
  expect(item.edit.text).toBe(item.entry.text)
  expect(displayHits(saved("**Please** [inspect](https://hidden) this change.", "Please inspect"))).toEqual([])
  expect(displayHits(saved("Review the changes.", "rvw"))).toEqual([])
  expect(displayHits(saved("Use &amp; now.", "& now"))).toEqual([])
  expect(displayHits(saved("**Ｃａｆｅ́**", "café"))).toEqual([{ start: 2, end: 7 }])
})

test.each([1, 2, 3])("%i display lines remain complete without a count", (count) => {
  const body = Array.from({ length: count }, (_, index) => `Line ${index}`).join("\n")
  expect(text(preview(saved(body), 30))).toEqual(body.split("\n"))
})

test("folding retains two head lines and the end of the final display line", () => {
  const item = saved("first\nsecond\nmiddle\nThe important ending")
  expect(text(preview(item, 24))).toEqual(["first", "second", "... ant ending (4 lines)"])
  expect(text(preview(saved("one\r\ntwo\r\nthree\r\n"), 30))).toEqual(["one", "two", "...  (4 lines)"])
  expect(item.edit.text).toBe(item.entry.text)
})

test("display count changes with width, not metadata added to the last row", () => {
  const item = saved("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
  expect(text(preview(item, 40))).toEqual([item.edit.text.slice(0, 40), item.edit.text.slice(40)])
  const narrow = text(preview(item, 16))
  expect(narrow[2]).toBe("... 89 (4 lines)")
  expect(narrow.every((line) => Bun.stringWidth(line) <= 16)).toBe(true)
})

test("unicode, indentation, blank lines and tabs survive display layout", () => {
  expect(text(preview(saved("😀é中\n\n\tend"), 20))).toEqual(["😀é中", "", "  end"])
  expect(text(preview(saved("😀é中"), 3))).toEqual(["😀é", "中"])
  const lines = text(preview(saved("👩‍💻".repeat(30)), 16))
  expect(lines.every((line) => Bun.stringWidth(line) <= 16)).toBe(true)
  expect(lines[2]).toEndWith("(4 lines)")
})

test("short viewports keep the head and respect their budget", () => {
  const item = saved("one\ntwo\nthree\nfour")
  expect(text(preview(item, 30, 1))).toEqual(["one… (4 lines)"])
  expect(text(preview(item, 30, 2))).toEqual(["one", "two… (4 lines)"])
})

test("window uses heights, keeps selection visible and retains total height", () => {
  const heights = [3, 1, 2, 3, 1, 1]
  const measure = (index: number) => heights[index]
  expect(suggestionWindow(6, 0, 0, 8, measure)).toEqual({
    start: 0,
    end: 3,
    height: 8,
  })
  expect(suggestionWindow(6, 3, 0, 8, measure)).toEqual({
    start: 1,
    end: 6,
    height: 8,
  })
  expect(suggestionWindow(6, 5, 1, 8, measure)).toEqual({
    start: 1,
    end: 6,
    height: 8,
  })
  expect(suggestionWindow(6, 0, 1, 8, measure)).toEqual({
    start: 0,
    end: 3,
    height: 8,
  })
  expect(
    suggestionWindow(0, 0, 0, 8, () => {
      throw new Error("Empty results must not be measured")
    }),
  ).toEqual({ start: 0, end: 0, height: 1 })
  let calls = 0
  const distant = suggestionWindow(10000, 9999, 0, 8, () => {
    calls++
    return 3
  })
  expect(distant.end).toBe(10000)
  expect(calls).toBeLessThan(60)
})

test("window fills its budget with complete candidate previews", () => {
  expect(suggestionWindow(1, 0, 0, 8, () => 3)).toEqual({ start: 0, end: 1, height: 3 })
  expect(suggestionWindow(2, 0, 0, 8, () => 3)).toEqual({ start: 0, end: 2, height: 6 })
  expect(suggestionWindow(2, 0, 0, 6, () => 3)).toEqual({ start: 0, end: 2, height: 6 })
  expect(suggestionWindow(2, 1, 0, 5, () => 3)).toEqual({ start: 1, end: 2, height: 5 })
  expect(suggestionWindow(8, 0, 0, 8, () => 1)).toEqual({ start: 0, end: 8, height: 8 })
  for (let budget = 1; budget <= 8; budget++) {
    const heights = [1, 3, 2, 1, 3, 3, 1].map((height) => Math.min(height, budget))
    for (let first = 0; first < heights.length; first++) {
      for (let selected = 0; selected < heights.length; selected++) {
        const view = suggestionWindow(heights.length, selected, first, budget, (index) => heights[index])
        const used = heights.slice(view.start, view.end).reduce((sum, height) => sum + height, 0)
        expect(view.start).toBeLessThanOrEqual(selected)
        expect(view.end).toBeGreaterThan(selected)
        expect(used).toBeLessThanOrEqual(view.height)
        expect(view.height).toBeLessThanOrEqual(budget)
        if (view.end < heights.length) expect(used + heights[view.end]).toBeGreaterThan(view.height)
      }
    }
  }
})

test("timestamps use local absolute dates without a source prefix", () => {
  const now = new Date(2026, 10, 15, 15, 0)
  expect(formatTime(new Date(2026, 10, 15, 9, 2).getTime(), now)).toBe("09:02")
  expect(formatTime(new Date(2026, 10, 14, 14, 32).getTime(), now)).toBe("11-14 14:32")
  expect(formatTime(new Date(2025, 0, 2, 14, 32).getTime(), now)).toBe("2025-01-02 14:32")
  expect(formatTime(NaN, now)).toBe("")
})
