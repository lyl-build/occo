import { BoxRenderable, TextRenderable, StyledText, TextAttributes, RGBA, type TextChunk } from "@opentui/core"
import type { Context } from "@opencode/plugin/tui/context"
import { createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js"
import { type bindComposer, type Snapshot } from "./composer"
import { automatic, queries, complete, displayHits, type Completion, type prepare } from "./search"
import type { conversationHistory } from "./history"
import { copy } from "./copy"

export function suggestions(
  context: Context,
  composer: ReturnType<typeof bindComposer>,
  items: () => ReturnType<typeof prepare>,
  enabled: () => boolean,
  save: (text: string) => void,
  history: Pick<ReturnType<typeof conversationHistory>, "status" | "retry">,
) {
  const [open, setOpen] = createSignal(false)
  const colors = createMemo(() => {
    const dialog = context.theme.surface("dialog")
    const footer = context.theme.surface("dialog.footer")
    return {
      background: dialog.background.base,
      alternate: alternateBackground(dialog.background.base, context.themeMode),
      text: dialog.text.base,
      muted: dialog.text.muted,
      border: dialog.border.base,
      selectedBackground: dialog.background.action.primary.focused,
      selectedText: dialog.text.action.primary.focused,
      footerBackground: footer.background.base,
      footerText: footer.text.base,
      footerMuted: footer.text.muted,
      footerWarning: footer.text.feedback.warning.base,
    }
  })
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
  let results: Completion[] = []
  let selected = 0
  let manual = false
  let disposed = false
  let bounds = ""
  let first = 0
  let layoutKey = ""
  let timeColumns = 0
  let now = new Date()
  const layouts = new Map<number, StyledText[]>()

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
    popup.backgroundColor = colors().background
    const width = Math.max(1, Math.min(anchor.width, context.renderer.width - anchor.x))
    popup.width = width
    popup.left = Math.max(0, anchor.x)
    const padding = context.renderer.width < 44 ? 1 : 2
    const budget = Math.min(8, anchor.y - 1)
    // Reserve the left marker, two emoji columns and the existing right padding.
    const contentWidth = width - 1 - 2 - 2
    const clockWidth = Math.max(0, Math.min(timeColumns, contentWidth - 1 - 12))
    const bodyWidth = Math.max(1, contentWidth - (clockWidth ? clockWidth + 1 : 0))
    const key = `${bodyWidth}:${budget}`
    if (key !== layoutKey) layouts.clear()
    layoutKey = key
    const lines = (index: number) => {
      const cached = layouts.get(index)
      if (cached) return cached
      const value = preview(results[index], bodyWidth, Math.min(3, budget))
      layouts.set(index, value)
      return value
    }
    const view = suggestionWindow(results.length, selected, first, budget, (index) => lines(index).length)
    first = view.start
    if (!results.length) {
      const empty = new BoxRenderable(context.renderer, {
        height: 1,
        flexShrink: 0,
        paddingLeft: padding,
        paddingRight: 1,
      })
      empty.add(
        new TextRenderable(context.renderer, {
          content: history.status() === "ready" ? copy.empty : copy.noSuggestions,
          height: 1,
          fg: colors().muted,
          truncate: true,
        }),
      )
      popup.add(empty)
    }
    results.slice(view.start, view.end).forEach((item, index) => {
      const position = view.start + index
      const highlighted = selected === position
      const content = lines(position)
      const row = new BoxRenderable(context.renderer, {
        id: `occo.candidate.${position}`,
        height: content.length,
        flexDirection: "row",
        flexShrink: 0,
        paddingLeft: 1,
        paddingRight: 2,
        backgroundColor: highlighted
          ? colors().selectedBackground
          : position % 2
            ? colors().alternate
            : colors().background,
        onMouseDown(event) {
          event.preventDefault()
          event.stopPropagation()
        },
        onMouseUp(event) {
          event.preventDefault()
          event.stopPropagation()
          if (event.button !== 0) return
          selected = position
          paint()
        },
      })
      row.add(
        new TextRenderable(context.renderer, {
          content: item.entry.saved ? "⭐" : "💬",
          width: 2,
          height: 1,
          flexShrink: 0,
          selectable: false,
          fg: highlighted ? colors().selectedText : colors().text,
        }),
      )
      row.add(
        new TextRenderable(context.renderer, {
          content: new StyledText(
            content.flatMap((line, index) => [
              ...(index ? [{ text: "\n", __isChunk: true as const }] : []),
              ...line.chunks,
            ]),
          ),
          height: content.length,
          width: bodyWidth,
          flexShrink: 0,
          wrapMode: "none",
          truncate: true,
          selectable: false,
          fg: highlighted ? colors().selectedText : colors().text,
        }),
      )
      if (clockWidth)
        row.add(
          new TextRenderable(context.renderer, {
            content: fitChunks([{ text: formatTime(item.entry.time, now), __isChunk: true }], clockWidth)
              .map((chunk) => chunk.text)
              .join(""),
            width: clockWidth,
            marginLeft: 1,
            height: 1,
            flexShrink: 0,
            wrapMode: "none",
            truncate: true,
            selectable: false,
            textAlign: "right",
            fg: highlighted ? colors().selectedText : colors().muted,
          }),
        )
      edges(row, content.length, position === view.start, position === view.end - 1)
      popup.add(row)
    })
    const used = results
      .slice(view.start, view.end)
      .reduce((height, _, index) => height + lines(view.start + index).length, 0)
    if (results.length && used < view.height)
      popup.add(new BoxRenderable(context.renderer, { height: view.height - used, flexShrink: 0 }))
    const controls = new BoxRenderable(context.renderer, {
      id: "occo.footer",
      flexDirection: "row",
      height: 1,
      flexShrink: 0,
      paddingLeft: padding,
      paddingRight: 2,
      gap: 2,
      backgroundColor: colors().footerBackground,
    })
    const footer = suggestionFooter(width - padding - 2, selected, results.length, history.status())
    footer.left.forEach((action) =>
      controls.add(
        new TextRenderable(context.renderer, {
          id: `occo.footer.${action.action}`,
          content: new StyledText([
            { text: action.key, fg: colors().footerText, __isChunk: true },
            {
              text: action.label ? ` ${action.label}` : "",
              fg: colors().footerMuted,
              __isChunk: true,
            },
          ]),
          selectable: false,
          height: 1,
          minWidth: 0,
          wrapMode: "none",
          truncate: true,
          flexShrink: 0,
          onMouseDown(event) {
            event.preventDefault()
            event.stopPropagation()
          },
          onMouseUp(event) {
            event.preventDefault()
            event.stopPropagation()
            if (event.button !== 0) return
            if (action.action === "insert") accept()
            if (action.action === "close") close(true)
            if (action.action === "save") saveSelected()
          },
        }),
      ),
    )
    if (footer.right)
      controls.add(
        new TextRenderable(context.renderer, {
          id: "occo.footer.state",
          content: footer.right.text,
          fg: footer.right.kind === "failed" ? colors().footerWarning : colors().footerMuted,
          height: 1,
          flexGrow: 1,
          textAlign: "right",
          wrapMode: "none",
          selectable: false,
        }),
      )
    popup.add(controls)
    const height = view.height + 1
    popup.height = height
    // Renderable.height is measured on the next layout pass, not by its setter.
    popup.top = anchor.y - height
    popup.visible = true
    bounds = `${anchor.x}:${anchor.y}:${anchor.width}:${context.renderer.width}:${context.renderer.height}`
  }

  function edges(row: BoxRenderable, height: number, first: boolean, last: boolean) {
    // Decorations occupy existing padding and belong to the row, so clicks still bubble to its handler.
    ;[false, true].forEach((right) =>
      row.add(
        new TextRenderable(context.renderer, {
          id: `occo.edge.${row.num}.${right}`,
          position: "absolute",
          left: right ? undefined : 0,
          right: right ? 0 : undefined,
          top: 0,
          width: 1,
          height,
          content: Array.from({ length: height }, (_, line) => {
            if (first && last && height === 1) return "-"
            if (first && !line) return right ? "┐" : "┌"
            if (last && line === height - 1) return right ? "┘" : "└"
            return "│"
          }).join("\n"),
          fg: colors().border,
          bg: colors().background,
          wrapMode: "none",
          selectable: false,
        }),
      ),
    )
  }

  function show() {
    const current = composer.current()
    if (!current) return close()
    const previous = results[selected]?.entry.id
    const changed =
      !snapshot ||
      snapshot.session !== current.session ||
      JSON.stringify(queries(snapshot.text, snapshot.cursor)) !== JSON.stringify(queries(current.text, current.cursor))
    snapshot = current
    results = complete(items(), current, manual)
    layouts.clear()
    now = new Date()
    timeColumns = results.reduce((width, item) => {
      const date = new Date(item.entry.time)
      if (!Number.isFinite(date.getTime())) return width
      return Math.max(
        width,
        date.getFullYear() !== now.getFullYear() ? 16 : date.toDateString() !== now.toDateString() ? 11 : 5,
      )
    }, 0)
    const retained = results.findIndex((item) => item.entry.id === previous)
    selected = changed ? 0 : retained >= 0 ? retained : Math.min(selected, Math.max(0, results.length - 1))
    if (changed) first = 0
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
    history.retry()
    snapshot = undefined
    show()
  }

  function accept() {
    const item = results[selected]
    const target = snapshot
    if (!item || !target) return
    close(true)
    const result = composer.apply(target, item.edit)
    if (result !== "applied")
      context.ui.toast.show({
        message: result === "protected" ? copy.protected : copy.stale,
        variant: "warning",
      })
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
    history.status()
    enabled()
    context.keymap.mode.current()
    context.ui.router.current()
    untrack(refresh)
  })
  createEffect(() => {
    colors()
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

export function alternateBackground(background: RGBA, mode: "dark" | "light") {
  const lightness =
    (Math.max(background.r, background.g, background.b) + Math.min(background.r, background.g, background.b)) / 2
  const adjusted = Math.max(0, Math.min(1, lightness + (mode === "dark" ? 0.08 : -0.08)))
  // Scaling RGB offsets from HSL lightness preserves hue and saturation, including across L = 0.5.
  const scale =
    lightness > 0 && lightness < 1 ? Math.min(adjusted, 1 - adjusted) / Math.min(lightness, 1 - lightness) : 0
  return RGBA.fromValues(
    adjusted + (background.r - lightness) * scale,
    adjusted + (background.g - lightness) * scale,
    adjusted + (background.b - lightness) * scale,
    background.a,
  )
}

export function suggestionFooter(
  width: number,
  selected: number,
  total: number,
  status: "loading" | "ready" | "failed",
) {
  const actions = [
    ...(total
      ? [
          { key: "Enter", label: copy.insert, action: "insert" as const },
          { key: "Ctrl+S", label: copy.save, action: "save" as const },
        ]
      : []),
    { key: "Esc", label: copy.close, action: "close" as const },
  ]
  const primary = actions.filter((item) => item.action !== "save")
  const compact = primary.map((item) => ({ ...item, label: "" }))
  const right =
    status === "loading"
      ? { text: copy.historyLoading, kind: status }
      : status === "failed"
        ? { text: copy.historyFailed, kind: status }
        : total > 1
          ? { text: `↑↓ ${selected + 1}/${total}`, kind: status }
          : undefined
  const short = right && {
    kind: right.kind,
    text:
      status === "loading"
        ? copy.historyLoadingShort
        : status === "failed"
          ? copy.historyFailedShort
          : `${selected + 1}/${total}`,
  }
  const essential = compact.slice(0, 1)
  // Ordered layouts preserve whole labels, without truncation or width-specific breakpoints.
  return [
    ...(status === "failed"
      ? [
          {
            left: actions,
            right: {
              text: `${copy.historyFailed} · ${copy.historyRetry}`,
              kind: status,
            },
          },
        ]
      : []),
    { left: actions, right },
    { left: primary, right },
    { left: compact, right },
    { left: compact, right: short },
    ...(status === "ready" ? [{ left: compact, right: undefined }] : []),
    { left: essential, right: short },
    { left: essential, right: undefined },
    { left: [], right: undefined },
  ].find(
    (layout) =>
      Bun.stringWidth(
        [
          ...layout.left.map((item) => item.key + (item.label ? ` ${item.label}` : "")),
          ...(layout.right ? [layout.right.text] : []),
        ].join("  "),
      ) <= Math.max(0, width),
  )!
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" })

export function preview(item: Completion, width: number, limit = 3) {
  const hits = displayHits(item)
  const lines: { chunks: TextChunk[]; width: number }[] = [{ chunks: [], width: 0 }]
  Array.from(graphemes.segment(item.edit.text)).forEach((part) => {
    if (/^(?:\r\n|\r|\n)$/.test(part.segment)) {
      lines.push({ chunks: [], width: 0 })
      return
    }
    const text = part.segment === "\t" ? "  " : part.segment
    const columns = Bun.stringWidth(text)
    if (lines.at(-1)!.width && lines.at(-1)!.width + columns > width) lines.push({ chunks: [], width: 0 })
    lines.at(-1)!.chunks.push({
      text,
      __isChunk: true,
      attributes: hits.some((hit) => hit.start <= part.index && hit.end > part.index)
        ? TextAttributes.BOLD | TextAttributes.UNDERLINE
        : 0,
    })
    lines.at(-1)!.width += columns
  })
  if (lines.length <= limit) return lines.map((line) => new StyledText(line.chunks))
  const prefix = limit === 3 ? "... " : ""
  const suffix =
    lines.length > 3 && Bun.stringWidth(`${prefix} (${lines.length} lines)`) <= width ? ` (${lines.length} lines)` : ""
  const marker = limit === 3 ? prefix : "…"
  const content = fitChunks(
    lines[limit === 3 ? lines.length - 1 : limit - 1].chunks,
    Math.max(0, width - Bun.stringWidth(marker + suffix)),
    limit === 3,
  )
  const muted = (text: string): TextChunk => ({
    text,
    __isChunk: true,
    attributes: TextAttributes.DIM,
  })
  return [
    ...lines.slice(0, limit - 1).map((line) => new StyledText(line.chunks)),
    new StyledText(limit === 3 ? [muted(marker), ...content, muted(suffix)] : [...content, muted(marker + suffix)]),
  ]
}

function fitChunks(chunks: readonly TextChunk[], width: number, tail = false) {
  const pieces = chunks.flatMap((chunk) =>
    Array.from(graphemes.segment(chunk.text), (part) => ({
      ...chunk,
      text: part.segment,
    })),
  )
  const result: TextChunk[] = []
  let used = 0
  for (const chunk of tail ? pieces.toReversed() : pieces) {
    const columns = Bun.stringWidth(chunk.text)
    if (used + columns > width) break
    used += columns
    result.push(chunk)
  }
  return tail ? result.reverse() : result
}

export function formatTime(time: number, now: Date) {
  const date = new Date(time)
  if (!Number.isFinite(date.getTime())) return ""
  const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
  if (date.toDateString() === now.toDateString()) return clock
  const day = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  return `${date.getFullYear() === now.getFullYear() ? "" : `${date.getFullYear()}-`}${day} ${clock}`
}

export function suggestionWindow(
  total: number,
  selected: number,
  first: number,
  budget: number,
  measure: (index: number) => number,
) {
  if (!total) return { start: 0, end: 0, height: 1 }
  let height = 0
  for (let index = 0; index < total && height < budget; index++) height += measure(index)
  height = Math.max(1, Math.min(budget, height))
  let start = Math.max(0, Math.min(first, selected))
  // Every candidate occupies at least one row; a distant selection never needs an all-results scan.
  if (selected - start >= height) start = selected - height + 1
  while (
    Array.from({ length: selected - start + 1 }, (_, index) => measure(start + index)).reduce(
      (sum, value) => sum + value,
      0,
    ) > height
  )
    start++
  let used = 0
  let end = start
  while (end < total && used + measure(end) <= height) used += measure(end++)
  return { start, end, height }
}
