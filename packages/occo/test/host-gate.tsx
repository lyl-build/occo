import { Plugin } from "@opencode/plugin/tui"
import { onMount, onCleanup } from "solid-js"
import { bindComposer, snapshot } from "../src/composer"
import { appendFileSync } from "node:fs"
import type { JSX } from "@opentui/solid"

// Only built by `bun gate`; never included in the distributable plugin.
export default Plugin.define({
  id: "occo-gate",
  setup(context) {
    const log = (value: unknown) => appendFileSync(process.env.OCCO_GATE_LOG!, JSON.stringify(value) + "\n")
    log({ loaded: context.app.version })
    return context.ui.slot({
      append: "prompt.footer",
      render(input) {
        const composer = bindComposer(context, input, () => {})
        onMount(() => {
          composer.mount()
          log({ mounted: !!composer.editor() })
        })
        onCleanup(() => {
          composer.dispose()
          log({ disposed: true })
        })
        context.keymap.layer(() => ({
          commands: [
            {
              id: "occo-gate.replace",
              bind: "f12",
              run() {
                const before = composer.current()
                if (!before)
                  return log({
                    unavailable: true,
                    editor: composer.editor()?.id,
                    focused: composer.editor()?.focused,
                    current: context.renderer.currentFocusedEditor?.id,
                    mode: context.keymap.mode.current(),
                    input: input.mode,
                    route: context.ui.router.current(),
                    traits: composer.editor()?.traits,
                    selection: composer.editor()?.getSelection(),
                  })
                const start = before.text.lastIndexOf(" ", before.cursor - 1) + 1
                const status = composer.apply(before, { start, end: before.cursor, text: "替换\n  code 😀" })
                const editor = before.editor
                const inserted = editor.plainText
                editor.undo()
                const firstUndo = editor.plainText
                editor.undo()
                const undone = editor.plainText
                editor.redo()
                editor.redo()
                log({
                  status,
                  before: before.text,
                  inserted,
                  firstUndo,
                  undone,
                  redone: editor.plainText,
                  marks: snapshot(editor, input.sessionID).marks,
                })
              },
            },
          ],
        }))
        return composer.marker as unknown as JSX.Element
      },
    })
  },
})
