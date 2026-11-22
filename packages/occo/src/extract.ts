import { marked, type Token, type Tokens } from "marked"
import { decodeHTML } from "entities"

const sentences = new Intl.Segmenter("en", { granularity: "sentence" })

export function extract(markdown: string): string[] {
  return blocks(marked.lexer(markdown)).filter((text) => text.trim())
}

function blocks(tokens: Token[]): string[] {
  return tokens.flatMap((token): string[] => {
    if (token.type === "code" || token.type === "html") return [token.text]
    if (token.type === "blockquote") return blocks((token as Tokens.Blockquote).tokens)
    if (token.type === "list") return (token as Tokens.List).items.flatMap((item) => blocks(item.tokens))
    if (token.type === "table") {
      const table = token as Tokens.Table
      return [
        ...table.header.flatMap((cell) => prose(cell.tokens)),
        ...table.rows.flatMap((row) => row.flatMap((cell) => prose(cell.tokens))),
      ]
    }
    if (token.type === "heading") return prose((token as Tokens.Heading).tokens, false)
    if (token.type === "paragraph" || token.type === "text")
      return prose(token.tokens ?? marked.Lexer.lexInline(token.text))
    return []
  })
}

function inline(tokens: Token[]): { text: string; protected: boolean; break?: boolean }[] {
  return tokens.flatMap((token) => {
    if (token.type === "br") return [{ text: "", protected: false, break: true }]
    if (token.type === "codespan" || token.type === "html" || token.type === "escape")
      return [{ text: token.text, protected: true }]
    if ("tokens" in token && token.tokens) return inline(token.tokens)
    if (token.type === "text") return [{ text: decodeHTML(token.text).replace(/\s+/g, " "), protected: false }]
    return []
  })
}

function prose(tokens: Token[], split = true): string[] {
  const lines: { text: string; protected: [number, number][] }[] = [{ text: "", protected: [] }]
  inline(tokens).forEach((part) => {
    if (part.break) return void lines.push({ text: "", protected: [] })
    const line = lines.at(-1)!
    // Collapse prose whitespace across token boundaries, but never rewrite code or HTML.
    const text = !part.protected && /\s$/.test(line.text) ? part.text.replace(/^\s+/, "") : part.text
    if (part.protected) line.protected.push([line.text.length, line.text.length + text.length])
    line.text += text
  })
  return lines.flatMap((line) => {
    if (!split) return [line.text.trim()]
    const protectedRanges = [
      ...line.protected,
      ...Array.from(line.text.matchAll(/(?:https?:\/\/|www\.)\S+|\d+(?:[.,]\d+)+/g), (match): [number, number] => [
        match.index,
        match.index + match[0].length,
      ]),
    ]
    const result: string[] = []
    let start = 0
    Array.from(sentences.segment(line.text)).forEach((segment) => {
      const end = segment.index + segment.segment.length
      const boundary = line.text.slice(0, end).trimEnd().length
      if (
        end < line.text.length &&
        (protectedRanges.some(([from, to]) => boundary > from && boundary < to) ||
          /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|e\.g|i\.e|vs|etc)|\b[A-Z])\.$/i.test(line.text.slice(start, boundary)))
      )
        return
      result.push(line.text.slice(start, end).trim())
      start = end
    })
    return result
  })
}
