import { expect, test } from "bun:test"
import { automatic, conversation, fragments, index, queries, search } from "../src/search"

test("only the last ten completed user/assistant messages are indexed", () => {
  const users = Array.from({ length: 12 }, (_, i) => ({
    id: `msg_${i}`,
    type: "user" as const,
    text: `User ${i}.`,
    time: { created: i },
  }))
  expect(conversation(users).map((entry) => entry.text)).toEqual(users.slice(-10).map((message) => message.text))
  expect(
    conversation([
      {
        id: "msg_complete",
        type: "assistant",
        time: { created: 12, completed: 13 },
        agent: "build",
        model: { id: "fixture", providerID: "test" },
        content: [
          { type: "reasoning", text: "Hidden reasoning" },
          { type: "text", text: "Visible answer." },
        ],
      },
      {
        id: "msg_stream",
        type: "assistant",
        time: { created: 14 },
        agent: "build",
        model: { id: "fixture", providerID: "test" },
        content: [{ type: "text", text: "Still streaming" }],
      },
    ]).map((entry) => entry.text),
  ).toEqual(["Visible answer."])
})

test("case folding does not shift Unicode insertion offsets", () => {
  const result = search(index([{ id: "u", text: "İabc", saved: false, updatedAt: 1 }], []), queries("abc", 3))[0]
  expect(result.edit.text).toBe("abc")
})

test("Markdown separates prose from code without destroying indentation", () => {
  expect(
    fragments("Hello world. Next sentence!\n\n你好世界。继续测试！\n\n```ts\n  const x = 1\n    run(x)\n```"),
  ).toEqual(["Hello world.", "Next sentence!", "你好世界。", "继续测试！", "  const x = 1\n    run(x)"])
})
test("word and line queries preserve middle-of-line ranges", () => {
  expect(queries("prefix rev tail", 9)).toEqual([
    { text: "re", start: 7, end: 10, range: "word" },
    { text: "prefix re", start: 0, end: 15, range: "line" },
  ])
  expect(automatic(queries("中文", 2))).toBe(true)
  expect(automatic(queries("中", 1))).toBe(false)
  expect(automatic(queries("ab", 2))).toBe(false)
})
test("legacy titles are ignored; body matches insert the complete body", () => {
  const prompt = {
    id: "s",
    title: "zzzzlegacyalias",
    text: "Please inspect this diff.\nKeep the full body.",
    updatedAt: 1,
  }
  expect(search(index([], [prompt]), queries("zzzzlegacyalias", 15))).toEqual([])
  expect(search(index([], [prompt]), queries("inspect", 7))[0].edit.text).toBe(prompt.text)
})
test("one ranking, smaller range wins; duplicate insertions retain saved identity", () => {
  const saved = { id: "s", text: "review carefully", updatedAt: 1 }
  const history = { id: "h", text: "review carefully", updatedAt: 5, saved: false }
  const results = search(index([history], [saved]), queries("please review", 13))
  expect(results).toHaveLength(1)
  expect(results[0].entry.saved).toBe(true)
  expect(results[0].range).toBe("word")
  expect(results[0].edit).toEqual({ start: 7, end: 13, text: "review carefully" })
})
test("conversation inserts from match but retains original fragment", () => {
  const source = {
    id: "h",
    text: "Let's review carefully",
    updatedAt: 5,
    saved: false,
  }
  const result = search(index([source], []), queries("review", 6))[0]
  expect(result.edit.text).toBe("review carefully")
  expect(result.entry.text).toBe(source.text)
})
test("empty manual query orders saved prompts by update before conversation", () => {
  const items = index(
    [{ id: "c", text: "conversation", updatedAt: 10, saved: false }],
    [
      { id: "old", text: "old", updatedAt: 1 },
      { id: "new", text: "new", updatedAt: 2 },
    ],
  )
  expect(search(items, queries("", 0)).map((item) => item.entry.id)).toEqual(["new", "old", "c"])
})
test("1,000 fragments / 200KB query benchmark", () => {
  const entries = Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    text: `Review ${i} carefully. Inspect the change and preserve behavior. `.padEnd(200, "x"),
    saved: false,
    updatedAt: i,
  }))
  expect(entries.reduce((sum, entry) => sum + Buffer.byteLength(entry.text), 0)).toBe(200000)
  const prepared = index(entries, [])
  const query = queries("review", 6)
  Array.from({ length: 30 }, () => search(prepared, query))
  const timings = Array.from({ length: 100 }, () => {
    const start = performance.now()
    search(prepared, query)
    return performance.now() - start
  }).sort((a, b) => a - b)
  console.log(`Search p95: ${timings[94].toFixed(2)}ms; ${process.platform} ${process.arch}; Bun ${Bun.version}`)
  expect(timings[94]).toBeLessThanOrEqual(20)
})
