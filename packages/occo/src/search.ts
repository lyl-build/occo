import type { Context } from "@opencode/plugin/tui/context"
import { marked, type Token, type Tokens } from "marked"
import fuzzysort from "fuzzysort"
import type { TextEdit } from "./composer"
import type { SavedPrompt } from "./library"

export type Entry = { id: string; text: string; saved: boolean; updatedAt: number }
export type Query = { text: string; start: number; end: number; range: "word" | "line" | "cursor" }
export type Candidate = { entry: Entry; edit: TextEdit; range: Query["range"] }

export function conversation(
  messages: ReadonlyArray<ReturnType<Context["data"]["session"]["message"]["list"]>[number]>,
): Entry[] {
  return messages
    .filter(
      (message) => message.type === "user" || (message.type === "assistant" && message.time.completed !== undefined),
    )
    .slice(-10)
    .flatMap((message) => {
      const text =
        message.type === "user"
          ? message.text
          : message.type === "assistant"
            ? message.content
                .filter((item) => item.type === "text")
                .map((item) => item.text)
                .join("\n\n")
            : ""
      return fragments(text).map((text, index) => ({
        id: `${message.id}:${index}`,
        text,
        saved: false,
        updatedAt: message.time.created,
      }))
    })
}

export function fragments(text: string): string[] {
  const visit = (tokens: Token[]): string[] =>
    tokens.flatMap((token) => {
      if (token.type === "code") return [(token as Tokens.Code).text]
      if (token.type === "blockquote") return visit((token as Tokens.Blockquote).tokens)
      if (token.type === "list") return (token as Tokens.List).items.flatMap((item) => visit(item.tokens))
      if (token.type === "paragraph" || token.type === "heading" || token.type === "text")
        return (token as Tokens.Paragraph).text
          .split(/(?<=[.!?。！？])(?:\s+|(?=[\p{Script=Han}]))|\n\s*\n/u)
          .map((part) => part.trim())
          .filter(Boolean)
      return []
    })
  return visit(marked.lexer(text)).filter((part) => part.trim().length > 0)
}

export function queries(text: string, cursor: number): Query[] {
  const start = text.lastIndexOf("\n", cursor - 1) + 1
  const end = text.indexOf("\n", cursor)
  const line = text.slice(start, cursor)
  const word = line.match(/[\p{L}\p{M}\p{N}_-]+$/u)?.[0] ?? ""
  const tail = text.slice(cursor).match(/^[\p{L}\p{M}\p{N}_-]+/u)?.[0] ?? ""
  if (!line.trim()) return [{ text: "", start: cursor, end: cursor, range: "cursor" }]
  return [
    ...(word ? [{ text: word, start: cursor - word.length, end: cursor + tail.length, range: "word" as const }] : []),
    {
      text: line.trimStart(),
      start: start + line.length - line.trimStart().length,
      end: end < 0 ? text.length : end,
      range: "line" as const,
    },
  ]
}

export function automatic(query: Query[]) {
  return query.some((item) => (item.text.match(/\p{Script=Han}/gu)?.length ?? 0) >= 2 || /[a-zA-Z]{3}/.test(item.text))
}

export function index(entries: Entry[], saved: readonly SavedPrompt[]) {
  return [...entries, ...saved.map((prompt) => ({ ...prompt, saved: true }))].map((entry) => ({
    entry,
    text: fuzzysort.prepare(entry.text),
  }))
}

export function search(items: ReturnType<typeof index>, query: Query[], limit = 8): Candidate[] {
  const results = items
    .flatMap((item) =>
      query.flatMap((query) => {
        const best = match(query.text, item.text)
        if (!best) return []
        const text = item.entry.saved ? item.entry.text : item.entry.text.slice(best.offset)
        return [
          {
            entry: item.entry,
            edit: { start: query.start, end: query.end, text },
            range: query.range,
            kind: best.kind,
            score: best.score,
            width: query.end - query.start,
          },
        ]
      }),
    )
    .sort(
      (a, b) =>
        a.kind - b.kind ||
        b.score - a.score ||
        a.width - b.width ||
        Number(b.entry.saved) - Number(a.entry.saved) ||
        b.entry.updatedAt - a.entry.updatedAt ||
        a.entry.id.localeCompare(b.entry.id),
    )
  const unique = new Map<string, (typeof results)[number]>()
  results.forEach((result) => {
    const previous = unique.get(result.edit.text)
    if (!previous) unique.set(result.edit.text, result)
    if (previous && result.entry.saved && !previous.entry.saved)
      unique.set(result.edit.text, { ...previous, entry: result.entry })
  })
  return [...unique.values()].slice(0, limit).map(({ entry, edit, range }) => ({ entry, edit, range }))
}

function match(query: string, value: Fuzzysort.Prepared) {
  if (!query) return { kind: 0, score: 1, offset: 0 }
  const offset = value.target.search(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"))
  if (offset >= 0) return { kind: offset === 0 ? 0 : 1, score: 1, offset }
  const fuzzy = fuzzysort.single(query, value)
  if (!fuzzy || fuzzy.score < 0.25) return
  return { kind: 2, score: fuzzy.score, offset: fuzzy.indexes[0] }
}
