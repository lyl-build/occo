import { Plugin } from "@opencode/plugin/tui"
import { TextareaRenderable, type Renderable, type OptimizedBuffer } from "@opentui/core"
import { readFileSync, writeFileSync, renameSync } from "node:fs"
import path from "node:path"
import { createLibrary } from "../src/library"
import { conversationHistory } from "../src/history"
import { libraryDialog } from "../src/library-dialog"
import { createRoot, createSignal } from "solid-js"
import assert from "node:assert/strict"

// Test-only observer around the packaged entry. All services are the official host's.
export default Plugin.define({
  id: process.env.OCCO_DIRECT === "1" ? "occo-observer" : "occo",
  async setup(context) {
    const entry = process.env.OCCO_ENTRY!
    const plugin = process.env.OCCO_DIRECT === "1" ? undefined : ((await import(entry)).default as Plugin.Definition)
    let historyMode = "normal"
    const cleanup = await plugin?.setup({
      ...context,
      // Keep live theme accessors: spreading context snapshots themeMode at startup.
      get theme() {
        return context.theme
      },
      get themeMode() {
        return context.themeMode
      },
      client: {
        ...context.client,
        message: {
          ...context.client.message,
          async list(input, options) {
            if (historyMode === "fail") {
              await Bun.sleep(1800)
              throw new Error("Injected UI history failure")
            }
            return context.client.message.list(input, options)
          },
        },
      },
    })
    const library = createLibrary(context.storage)
    const root = process.env.OCCO_TEST_ROOT!
    const provider = process.env.OCCO_SCREENSHOTS === "1" ? "occo-demo" : "occo-test"
    const capture = (buffer: OptimizedBuffer) => ({
      text: new TextDecoder().decode(buffer.getRealCharBytes(true)),
      lines: buffer.getSpanLines().map((line) => ({
        spans: line.spans.map((span) => ({
          text: span.text,
          width: span.width,
          fg: span.fg.toInts(),
          bg: span.bg.toInts(),
        })),
      })),
    })
    let frame: ReturnType<typeof capture> | undefined
    const record = (buffer: OptimizedBuffer) => {
      frame = capture(buffer)
    }
    context.renderer.addPostProcessFn(record)
    let seen = ""
    let busy = false
    const editors = (node: Renderable): TextareaRenderable[] =>
      node instanceof TextareaRenderable ? [node] : node.getChildren().flatMap(editors)
    const timer = setInterval(async () => {
      if (busy) return
      const raw = readFileSync(path.join(root, "control.json"), "utf8")
      if (seen === raw) return
      seen = raw
      busy = true
      const action = JSON.parse(raw) as {
        seq: number
        cmd: string
        id?: string
        text?: string
        question?: string
        historySize?: number
        cursor?: number
      }
      const run = async () => {
        if (action.cmd === "historyMode") historyMode = action.text ?? "normal"
        if (action.cmd === "remoteEdit") {
          const expected = library.state.prompts.find((prompt) => prompt.id === action.id)!
          return library.save({ text: expected.text + " remote" }, expected)
        }
        if (action.cmd === "libraryNoTarget") {
          void libraryDialog(
            context,
            library,
            undefined,
            () => {
              throw new Error("No target must not insert")
            },
            new AbortController().signal,
          ).open()
        }
        if (action.cmd === "cursor") {
          const editor = context.renderer.currentFocusedEditor
          if (!editor) throw new Error("Expected a focused prompt")
          editor.cursorOffset = editor.editBuffer.measureText(editor.plainText.slice(0, action.cursor))
        }
        if (action.cmd === "historyCheck") {
          const route = context.ui.router.current()
          assert.equal(route.type, "session")
          if (route.type !== "session") return
          const calls: { cursor?: string; signal?: AbortSignal }[] = []
          let fail = true
          let hold = false
          const gate = Promise.withResolvers<void>()
          const test = createRoot((dispose) => {
            const [session, setSession] = createSignal<string | undefined>(route.sessionID)
            const history = conversationHistory(
              {
                ...context,
                client: {
                  ...context.client,
                  message: {
                    ...context.client.message,
                    async list(input, options) {
                      calls.push({
                        cursor: input.cursor,
                        signal: options?.signal,
                      })
                      if (input.cursor && fail) throw new Error("Injected page failure")
                      const page = await context.client.message.list(input, options)
                      if (hold) await gate.promise
                      return page
                    },
                  },
                },
              },
              session,
            )
            return { ...history, setSession, dispose }
          })
          const until = async (condition: () => boolean) => {
            for (let i = 0; i < 100 && !condition(); i++) await Bun.sleep(20)
            assert.ok(condition(), "History state transition timed out")
          }
          await until(() => test.status() === "failed")
          assert.equal(test.entries().length, 200, "First page remains available after failure")
          const retained = test.entries()[0]
          fail = false
          test.retry()
          await until(() => test.status() === "ready")
          assert.ok(test.entries().some((item) => item.text.startsWith("Earlytable:")))
          assert.ok(test.entries().some((item) => item.text.includes("earlycode")))
          assert.equal(
            test.entries().find((item) => item.id === retained.id),
            retained,
            "Unchanged messages reuse extraction",
          )
          assert.equal(calls[1].cursor, calls[2].cursor, "Retry resumes the failed page")
          assert.equal(calls.filter((call) => !call.cursor).length, 1, "Retry does not reload the first page")
          const completedCalls = calls.length
          test.setSession(undefined)
          await until(() => test.entries().length === 0)
          hold = true
          test.setSession(route.sessionID)
          await until(() => calls.length === completedCalls + 1)
          assert.equal(test.status(), "loading")
          test.setSession(undefined)
          await until(() => calls[completedCalls].signal?.aborted === true)
          gate.resolve()
          await Bun.sleep(100)
          assert.equal(test.entries().length, 0, "Cancelled response cannot enter the next session")
          assert.equal(test.status(), "ready", "Cancellation is not a failure")
          const transfer = await context.client.experimental.session.export({
            sessionID: route.sessionID,
          })
          const messageID = `msg_${crypto.randomUUID().replaceAll("-", "")}`
          const reverted = await context.client.experimental.session.import({
            info: {
              ...transfer.info,
              id: `ses_${crypto.randomUUID().replaceAll("-", "")}`,
            },
            messages: [
              {
                id: messageID,
                type: "user",
                text: "Revertmarker remains until committed.",
                time: { created: Date.now() },
              },
            ],
          })
          hold = false
          test.setSession(reverted.id)
          await until(() => test.status() === "ready" && test.entries().length === 1)
          await context.client.session.revert.stage({
            sessionID: reverted.id,
            messageID,
            files: false,
          })
          await context.client.session.revert.commit({
            sessionID: reverted.id,
          })
          await until(() => test.status() === "ready" && test.entries().length === 0)
          test.dispose()
          return {
            partial: 200,
            retry: true,
            cancellation: true,
            revert: true,
          }
        }
        if (action.cmd === "dispatch") context.keymap.dispatch(action.id!)
        if (action.cmd === "save") return await library.save({ text: action.text! })
        if (action.cmd === "remove") {
          const item = library.state.prompts.find((item) => item.id === action.id)
          return item ? await library.remove({ ...item }) : false
        }
        if (action.cmd === "home") context.ui.router.navigate({ type: "home" })
        if (action.cmd === "navigate")
          context.ui.router.navigate({
            type: "session",
            sessionID: action.id!,
          })
        if (action.cmd === "onlyTab") {
          const route = context.ui.router.current()
          if (route.type !== "session") throw new Error("Expected a session")
          context.ui.tabs
            .list()
            .filter((tab) => tab.sessionID !== route.sessionID)
            .forEach((tab) => context.ui.tabs.close(tab.sessionID))
        }
        if (action.cmd === "select") {
          const editor = context.renderer.currentFocusedEditor
          if (!editor) throw new Error("Expected a focused prompt")
          editor.setSelection(0, editor.editBuffer.measureText(editor.plainText.split(" ")[0]))
        }
        if (action.cmd === "selectAll") context.renderer.currentFocusedEditor?.selectAll()
        if (action.cmd === "session") {
          const session = await context.client.session.create({
            title: action.text ?? "occo acceptance",
            location: context.location ?? context.data.location.default(),
            model: { providerID: provider, id: "fixture" },
          })
          context.ui.router.navigate({
            type: "session",
            sessionID: session.id,
          })
          return session.id
        }
        if (action.cmd === "messages") {
          const route = context.ui.router.current()
          if (route.type !== "session") return []
          await context.data.session.message.sync(route.sessionID)
          return context.data.session.message.list(route.sessionID)
        }
        if (action.cmd === "conversation") {
          const route = context.ui.router.current()
          if (route.type !== "session") throw new Error("Expected a session")
          const transfer = await context.client.experimental.session.export({
            sessionID: route.sessionID,
          })
          const session = await context.client.experimental.session.import({
            info: {
              ...transfer.info,
              id: `ses_${crypto.randomUUID().replaceAll("-", "")}`,
            },
            messages: [
              ...(action.question
                ? [
                    {
                      id: `msg_${crypto.randomUUID().replaceAll("-", "")}`,
                      type: "user" as const,
                      time: { created: Date.now() - 1000 },
                      text: action.question,
                    },
                  ]
                : []),
              {
                id: `msg_${crypto.randomUUID().replaceAll("-", "")}`,
                type: "assistant",
                agent: "build",
                model: { id: "fixture", providerID: provider },
                time: { created: Date.now(), completed: Date.now() },
                content: [
                  {
                    type: "text",
                    text: action.text ?? "Unicode snippets remain reusable.",
                  },
                  ...(action.text === undefined ? [{ type: "reasoning" as const, text: "Hidden reasoning" }] : []),
                ],
              },
              ...Array.from({ length: action.historySize ?? 0 }, (_, index) => ({
                id: `msg_${crypto.randomUUID().replaceAll("-", "")}`,
                type: "user" as const,
                time: { created: Date.now() + index + 1 },
                text: `Later message ${index}: keep this fixture separate from the opening instructions.`,
              })),
            ],
          })
          context.ui.router.navigate({
            type: "session",
            sessionID: session.id,
          })
          return session.id
        }
        if (action.cmd === "cleanup") await cleanup?.()
        if (action.cmd === "conflict") {
          const item = { ...library.state.prompts[0] }
          await library.save({ text: item.text + " remote" }, item)
          return await library.save({ text: "stale edit" }, item)
        }
        if (action.cmd === "editLegacy") {
          const expected = {
            ...library.state.prompts.find((prompt) => prompt.id === "legacy")!,
            title: "ignored",
          }
          return await library.save({ text: expected.text }, expected)
        }
        return {
          frame: frame?.text ?? "",
          colors: frame?.lines,
          theme: {
            background: context.theme.surface("dialog").background.base.toInts(),
            mode: context.themeMode,
            alternate: context.theme.surface("dialog").background.raised.base.toInts(),
            selectedBackground: context.theme.surface("dialog").background.action.primary.focused.toInts(),
            selectedText: context.theme.surface("dialog").text.action.primary.focused.toInts(),
            border: context.theme.surface("dialog").border.base.toInts(),
            footerBackground: context.theme.surface("dialog.footer").background.base.toInts(),
          },
          mode: context.keymap.mode.current(),
          route: context.ui.router.current(),
          editors: editors(context.renderer.root).map((editor) => ({
            id: editor.id,
            text: editor.plainText,
            focused: editor.focused,
            x: editor.x,
            y: editor.y,
            width: editor.width,
            ancestors: (() => {
              const nodes = []
              for (let node = editor.parent; node; node = node.parent)
                nodes.push({
                  id: node.id,
                  x: node.x,
                  y: node.y,
                  width: node.width,
                  height: node.height,
                })
              return nodes
            })(),
            marks: editor.extmarks.getAll().map((mark) => ({ start: mark.start, end: mark.end })),
          })),
          layout: context.renderer.root
            .getChildren()
            .filter((node) => node.id.startsWith("occo.suggestions."))
            .map((node) => ({
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
              visible: node.visible,
              top: node.top,
              rows: node
                .getChildren()
                .filter((row) => row.id.startsWith("occo.candidate."))
                .map((row) => ({
                  id: row.id,
                  x: row.x,
                  y: row.y,
                  width: row.width,
                  height: row.height,
                  cells: row
                    .getChildren()
                    .filter((cell) => !cell.id.startsWith("occo.edge."))
                    .map((cell) => ({
                      x: cell.x,
                      y: cell.y,
                      width: cell.width,
                      height: cell.height,
                    })),
                })),
              footer: node
                .getChildren()
                .find((row) => row.id === "occo.footer")
                ?.getChildren()
                .filter((cell) => !cell.id.startsWith("occo.edge."))
                .map((cell) => ({
                  id: cell.id,
                  x: cell.x,
                  y: cell.y,
                  width: cell.width,
                  height: cell.height,
                })),
            })),
          prompts: library.state.prompts.map((prompt) => ({ ...prompt })),
          automatic: library.state.automaticSuggestions,
          menus: context.renderer.root
            .getChildren()
            .filter((node) => node.id.startsWith("occo."))
            .map((node) => node.id),
          commands: context.keymap.commands().map((command) => command.id),
        }
      }
      await run().then(
        (result) => writeFileSync(path.join(root, "result.next"), JSON.stringify({ seq: action.seq, result })),
        (error: unknown) =>
          writeFileSync(path.join(root, "result.next"), JSON.stringify({ seq: action.seq, error: String(error) })),
      )
      renameSync(path.join(root, "result.next"), path.join(root, "result.json"))
      busy = false
    }, 100)
    return async () => {
      clearInterval(timer)
      context.renderer.removePostProcessFn(record)
      await cleanup?.()
      writeFileSync(
        path.join(root, "disposed.json"),
        JSON.stringify({
          menus: context.renderer.root
            .getChildren()
            .filter((node) => node.id.startsWith("occo."))
            .map((node) => node.id),
          mode: context.keymap.mode.current(),
        }),
      )
    }
  },
})
