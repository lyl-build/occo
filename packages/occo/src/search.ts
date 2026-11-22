import fuzzysort from "fuzzysort"
import type { TextEdit } from "./composer"
import type { SavedPrompt } from "./library"
import { extract } from "./extract"

export type Entry = {
  id: string
  text: string
  saved: boolean
  time: number
}
export type Query = {
  text: string
  start: number
  end: number
}
export type Hit = { start: number; end: number }
export type Match = {
  entry: Entry
  hits: Hit[]
  kind: number
  coverage: number
  position: number
  score: number
}
export type Completion = Match & {
  edit: TextEdit
  query: string
}
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" })

export function prepare(entries: readonly Entry[], saved: readonly SavedPrompt[] = []) {
  return [
    ...entries,
    ...saved.map(
      (prompt): Entry => ({
        id: `saved:${prompt.id}`,
        text: prompt.text,
        saved: true,
        time: prompt.updatedAt,
      }),
    ),
  ].map((entry) => {
    const readable = entry.saved ? extract(entry.text).join(" ") : entry.text
    const normalized = normalize(readable)
    return { entry, readable, ...normalized, fuzzy: fuzzysort.prepare(normalized.text) }
  })
}

export function rank(items: ReturnType<typeof prepare>, query: string, fuzzy = true): Match[] {
  const text = normalize(query).text.trim()
  return items
    .flatMap((item): Match[] => {
      const offset = item.text.indexOf(text)
      const found = offset < 0 && fuzzy ? fuzzysort.single(text, item.fuzzy) : undefined
      if (offset < 0 && (!found || found.score < 0.25)) return []
      const indexes = offset >= 0 ? Array.from({ length: text.length }, (_, i) => offset + i) : found!.indexes
      const hits: Hit[] = []
      indexes.forEach((index) => {
        const span = item.map[index]
        const previous = hits.at(-1)
        if (previous && span.start <= previous.end) {
          previous.end = Math.max(previous.end, span.end)
          return
        }
        hits.push({ ...span })
      })
      const first = hits[0]?.start ?? 0
      return [
        {
          entry: item.entry,
          hits,
          kind: offset >= 0 ? 0 : 1,
          coverage: text.length,
          position: first === 0 ? 0 : /[\p{L}\p{M}\p{N}_]$/u.test(item.readable.slice(0, first)) ? 2 : 1,
          score: offset >= 0 ? 1 : found!.score,
        },
      ]
    })
    .sort(compare)
}

export function complete(
  items: ReturnType<typeof prepare>,
  snapshot: { text: string; cursor: number },
  fuzzy = false,
): Completion[] {
  const results = queries(snapshot.text, snapshot.cursor)
    .flatMap((query) =>
      rank(items, query.text, fuzzy).map(
        (match): Completion => ({
          ...match,
          query: query.text,
          edit: {
            start: query.start,
            end: query.end,
            text: match.entry.saved ? match.entry.text : match.entry.text.slice(match.hits[0]?.start ?? 0),
          },
        }),
      ),
    )
    .sort(compare)
  const entries = new Set<string>()
  const drafts = new Map<string, Completion>()
  results.forEach((result) => {
    if (entries.has(result.entry.id)) return
    entries.add(result.entry.id)
    const draft = snapshot.text.slice(0, result.edit.start) + result.edit.text + snapshot.text.slice(result.edit.end)
    const previous = drafts.get(draft)
    if (!previous || (result.entry.saved && !previous.entry.saved)) drafts.set(draft, result)
  })
  return [...drafts.values()]
}

export function queries(text: string, cursor: number): Query[] {
  const start = text.lastIndexOf("\n", cursor - 1) + 1
  const line = text.slice(start, cursor)
  const word = line.match(/[\p{L}\p{M}\p{N}_-]+$/u)?.[0] ?? ""
  const tail = text.slice(cursor).match(/^[\p{L}\p{M}\p{N}_-]+/u)?.[0] ?? ""
  if (!line.trim()) return [{ text: "", start: cursor, end: cursor }]
  return [
    ...(word
      ? [
          {
            text: word,
            start: cursor - word.length,
            end: cursor + tail.length,
          },
        ]
      : []),
    ...(line.trimStart() !== word
      ? [
          {
            text: line.trimStart(),
            start: start + line.length - line.trimStart().length,
            end: cursor + tail.length,
          },
        ]
      : []),
  ]
}

export function automatic(query: Query[]) {
  return query.some(
    (item) =>
      !/\s$/.test(item.text) &&
      ((item.text.match(/\p{Script=Han}/gu)?.length ?? 0) >= 2 || /[a-zA-Z]{3}/.test(item.text)),
  )
}

function compare(a: Match, b: Match) {
  return (
    a.kind - b.kind ||
    b.coverage - a.coverage ||
    a.position - b.position ||
    b.score - a.score ||
    Number(b.entry.saved) - Number(a.entry.saved) ||
    b.entry.time - a.entry.time ||
    a.entry.id.localeCompare(b.entry.id)
  )
}

export function displayHits(item: Completion): Hit[] {
  if (!item.entry.saved) {
    const start = item.hits[0]?.start ?? 0
    return item.hits.map((hit) => ({ start: hit.start - start, end: hit.end - start }))
  }
  const query = normalize(item.query).text.trim()
  if (!query) return []
  const original = normalize(item.edit.text)
  const start = original.text.indexOf(query)
  if (start < 0) return []
  return [{ start: original.map[start].start, end: original.map[start + query.length - 1].end }]
}

function normalize(value: string) {
  const map: Hit[] = []
  let text = ""
  Array.from(graphemes.segment(value)).forEach((part) => {
    const normalized = part.segment.normalize("NFKC").toLowerCase().replace(/\s+/g, " ")
    Array.from({ length: normalized.length }, (_, index) => {
      const char = normalized[index]
      if (char === " " && text.endsWith(" ")) {
        map.at(-1)!.end = part.index + part.segment.length
        return
      }
      text += char
      map.push({ start: part.index, end: part.index + part.segment.length })
    })
  })
  return { text, map }
}
