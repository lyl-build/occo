import { Plugin } from "@opencode/plugin/tui"
import { TextareaRenderable, type Renderable, type OptimizedBuffer } from "@opentui/core"
import { readFileSync, writeFileSync, renameSync } from "node:fs"
import path from "node:path"
import { createLibrary } from "../src/library"

// Test-only observer around the packaged entry. All services are the official host's.
export default Plugin.define({
  id: process.env.OCCO_DIRECT === "1" ? "occo-observer" : "occo",
  async setup(context) {
    const entry = process.env.OCCO_ENTRY!
    const plugin = process.env.OCCO_DIRECT === "1" ? undefined : ((await import(entry)).default as Plugin.Definition)
    const cleanup = await plugin?.setup(context)
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
      const action = JSON.parse(raw) as { seq: number; cmd: string; id?: string; text?: string; question?: string }
      const run = async () => {
        if (action.cmd === "dispatch") context.keymap.dispatch(action.id!)
        if (action.cmd === "save") return await library.save({ text: action.text! })
        if (action.cmd === "remove") {
          const item = library.state.prompts.find((item) => item.id === action.id)
          return item ? await library.remove({ ...item }) : false
        }
        if (action.cmd === "home") context.ui.router.navigate({ type: "home" })
        if (action.cmd === "onlyTab") {
          const route = context.ui.router.current()
          if (route.type !== "session") throw new Error("Expected a session")
          context.ui.tabs.list()
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
          context.ui.router.navigate({ type: "session", sessionID: session.id })
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
          const transfer = await context.client.experimental.session.export({ sessionID: route.sessionID })
          const session = await context.client.experimental.session.import({
            info: { ...transfer.info, id: `ses_${crypto.randomUUID().replaceAll("-", "")}` },
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
                  { type: "text", text: action.text ?? "Unicode snippets remain reusable." },
                  ...(action.text === undefined ? [{ type: "reasoning" as const, text: "Hidden reasoning" }] : []),
                ],
              },
            ],
          })
          context.ui.router.navigate({ type: "session", sessionID: session.id })
          return session.id
        }
        if (action.cmd === "cleanup") await cleanup?.()
        if (action.cmd === "conflict") {
          const item = { ...library.state.prompts[0] }
          await library.save({ text: item.text + " remote" }, item)
          return await library.save({ text: "stale edit" }, item)
        }
        if (action.cmd === "editLegacy") {
          const expected = { ...library.state.prompts.find((prompt) => prompt.id === "legacy")!, title: "ignored" }
          return await library.save({ text: expected.text }, expected)
        }
        return {
          frame: frame?.text ?? "",
          colors: frame?.lines,
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
                nodes.push({ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height })
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
