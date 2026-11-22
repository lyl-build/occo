import type { Context } from "@opencode/plugin/tui/context"
import { TextAttributes, type TextareaRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { copy } from "./copy"
import type { Library, SavedPrompt } from "./library"
import { prepare, rank } from "./search"
import type { Snapshot } from "./composer"

export function libraryDialog(
  context: Context,
  library: Library,
  target: Snapshot | undefined,
  insert: (target: Snapshot, text: string) => void,
  signal: AbortSignal,
) {
  let current: string | undefined
  const preview = (prompt: SavedPrompt) => {
    if (signal.aborted) return
    current = prompt.id
    context.ui.dialog.show(() => {
      context.ui.dialog.set({ size: "large", centered: true })
      onCleanup(closeOnAbort(context, signal))
      const dimensions = useTerminalDimensions()
      const [lines, setLines] = createSignal(prompt.text.split("\n").length)
      let scroll: ScrollBoxRenderable
      context.keymap.layer(() => ({
        mode: "modal",
        priority: 1000,
        commands: [
          { bind: "up", run: () => scroll.scrollBy(-1) },
          { bind: "down", run: () => scroll.scrollBy(1) },
          { bind: "pageup", run: () => scroll.scrollBy(-scroll.height) },
          { bind: "pagedown", run: () => scroll.scrollBy(scroll.height) },
          { bind: "ctrl+r", enabled: Boolean(target), run: () => apply(prompt) },
          { bind: "ctrl+e", run: () => edit(prompt.text, prompt, true) },
          {
            bind: "escape",
            run: () => {
              void browse()
            },
          },
        ],
      }))
      return (
        <box padding={1} gap={1} backgroundColor={context.theme.background.raised.base}>
          <text attributes={TextAttributes.BOLD} fg={context.theme.text.base}>
            {copy.prompt}
          </text>
          <scrollbox
            ref={(node) => (scroll = node)}
            height={Math.max(1, Math.min(20, dimensions().height - (dimensions().width < 60 ? 12 : 8), lines()))}
          >
            <text
              onSizeChange={function () {
                setLines(this.virtualLineCount)
              }}
              fg={context.theme.text.base}
            >
              {prompt.text}
            </text>
          </scrollbox>
          <box
            flexDirection={dimensions().width < 60 ? "column" : "row"}
            gap={dimensions().width < 60 ? 0 : 3}
            flexShrink={0}
          >
            <Show when={target}>
              <text onMouseUp={() => apply(prompt)} fg={context.theme.text.base}>
                Ctrl+R {target?.selection ? copy.replaceSelection : copy.insert}
              </text>
            </Show>
            <text onMouseUp={() => edit(prompt.text, prompt, true)} fg={context.theme.text.base}>
              Ctrl+E {copy.edit}
            </text>
            <text
              onMouseUp={() => {
                void browse()
              }}
              fg={context.theme.text.muted}
            >
              Esc {copy.back}
            </text>
          </box>
        </box>
      )
    })
  }
  const apply = (prompt: SavedPrompt) => {
    if (!target) return context.ui.toast.show({ message: copy.unavailable, variant: "warning" })
    context.ui.dialog.clear()
    queueMicrotask(() => insert(target, prompt.text))
  }
  const edit = (text = "", expected?: SavedPrompt, fromPreview = false) => {
    if (expected) current = expected.id
    return promptForm(
      context,
      library,
      text,
      expected,
      (saved) => {
        if (saved) return preview(saved)
        if (fromPreview && expected) return preview(expected)
        void browse()
      },
      signal,
      !expected ? copy.newPrompt : undefined,
    )
  }
  const browse = async () => {
    if (signal.aborted) return
    const prompts = library.state.prompts.map((prompt) => ({ ...prompt })).toSorted((a, b) => b.updatedAt - a.updatedAt)
    const prepared = prepare([], prompts)
    const options = prompts.map((prompt, index) => ({
      title: (prepared[index].readable || prompt.text).replace(/\s+/g, " ").trim(),
      value: prompt,
    }))
    const byID = new Map(options.map((option) => [`saved:${option.value.id}`, option]))
    const pending = context.ui.dialog.select({
      title: copy.library,
      placeholder: copy.search,
      options,
      current: prompts.find((prompt) => prompt.id === current),
      search: (query) => rank(prepared, query).map((item) => byID.get(item.entry.id)!),
      actions: [
        ...(target
          ? [{ bind: "ctrl+r", title: target.selection ? copy.replaceSelection : copy.insert, onTrigger: apply }]
          : []),
        { bind: "ctrl+a", title: copy.newPrompt, selection: "none", onTrigger: () => edit() },
        { bind: "ctrl+e", title: copy.edit, onTrigger: (prompt) => edit(prompt.text, prompt) },
        {
          bind: "ctrl+d",
          title: copy.delete,
          onTrigger: (prompt) => {
            current = prompt.id
            const pending = context.ui.dialog.confirm({
              title: copy.deletePrompt,
              message: Array.from(prompt.text.replace(/\s+/g, " ").trim()).slice(0, 120).join(""),
              label: { confirm: copy.delete, cancel: copy.cancel },
            })
            const stop = closeOnAbort(context, signal)
            void pending.then(async (confirmed) => {
              stop()
              if (signal.aborted) return
              if (confirmed)
                await library.remove(prompt).then(
                  (removed) => {
                    if (!removed) context.ui.toast.show({ message: copy.conflict, variant: "warning" })
                    if (removed)
                      current = prompts[prompts.indexOf(prompt) + 1]?.id ?? prompts[prompts.indexOf(prompt) - 1]?.id
                  },
                  () => context.ui.toast.show({ message: copy.deleteFailed, variant: "error" }),
                )
              void browse()
            })
          },
        },
      ],
    })
    const stop = closeOnAbort(context, signal)
    const selected = await pending
    stop()
    if (signal.aborted) return
    if (selected) preview(selected)
  }
  return {
    open: browse,
    save: (text: string) => promptForm(context, library, text, undefined, () => {}, signal, copy.saveToLibrary, true),
  }
}

export function promptForm(
  context: Context,
  library: Library,
  initial: string,
  expected: SavedPrompt | undefined,
  done: (prompt?: SavedPrompt) => void,
  signal: AbortSignal,
  title: string = expected ? copy.editPrompt : copy.saveToLibrary,
  notify = false,
) {
  let text = initial
  let finishing = false
  let busy = false
  const show = () => {
    if (signal.aborted) return
    context.ui.dialog.show(
      () => {
        context.ui.dialog.set({ size: "large", centered: true })
        onCleanup(closeOnAbort(context, signal))
        const dimensions = useTerminalDimensions()
        const [error, setError] = createSignal("")
        const [pending, setPending] = createSignal(false)
        let body: TextareaRenderable
        const save = (asNew = false) => {
          if (busy) return
          text = body.plainText
          busy = true
          setPending(true)
          void library
            .save({ text }, asNew ? undefined : expected)
            .then(
              (result) => {
                if (signal.aborted) return
                if (result.status === "empty") return setError(copy.emptyText)
                if (result.status === "conflict") return setError(copy.conflict)
                finishing = true
                context.ui.dialog.clear()
                if (result.status === "duplicate") context.ui.toast.show({ message: copy.duplicate })
                if (notify && result.status !== "duplicate") context.ui.toast.show({ message: copy.saved })
                done(result.prompt)
              },
              () => setError(copy.failed),
            )
            .finally(() => {
              busy = false
              setPending(false)
            })
        }
        const cancel = () => {
          text = body.plainText
          if (!busy) context.ui.dialog.clear()
        }
        context.keymap.layer(() => ({
          mode: "modal",
          priority: 1000,
          commands: [
            { bind: "ctrl+s", run: () => save() },
            { bind: "ctrl+o", enabled: error() === copy.conflict, run: () => save(true) },
            { bind: "escape", run: cancel },
          ],
        }))
        onMount(() => body.focus())
        return (
          <box padding={1} gap={1} backgroundColor={context.theme.background.raised.base}>
            <text attributes={TextAttributes.BOLD} fg={context.theme.text.base}>
              {title}
            </text>
            <textarea
              ref={(node) => (body = node)}
              initialValue={text}
              height={Math.max(
                1,
                Math.min(
                  14,
                  dimensions().height -
                    (dimensions().width < 60 ? 12 : 9) -
                    (error()
                      ? Math.ceil(Bun.stringWidth(error()) / Math.max(1, Math.min(80, dimensions().width - 4) - 2)) + 1
                      : 0),
                ),
              )}
              onContentChange={() => (text = body.plainText)}
              textColor={context.theme.text.base}
              focusedTextColor={context.theme.text.base}
              backgroundColor={context.theme.background.raised.base}
              focusedBackgroundColor={context.theme.background.raised.base}
            />
            <Show when={error()}>
              <text fg={context.theme.text.feedback.error.base}>{error()}</text>
            </Show>
            <box
              flexDirection={dimensions().width < 60 ? "column" : "row"}
              gap={dimensions().width < 60 ? 0 : 3}
              flexShrink={0}
            >
              <text onMouseUp={() => save()} fg={pending() ? context.theme.text.muted : context.theme.text.base}>
                {pending() ? copy.saving : `Ctrl+S ${copy.save}`}
              </text>
              <text onMouseUp={cancel} fg={context.theme.text.muted}>
                Esc {copy.cancel}
              </text>
              <Show when={error() === copy.conflict}>
                <text onMouseUp={() => save(true)}>Ctrl+O {copy.saveAsNew}</text>
              </Show>
            </box>
          </box>
        )
      },
      () =>
        queueMicrotask(() => {
          if (finishing || signal.aborted) return
          if (busy) return show()
          if (text === initial) return done()
          const pending = context.ui.dialog.confirm({
            title: copy.discard,
            message: copy.discardMessage,
            label: { confirm: copy.discardAction, cancel: copy.keepEditing },
          })
          const stop = closeOnAbort(context, signal)
          void pending.then((discard) => {
            stop()
            if (signal.aborted) return
            if (discard) return done()
            show()
          })
        }),
    )
  }
  show()
}

function closeOnAbort(context: Context, signal: AbortSignal) {
  const close = () => context.ui.dialog.clear()
  signal.addEventListener("abort", close, { once: true })
  return () => signal.removeEventListener("abort", close)
}
