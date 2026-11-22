import { Plugin } from "@opencode/plugin/tui"
import type { JSX } from "@opentui/solid"
import { createEffect, createMemo, onCleanup, onMount, untrack } from "solid-js"
import { bindComposer, savedText, type Snapshot } from "./composer"
import { createLibrary } from "./library"
import { conversation, index } from "./search"
import { suggestions } from "./suggestions"
import { libraryDialog } from "./library-dialog"
import { copy } from "./copy"

export default Plugin.define({
  id: "occo",
  setup(context) {
    const library = createLibrary(context.storage)
    const lifetime = new AbortController()
    let active: { composer: ReturnType<typeof bindComposer>; menu: ReturnType<typeof suggestions> } | undefined
    const failure = (result: string) => {
      if (result !== "applied")
        context.ui.toast.show({ message: result === "protected" ? copy.protected : copy.stale, variant: "warning" })
    }
    const insert = (target: Snapshot, text: string) => {
      if (!active) return failure("stale")
      failure(
        active.composer.apply(target, {
          start: target.selection?.start ?? target.cursor,
          end: target.selection?.end ?? target.cursor,
          text,
        }),
      )
    }
    const save = (selection = false) => {
      const target = active?.composer.current(true, true)
      if (!target) return context.ui.toast.show({ message: copy.unavailable, variant: "warning" })
      const text = savedText(target, selection)
      if (!text.trim()) return context.ui.toast.show({ message: copy.noText, variant: "warning" })
      active?.menu.close(true)
      libraryDialog(context, library, target, insert, lifetime.signal).save(text)
    }
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "occo.suggestions",
          title: copy.show,
          group: "occo",
          palette: true,
          bind: false,
          run: () => active?.menu.toggle(),
        },
        { id: "occo.save", title: copy.saveCurrent, group: "occo", palette: true, run: () => save() },
        { id: "occo.save-selection", title: copy.saveSelection, group: "occo", palette: true, run: () => save(true) },
        {
          id: "occo.library",
          title: copy.openLibrary,
          group: "occo",
          palette: true,
          run() {
            const target = active?.composer.current(true, true)
            active?.menu.close(true)
            void libraryDialog(context, library, target, insert, lifetime.signal).open()
          },
        },
        {
          id: "occo.automatic",
          title: library.state.automaticSuggestions ? copy.disable : copy.enable,
          group: "occo",
          palette: true,
          run: () =>
            library.toggle().catch(() => context.ui.toast.show({ message: copy.settingFailed, variant: "error" })),
        },
      ],
    }))
    context.keymap.layer(() => ({ commands: [{ bind: "f12", run: () => active?.menu.toggle() }] }))
    const unmount = context.ui.slot({
      append: "prompt.footer",
      render(input) {
        let refresh = () => {}
        const composer = bindComposer(context, input, () => refresh())
        const entries = createMemo(() =>
          conversation(input.sessionID ? context.data.session.message.list(input.sessionID) : []),
        )
        const items = createMemo(() => index(entries(), library.state.prompts))
        const menu = suggestions(
          context,
          composer,
          items,
          () => library.state.automaticSuggestions,
          (text) => libraryDialog(context, library, composer.current(true, true), insert, lifetime.signal).save(text),
        )
        refresh = () => {
          if (composer.current(true)) active = { composer, menu }
          menu.refresh()
        }
        createEffect(() => {
          const session = input.sessionID
          if (session)
            void context.data.session.message.sync(session).catch(() =>
              context.ui.toast.show({
                message: copy.historyFailed,
                variant: "warning",
              }),
            )
          input.mode
          untrack(refresh)
        })
        onMount(() => composer.mount())
        onCleanup(() => {
          if (active?.composer === composer) active = undefined
          composer.dispose()
        })
        return composer.marker as unknown as JSX.Element
      },
    })
    return () => {
      lifetime.abort()
      unmount()
    }
  },
})
