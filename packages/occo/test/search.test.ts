import { expect, test } from "bun:test"
import { automatic, complete, prepare, queries, rank, type Entry } from "../src/search"
import { conversation } from "../src/history"
import { extract } from "../src/extract"

function entry(text: string, id = text): Entry {
  return { id, text, saved: false, time: 1 }
}
function lookup(text: string, input: string, cursor = input.length) {
  return complete(prepare([entry(text)]), { text: input, cursor })
}

test("completed user and assistant text only", () => {
  const users = Array.from({ length: 250 }, (_, i) => ({
    id: `msg_${i}`,
    type: "user" as const,
    text: `User ${i}.`,
    time: { created: i },
  }))
  expect(users.flatMap(conversation).map((item) => item.text)).toEqual(users.map((message) => message.text))
  const assistant = {
    id: "assistant",
    type: "assistant" as const,
    time: { created: 1, completed: 2 },
    agent: "build",
    model: { id: "fixture", providerID: "test" },
    content: [
      { type: "text" as const, text: "Visible answer." },
      { type: "reasoning" as const, text: "Hidden" },
    ],
  }
  expect(conversation(assistant).map((item) => item.text)).toEqual(["Visible answer."])
  expect(conversation({ ...assistant, time: { created: 1 } })).toEqual([])
})

test("query ranges preserve right-hand text and cover the current word tail", () => {
  expect(queries("prefix rev tail", 9)).toEqual([
    { text: "re", start: 7, end: 10 },
    { text: "prefix re", start: 0, end: 10 },
  ])
  expect(lookup("Review this change.", "Review this KEEP THIS TAIL", 11)[0].edit).toEqual({
    start: 0,
    end: 11,
    text: "Review this change.",
  })
  expect(lookup("review carefully", "prefix rev tail", 9)[0].edit).toEqual({
    start: 7,
    end: 10,
    text: "review carefully",
  })
  expect(lookup("anything", "  tail", 2)[0].edit).toEqual({
    start: 2,
    end: 2,
    text: "anything",
  })
})

test("automatic thresholds exclude trailing whitespace; manual enables fuzzy", () => {
  expect(automatic(queries("中文", 2))).toBe(true)
  for (const input of ["中", "ab", "abc ", "中文\t", "  "]) expect(automatic(queries(input, input.length))).toBe(false)
  const items = prepare([entry("Review the changes.")])
  expect(complete(items, { text: "rvw", cursor: 3 })).toEqual([])
  expect(complete(items, { text: "rvw", cursor: 3 }, true)).toHaveLength(1)
})

test("phrase coverage precedes word-only matches and recency", () => {
  const result = complete(prepare([entry("this other thing"), entry("Please Review this change.")]), {
    text: "Review this",
    cursor: 11,
  })
  expect(result[0].entry.text).toBe("Please Review this change.")
  expect(result[0].query).toBe("Review this")
  expect(result[0].edit.text).toBe("Review this change.")
})

test.each([
  ["İabc", "abc", "abc"],
  ["ＡＢＣ remainder", "abc", "ＡＢＣ remainder"],
  ["Cafe\u0301 next", "é", "e\u0301 next"],
  ["ﬃ next", "fi", "ﬃ next"],
  ["a   b next", "a b", "a   b next"],
])("normalized offsets map to original graphemes: %s", (text, query, expected) => {
  const result = lookup(text, query)[0]
  expect(result.edit.text).toBe(expected)
  expect(result.hits[0].end).toBeLessThanOrEqual(text.length)
})

test.each([
  ["Do not delete the cache.", "delete", "delete the cache."],
  ["avoid deletion.", "let", "letion."],
  ["  const value = 1\n    run(value)", "value", "value = 1\n    run(value)"],
  ["<div>HTML source</div>", "HTML", "HTML source</div>"],
] as const)("continuation always starts at the hit: %s", (text, query, expected) => {
  expect(lookup(text, query, query.length)[0].edit.text).toBe(expected)
  expect(lookup(text, query, query.length)[0].entry.text).toBe(text)
})

test("saved prompts use readable search projection and preserve the entire original body", () => {
  const prompt = {
    id: "s",
    title: "zzzzlegacyalias",
    text: "**Please** [inspect](https://hidden.example) this diff.\nKeep the full body.",
    updatedAt: 1,
  }
  const items = prepare([], [prompt])
  expect(rank(items, "zzzzlegacyalias")).toEqual([])
  expect(rank(items, "hidden.example", false)).toEqual([])
  expect(rank(items, "Please inspect", false)).toHaveLength(1)
  expect(complete(items, { text: "inspect", cursor: 7 })[0].edit.text).toBe(prompt.text)
})

test("deduplicate final drafts, preserve saved source, retain distinct code", () => {
  const result = complete(
    prepare(
      [entry("Review this change."), entry("this change.")],
      [{ id: "s", text: "Review this change.", updatedAt: 1 }],
    ),
    { text: "Review this", cursor: 11 },
  )
  expect(result).toHaveLength(1)
  expect(result[0].entry.saved).toBe(true)
  expect(
    complete(prepare([entry("value = 1", "a"), entry("value = 2", "b")]), { text: "value", cursor: 5 }),
  ).toHaveLength(2)
})

test("manual empty search returns all entries, saved and newest first", () => {
  const items = prepare(
    Array.from({ length: 26 }, (_, i) => entry(`Conversation ${i}`)),
    [
      { id: "old", text: "old", updatedAt: 1 },
      { id: "new", text: "new", updatedAt: 2 },
    ],
  )
  const result = complete(items, { text: "", cursor: 0 }, true)
  expect(result).toHaveLength(28)
  expect(result.slice(0, 2).map((item) => item.entry.id)).toEqual(["saved:new", "saved:old"])
})

test.each([1000, 10000])("%i fragments: separate extraction, preparation and query timings", (count) => {
  const markdown = Array.from({ length: count }, (_, i) => `Review ${i} carefully `.padEnd(199, "x") + ".").join("\n\n")
  const extractionStart = performance.now()
  const fragments = extract(markdown)
  const extraction = performance.now() - extractionStart
  const preparationStart = performance.now()
  const prepared = prepare(fragments.map((part, i) => entry(part, String(i))))
  const preparation = performance.now() - preparationStart
  const snapshot = { text: "review", cursor: 6 }
  Array.from({ length: 30 }, () => complete(prepared, snapshot, true))
  const timings = Array.from({ length: 100 }, () => {
    const start = performance.now()
    complete(prepared, snapshot, true)
    return performance.now() - start
  }).sort((a, b) => a - b)
  console.log(
    `${count} fragments: extraction ${extraction.toFixed(2)}ms; prepare ${preparation.toFixed(2)}ms; query p95 ${timings[94].toFixed(2)}ms; Bun ${Bun.version} ${process.platform} ${process.arch}`,
  )
  expect(fragments).toHaveLength(count)
  expect(timings[94]).toBeLessThanOrEqual(count === 1000 ? 20 : 100)
})
