const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const pty = require("@lydell/node-pty")
const screenshots = process.argv.includes("--screenshots")
fs.mkdirSync(path.resolve("../../tmp"), { recursive: true })
const root = screenshots
  ? fs.mkdtempSync(path.resolve("../../tmp/occo-readme-"))
  : path.resolve(
      process.argv.includes("--multiline")
        ? "../../tmp/occo-multiline-integration"
        : process.argv.includes("--ui")
          ? "../../tmp/occo-ui-integration"
          : "../../tmp/occo-integration",
    )
const direct = process.env.OCCO_DIRECT === "1"
assert.ok(!(screenshots && direct), "Screenshot mode requires the integration observer")
const storage = path.join(root, "state", "opencode", "latest", "tui", "plugin.occo.state.json")
fs.mkdirSync(path.join(root, "config", "opencode"), { recursive: true })
// Identical host surfaces must still produce distinct item stripes and visible boundaries.
if (screenshots || process.argv.includes("--multiline")) {
  const foreground = "#eeeeee"
  const surface = "#181818"
  const actions = Object.fromEntries(["primary", "secondary", "destructive"].map((key) => [key, { base: foreground }]))
  const feedback = Object.fromEntries(["error", "warning", "success", "info"].map((key) => [key, { base: foreground }]))
  const theme = {
    base: {
      categorical: ["neutral"],
      text: {
        base: foreground,
        muted: "#aaaaaa",
        action: Object.fromEntries(Object.keys(actions).map((key) => [key, { base: surface }])),
        formfield: { base: foreground },
        feedback,
      },
      background: {
        base: surface,
        raised: { base: surface, high: surface, max: surface },
        action: actions,
        formfield: { base: surface },
        feedback,
      },
      border: { base: "#aaaaaa" },
      scrollbar: { base: foreground },
      diff: {
        text: { added: foreground, removed: foreground, context: foreground, hunkHeader: foreground },
        background: { added: surface, removed: surface, context: surface },
        highlight: { added: surface, removed: surface },
        lineNumber: { text: foreground, background: { added: surface, removed: surface } },
      },
      syntax: Object.fromEntries(
        ["comment", "keyword", "function", "variable", "string", "number", "type", "operator", "punctuation"].map(
          (key) => [key, "$hue.neutral.800"],
        ),
      ),
      markdown: Object.fromEntries(
        [
          "text",
          "heading",
          "link",
          "linkText",
          "code",
          "blockQuote",
          "emphasis",
          "strong",
          "horizontalRule",
          "listItem",
          "listEnumeration",
          "image",
          "imageText",
          "codeBlock",
        ].map((key) => [key, "$hue.neutral.800"]),
      ),
    },
    dark: {
      hue: {
        neutral: Object.fromEntries([100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => [step, foreground])),
        accent: "$hue.neutral",
        interactive: "$hue.neutral",
      },
    },
  }
  fs.mkdirSync(path.join(root, "config", "opencode", "themes"), { recursive: true })
  fs.writeFileSync(path.join(root, "config", "opencode", "themes", "occo-flat.json"), JSON.stringify(theme))
}
fs.writeFileSync(
  path.join(root, "config", "opencode", "cli.json"),
  JSON.stringify({
    plugins: [
      ...(direct ? [pathToFileURL(path.resolve("../../tmp/occo-packed/package")).href] : []),
      pathToFileURL(path.resolve("dist/integration")).href,
    ],
    animations: false,
    highlights: false,
    theme: { mode: "dark" },
  }),
)
fs.writeFileSync(
  path.join(root, "config", "opencode", "opencode.json"),
  JSON.stringify({
    $schema: "https://opencode.ai/v2/config.json",
    update: "disable",
    providers: {
      [screenshots ? "occo-demo" : "occo-test"]: {
        package: "@ai-sdk/openai-compatible",
        settings: {
          baseURL: "http://127.0.0.1:1/v1",
          apiKey: "local-test-only",
          timeout: 100,
        },
        models: {
          fixture: {
            name: screenshots ? "Offline demo" : "occo fixture",
            limit: { context: 8192, output: 512 },
          },
        },
      },
    },
  }),
)
fs.writeFileSync(path.join(root, "control.json"), JSON.stringify({ seq: 0, cmd: "inspect" }))
fs.writeFileSync(path.join(root, "result.json"), "{}")
if (!direct) {
  fs.mkdirSync(path.dirname(storage), { recursive: true })
  fs.writeFileSync(
    storage,
    JSON.stringify({
      automaticSuggestions: true,
      prompts: screenshots
        ? []
        : [
            {
              id: "legacy",
              title: "zzzzlegacyalias",
              text: "Legacy body preserved.",
              updatedAt: 1,
            },
          ],
    }),
  )
}
if (direct) {
  const state = JSON.parse(fs.readFileSync(storage, "utf8"))
  if (!state.prompts.some((prompt) => prompt.id === "chinese-layout"))
    state.prompts.push({
      id: "chinese-layout",
      text: "审查这些改动，保留现有行为。\n  const value = 1",
      updatedAt: 1,
    })
  // The short-query check must select this fixture ahead of other Chinese prompts seeded by the main suite.
  state.prompts = state.prompts.map((prompt) =>
    prompt.id === "chinese-layout" ? { ...prompt, updatedAt: Date.now() } : prompt,
  )
  fs.writeFileSync(storage, JSON.stringify(state))
}
const env = {
  ...process.env,
  TERM: "xterm-256color",
  OPENCODE_TEST_HOME: root,
  XDG_CONFIG_HOME: path.join(root, "config"),
  XDG_DATA_HOME: path.join(root, "data"),
  XDG_CACHE_HOME: path.join(root, "cache"),
  XDG_STATE_HOME: path.join(root, "state"),
  OPENCODE_CONFIG_DIR: path.join(root, "config", "opencode"),
  OCCO_TEST_ROOT: root,
  ...(screenshots ? { OCCO_SCREENSHOTS: "1" } : {}),
  OCCO_ENTRY: process.env.OCCO_ENTRY || pathToFileURL(path.resolve("dist/tui.js")).href,
}
if (screenshots) {
  fs.mkdirSync(path.join(root, "demo"))
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", path.join(root, "demo")])
  fs.writeFileSync(
    path.join(root, "runtime.json"),
    JSON.stringify({
      executable: process.env.OPENCODE_BIN || "opencode",
      directory: path.join(root, "demo"),
      environment: Object.fromEntries(
        [
          "TERM",
          "OPENCODE_TEST_HOME",
          "XDG_CONFIG_HOME",
          "XDG_DATA_HOME",
          "XDG_CACHE_HOME",
          "XDG_STATE_HOME",
          "OPENCODE_CONFIG_DIR",
          "OCCO_TEST_ROOT",
          "OCCO_SCREENSHOTS",
          "OCCO_ENTRY",
        ].map((key) => [key, env[key]]),
      ),
    }),
  )
}
function terminal(action, ...args) {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-File", path.resolve("script/capture-terminal.ps1"), "-Action", action, "-StateDir", root, ...args],
    { encoding: "utf8", windowsHide: true },
  )
}
const child = screenshots
  ? {
      write(data) {
        const text = data.replace(/^\x1b\[200~/, "").replace(/\x1b\[201~$/, "")
        terminal("input", "-TextBase64", Buffer.from(text).toString("base64"))
      },
    }
  : pty.spawn(process.env.OPENCODE_BIN || "opencode", ["--standalone"], {
      name: "xterm-256color",
      cols: 110,
      rows: 40,
      cwd: root,
      env,
    })
const additional = []
let exited = false
if (!screenshots) {
  child.onData((data) => fs.appendFileSync(path.join(root, "terminal.txt"), data))
  child.onExit(() => {
    exited = true
  })
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let seq = 0
async function command(cmd, values = {}, directory = root) {
  const id = ++seq
  fs.writeFileSync(path.join(directory, "control.next"), JSON.stringify({ seq: id, cmd, ...values }))
  // Windows can briefly lock the destination while the observer reads it.
  for (let attempt = 0; ; attempt++) {
    const error = await fs.promises
      .rename(path.join(directory, "control.next"), path.join(directory, "control.json"))
      .then(
        () => undefined,
        (error) => error,
      )
    if (!error) break
    if (process.platform !== "win32" || error.code !== "EPERM" || attempt === 19) throw error
    await sleep(10)
  }
  for (let i = 0; i < 100; i++) {
    await sleep(100)
    const response = JSON.parse(fs.readFileSync(path.join(directory, "result.json"), "utf8"))
    if (response.seq !== id) continue
    if (response.error) throw new Error(response.error)
    return response.result
  }
  throw new Error(`Host command timed out: ${cmd}`)
}
async function capture(name) {
  await sleep(450)
  const value = await command("inspect")
  for (const menu of value.layout.filter((menu) => menu.visible)) {
    for (const row of menu.rows.filter((row) => row.cells.length >= 2)) {
      const [icon, body] = row.cells
      assert.equal(icon.width, 2, "Source emoji keeps its two-column slot")
      assert.equal(icon.x, row.x + 1, "Emoji directly follows the left marker")
      assert.equal(body.x, icon.x + 2, "Body directly follows the emoji")
      assert.equal(icon.y, body.y, "Source emoji and body share a baseline")
      assert.ok(row.height >= 1 && row.height <= 3)
      assert.equal(body.height, row.height)
      assert.ok(body.x + body.width <= row.x + row.width - 2, "Body stays inside the row padding")
      if (row.cells[2]) {
        assert.equal(row.cells[2].x, body.x + body.width + 1, "Time retains one separating column")
        assert.equal(row.cells[2].x + row.cells[2].width, row.x + row.width - 2)
      }
    }
  }
  fs.writeFileSync(path.join(root, `${name}.txt`), value.frame)
  fs.writeFileSync(path.join(root, `${name}.json`), JSON.stringify(value, null, 2))
  if (screenshots && (/^(conversation|library)-(en|zh)$/.test(name) || name.startsWith("ui-")))
    terminal("capture", "-Output", path.join(root, `${name}.png`))
  return value
}
function assertSuggestionColors(capture, selected = 0) {
  const menu = capture.layout.find((menu) => menu.visible)
  const editor = capture.editors.find((editor) => editor.focused)
  assert.ok(menu && editor)
  const cell = (x, y) => {
    let end = 0
    const span = capture.colors[y].spans.find((span) => (end += span.width) > x)
    assert.ok(span, `Missing rendered cell at ${x},${y}`)
    return span
  }
  const background = capture.theme.background
  const lightness = (Math.max(...background.slice(0, 3)) + Math.min(...background.slice(0, 3))) / 510
  const alternateLightness = Math.max(0, Math.min(1, lightness + (capture.theme.mode === "dark" ? 0.08 : -0.08)))
  menu.rows
    .filter((row) => row.cells.length >= 2)
    .forEach((row, index) => {
      for (let line = 0; line < row.height; line++) {
        const span = cell(row.cells[1].x, row.y + line)
        const position = Number(row.id.split(".").at(-1))
        if (index !== selected && position % 2) {
          const actual = (Math.max(...span.bg.slice(0, 3)) + Math.min(...span.bg.slice(0, 3))) / 510
          assert.ok(
            Math.abs(actual - alternateLightness) <= 1 / 255,
            "Stripe HSL lightness follows the host theme mode",
          )
          assert.equal(span.bg[3], background[3])
          assert.notDeepEqual(span.bg, background)
        }
        if (index === selected || !(position % 2))
          assert.deepEqual(span.bg, index === selected ? capture.theme.selectedBackground : background)
        if (index === selected) assert.deepEqual(span.fg, capture.theme.selectedText)
        assert.notDeepEqual(span.fg, span.bg, "Menu text remains visible")
        for (const x of [menu.x, menu.x + menu.width - 1]) {
          assert.deepEqual(cell(x, row.y + line).bg, background, "Both rails always use background A")
          assert.deepEqual(cell(x, row.y + line).fg, capture.theme.border)
        }
      }
    })
  const rows = capture.frame.split("\n")
  const listHeight = menu.rows.reduce((sum, row) => sum + row.height, 0)
  assert.equal(
    rows
      .slice(menu.y, menu.y + listHeight)
      .map((line) => line[menu.x])
      .join(""),
    !listHeight ? "" : listHeight === 1 ? "-" : `┌${"│".repeat(listHeight - 2)}└`,
    "The left marker closes around all visible previews, excluding filler and footer",
  )
  assert.equal(
    rows
      .slice(menu.y, menu.y + listHeight)
      .map((line) => line.trimEnd().at(-1))
      .join(""),
    !listHeight ? "" : listHeight === 1 ? "-" : `┐${"│".repeat(listHeight - 2)}┘`,
    "The right marker mirrors the left marker",
  )
  for (const [index, row] of menu.rows.entries()) {
    if (index) {
      const previous = menu.rows[index - 1]
      assert.equal(row.y, previous.y + previous.height, "Candidate previews are adjacent")
    }
  }
  const last = menu.rows.at(-1)
  for (let y = last ? last.y + last.height : menu.y; y < menu.y + menu.height; y++) {
    assert.equal(rows[y][menu.x], " ", "Empty state and viewport filler have no candidate marker")
    assert.doesNotMatch(rows[y], /[┌┐│└┘]/, "Status, filler and footer rows have no edge decorations")
  }
  assert.deepEqual(cell(menu.x + 1, menu.y + menu.height - 1).bg, capture.theme.footerBackground)
  for (const [index, item] of menu.footer.entries()) {
    assert.equal(item.height, 1)
    assert.ok(item.x + item.width <= menu.x + menu.width - 1)
    if (index) assert.ok(item.x >= menu.footer[index - 1].x + menu.footer[index - 1].width + 2)
    if (item.id === "occo.footer.state") assert.equal(item.x + item.width, menu.x + menu.width - 2)
  }
  return background
}
const historyFixture = {
  question: "Originalrequest: check duplicate submissions.",
  text: "Earlyanswer: disable Save while the request is pending.\n\n| Task | Advice |\n| --- | --- |\n| Test | Earlytable: add a regression test. |\n\n```ts\n  const earlycode = 1\n  run(earlycode)\n```",
  historySize: 240,
}
async function main() {
  if (screenshots) console.log(terminal("launch", "-Profile", process.env.OCCO_TERMINAL_PROFILE || "PowerShell").trim())
  await sleep(5000)
  if (process.argv.includes("--history")) {
    await command("session")
    await command("conversation", historyFixture)
    assert.deepEqual(await command("historyCheck"), {
      partial: 200,
      retry: true,
      cancellation: true,
      revert: true,
    })
    console.log("Official host: partial history, retry, cancellation and committed revert passed.")
    return
  }
  if (screenshots) {
    const initial = await command("inspect")
    const viewport = {
      columns: initial.colors[0].spans.reduce((sum, span) => sum + span.width, 0),
      rows: initial.colors.length,
    }
    console.log(`Default viewport: ${viewport.columns} columns, ${viewport.rows} rows.`)
    const examples = [
      {
        language: "en",
        question: "How can we stop duplicate saves?",
        cases: ["Repeat", "Retry", "Next"],
        tasks: ["Add a test for double clicks.", "Add a test for failed retries.", "Add a test for the next save."],
        prefix: "Start with this: ",
        query: "Add",
        prompts: [
          "Review bugs and missing tests.",
          "Review the public interfaces.\nCheck inputs, outputs and errors.",
          "Review the error paths.\nCheck failures and retries.\nFind missing test coverage.\nSuggest fixes and tests.",
        ],
        context: "The Save guard is ready. What next?",
        response: "Check error handling and retries.\n\nThen add focused tests.",
        savedQuery: "review",
      },
      {
        language: "zh",
        question: "如何避免重复保存？",
        cases: ["连点", "重试", "再保存"],
        tasks: ["补一个重复点击的回归测试。", "补一个失败重试的回归测试。", "补一个再次保存的回归测试。"],
        prefix: "先做这个：",
        query: "补一个",
        prompts: [
          "审查缺陷和遗漏测试。",
          "审查公共接口。\n检查参数、返回值和错误处理。",
          "审查异常处理。\n检查失败、重试和清理。\n找出遗漏的回归测试。\n给出修复建议和测试。",
        ],
        context: "保存防重逻辑已完成，下一步做什么？",
        response: "重点检查异常处理和失败重试。\n\n再补充对应的测试。",
        savedQuery: "审查",
      },
    ]
    for (const example of examples) {
      for (const prompt of (await command("inspect")).prompts) await command("remove", { id: prompt.id })
      await command("session", {
        text: example.language === "en" ? "Fix duplicate submissions" : "修复重复提交",
      })
      await sleep(400)
      await command("conversation", {
        question: example.question,
        text: [
          example.language === "en" ? "| Case | Test |" : "| 场景 | 回归测试 |",
          "| --- | --- |",
          ...example.tasks.map((task, index) => `| ${example.cases[index]} | ${task} |`),
        ].join("\n"),
      })
      await command("onlyTab")
      await sleep(3500)
      const before = await command("messages")
      assert.equal(before.filter((message) => message.type === "user").length, 1)
      assert.deepEqual((await command("inspect")).prompts, [])
      // The terminal transport types the query through Windows input, without F12 or clipboard changes.
      child.write(`\x1b[200~${example.prefix}${example.query}\x1b[201~`)
      const conversation = await capture(`conversation-${example.language}`)
      assert.equal(conversation.layout.filter((menu) => menu.visible).length, 1)
      assert.deepEqual(
        conversation.layout.find((menu) => menu.visible).rows.map((row) => row.height),
        [1, 1, 1],
      )
      for (const task of example.tasks) assert.ok(conversation.frame.includes(`💬${task}`))
      assert.match(conversation.frame, /1\/3/)
      assert.ok(!conversation.frame.includes("⭐"))
      const transcript = conversation.frame.split("\n").slice(1, conversation.layout[0].y).join("\n")
      assert.ok(transcript.includes(example.question))
      for (const task of example.tasks)
        assert.ok(transcript.includes(task), "All three source suggestions remain visible")
      assert.equal(conversation.editors.find((editor) => editor.focused).text, example.prefix + example.query)
      assertSuggestionColors(conversation)
      child.write("\r")
      assert.equal(
        (await capture(`conversation-${example.language}-inserted`)).editors.find((editor) => editor.focused).text,
        example.prefix + example.tasks[0],
      )
      assert.deepEqual(
        (await command("messages")).map((message) => message.id),
        before.map((message) => message.id),
      )

      await command("session", {
        text: example.language === "en" ? "Review changes" : "审查改动",
      })
      await command("conversation", { question: example.context, text: example.response })
      await command("onlyTab")
      await sleep(400)
      const contextMessages = await command("messages")
      for (const text of example.prompts.toReversed()) assert.equal((await command("save", { text })).status, "saved")
      await sleep(3500)
      child.write(`\x1b[200~${example.savedQuery}\x1b[201~`)
      const saved = await capture(`library-${example.language}`)
      assert.equal(saved.layout.filter((menu) => menu.visible).length, 1)
      assert.deepEqual(
        saved.layout.find((menu) => menu.visible).rows.map((row) => row.height),
        [1, 2, 3],
      )
      for (const text of example.prompts) assert.ok(saved.frame.includes(`⭐${text.split("\n")[0]}`))
      assert.ok(!saved.frame.includes("💬"))
      assert.match(saved.frame, /1\/3/)
      assert.match(saved.frame, /\(4 lines\)/)
      assert.equal(saved.prompts.length, 3)
      const background = saved.frame.split("\n").slice(1, saved.layout[0].y).join("\n")
      for (const paragraph of example.response.split("\n\n"))
        assert.ok(background.includes(paragraph), "The task background remains visible above the suggestions")
      assert.equal(saved.editors.find((editor) => editor.focused).text, example.savedQuery)
      assertSuggestionColors(saved)
      child.write("\r")
      assert.equal(
        (await capture(`library-${example.language}-inserted`)).editors.find((editor) => editor.focused).text,
        example.prompts[0],
      )
      assert.deepEqual(
        (await command("messages")).map((message) => message.id),
        contextMessages.map((message) => message.id),
      )
    }
    await command("session", { text: "Preview a saved prompt" })
    await command("onlyTab")
    const multiline =
      "**Preview** the change.\n  Keep existing interfaces.\nCheck failures and retries.\nFinish with a regression test."
    await command("save", { text: multiline })
    await command("save", {
      text: "**Preview** the prompt.\n  Preserve formatting.",
    })
    await command("save", { text: "Preview the changes." })
    await sleep(3500)
    child.write("Preview")
    const folded = await capture("ui-multiline")
    assert.match(folded.frame, /4 lines/)
    assert.equal(folded.layout.find((menu) => menu.visible).rows.length, 3)
    assertSuggestionColors(folded)
    const themeConfig = JSON.parse(fs.readFileSync(path.join(root, "config", "opencode", "cli.json"), "utf8"))
    for (const [name, mode] of [
      ["opencode", "light"],
      ["dracula", "dark"],
      ["occo-flat", "dark"],
    ]) {
      themeConfig.theme = { name, mode }
      fs.writeFileSync(path.join(root, "config", "opencode", "cli.json"), JSON.stringify(themeConfig))
      await sleep(1000)
      const themed = await capture(`ui-multiline-${name}`)
      assertSuggestionColors(themed)
      if (name === "occo-flat") assert.deepEqual(themed.theme.background, themed.theme.alternate)
    }
    themeConfig.theme = { name: "opencode", mode: "dark" }
    fs.writeFileSync(path.join(root, "config", "opencode", "cli.json"), JSON.stringify(themeConfig))
    await sleep(1000)
    child.write("\r")
    assert.equal((await command("inspect")).editors.find((editor) => editor.focused).text, "Preview the changes.")
    await command("dispatch", { id: "occo.library" })
    await capture("ui-library")
    child.write("\r")
    await capture("ui-preview")
    child.write("\x05")
    await capture("ui-edit")
    await command("selectAll")
    child.write("\x7f\x13")
    await capture("ui-empty-error")
    fs.writeFileSync(
      path.join(root, "passed.json"),
      JSON.stringify(
        {
          host: "2.3.0",
          screenshots: 12,
          automatic: true,
          viewport,
          sizing: "startup-default",
          candidatesPerReadme: 3,
        },
        null,
        2,
      ),
    )
    for (const name of ["conversation-en", "conversation-zh", "library-en", "library-zh"]) {
      for (const directory of ["../../docs", "docs"])
        fs.copyFileSync(path.join(root, `${name}.png`), path.resolve(directory, `${name}.png`))
    }
    console.log(`Native captures saved under ${path.relative(path.resolve("../.."), root)}.`)
    console.log(
      "README captures: four default-size scenes with three candidates each; source isolation, insertion and no-send checks passed.",
    )
    return
  }
  if (process.argv.includes("--multiline")) {
    for (const item of (await command("inspect")).prompts) await command("remove", { id: item.id })
    await command("session")
    await command("conversation", {
      text: "Needle short.\n\n```ts\nNeedle()\n  run()\nfinish()\n```",
    })
    const alpha = "**Needle** alpha\n  second\nalpha end"
    const beta = "**Needle** beta\n  keep indentation\nhidden middle\nbeta ending"
    await command("save", { text: alpha })
    await command("save", { text: beta })
    await sleep(500)
    child.write("Needle")
    child.write("\x1b[24~")
    const initial = await capture("multiline-initial")
    const menu = initial.layout.find((menu) => menu.visible)
    assert.equal(menu.height, 9)
    assert.match(initial.frame, /\*\*Needle\*\* beta/)
    assert.match(initial.frame, /\.\.\. beta ending \(4 lines\)/)
    assert.match(initial.frame, /\d{2}:\d{2}/)
    assert.ok(!initial.frame.includes("Updated"))
    assertSuggestionColors(initial)
    const second = menu.rows.filter((row) => row.cells.length >= 2)[1]
    assert.equal(second.height, 3)
    for (let line = 0; line < second.height; line++) {
      child.write(`\x1b[<0;${menu.x + 1};${second.y + line + 1}M\x1b[<0;${menu.x + 1};${second.y + line + 1}m`)
      const clicked = await capture(`multiline-marker-click-${line}`)
      assert.match(clicked.frame, /2\/4/)
      assert.equal(clicked.editors.find((editor) => editor.focused).text, "Needle")
      assertSuggestionColors(clicked, 1)
      child.write("\x1b[A")
      await sleep(150)
    }
    child.write(
      `\x1b[<0;${menu.x + menu.width};${second.y + second.height}M\x1b[<0;${menu.x + menu.width};${second.y + second.height}m`,
    )
    const rightClicked = await capture("multiline-right-edge-click")
    assert.match(rightClicked.frame, /2\/4/)
    assert.equal(rightClicked.editors.find((editor) => editor.focused).text, "Needle")
    assertSuggestionColors(rightClicked, 1)
    child.write("\x1b[A")
    await sleep(150)
    child.write(`\x1b[<0;${second.cells[1].x + 1};${second.y + 3}M\x1b[<0;${second.cells[1].x + 1};${second.y + 3}m`)
    const clicked = await capture("multiline-third-row-click")
    assert.equal(clicked.editors.find((editor) => editor.focused).text, "Needle")
    assert.match(clicked.frame, /2\/4/)
    assertSuggestionColors(clicked, 1)
    const insert = clicked.layout.find((menu) => menu.visible).footer.find((item) => item.id === "occo.footer.insert")
    child.write(`\x1b[<0;${insert.x + 1};${insert.y + 1}M\x1b[<0;${insert.x + 1};${insert.y + 1}m`)
    assert.equal((await capture("multiline-full-insertion")).editors.find((editor) => editor.focused).text, alpha)
    await command("selectAll")
    child.write("\x7fNeedle")
    child.write("\x1b[24~")
    for (const [columns, rows] of [
      [100, 30],
      [60, 20],
      [40, 16],
    ]) {
      child.resize(columns, rows)
      const resized = await capture(`multiline-${columns}`)
      assert.equal(resized.layout.find((menu) => menu.visible).height, 9)
      assert.match(resized.frame, /1\/4/)
      assertSuggestionColors(resized)
      child.write("\x1b[B".repeat(3))
      const last = await capture(`multiline-last-${columns}`)
      assert.match(last.frame, /4\/4/)
      assert.equal(last.layout.find((menu) => menu.visible).height, 9)
      assertSuggestionColors(last, last.layout.find((menu) => menu.visible).rows.length - 1)
      child.write("\x1b[B")
      await capture(`multiline-wrap-${columns}`)
    }
    const config = JSON.parse(fs.readFileSync(path.join(root, "config", "opencode", "cli.json"), "utf8"))
    for (const [name, mode] of [
      ["opencode", "light"],
      ["dracula", "dark"],
      ["occo-flat", "dark"],
    ]) {
      config.theme = { name, mode }
      fs.writeFileSync(path.join(root, "config", "opencode", "cli.json"), JSON.stringify(config))
      await sleep(1000)
      const themed = await capture(`multiline-${name}`)
      assertSuggestionColors(themed)
      assert.match(themed.frame, /1\/4/)
      if (name === "occo-flat") assert.deepEqual(themed.theme.background, themed.theme.alternate)
    }
    for (const rows of [10, 9]) {
      child.resize(40, rows)
      const low = await capture(`multiline-low-height-${rows}`)
      assert.equal(low.layout.find((menu) => menu.visible).rows[0].height, rows - 8)
      assert.match(low.frame, /Enter/)
      assertSuggestionColors(low)
    }
    child.write("\r")
    assert.equal((await capture("multiline-low-inserted")).editors.find((editor) => editor.focused).text, beta)
    fs.writeFileSync(
      path.join(root, "passed.json"),
      JSON.stringify({ multiline: true, passedAt: new Date().toISOString() }),
    )
    console.log(
      "Multiline host checks: timestamps, stable eight-row viewport, third-row mouse selection, full insertion and responsive themes passed.",
    )
    return
  }
  if (process.argv.includes("--ui")) {
    await command("session")
    await sleep(400)
    child.write("A direct-save draft.")
    await command("dispatch", { id: "occo.save" })
    assert.match((await capture("ui-direct-save")).frame, /Save prompt/)
    child.write("\x13\x13")
    const saved = await capture("ui-save-return")
    assert.equal(saved.editors.find((editor) => editor.focused).text, "A direct-save draft.")
    assert.match(saved.frame, /Prompt saved/)
    assert.equal(saved.prompts.filter((prompt) => prompt.text === "A direct-save draft.").length, 1)
    const second = await command("save", {
      text: "**Second** readable prompt.\nOriginal formatting stays.",
    })
    const third = await command("save", { text: "Third prompt." })
    await command("dispatch", { id: "occo.library" })
    child.write("Second")
    const list = await capture("ui-readable-list")
    assert.ok(!list.frame.includes("**Second**"))
    child.write("\r")
    assert.match((await capture("ui-original-preview")).frame, /\*\*Second\*\*/)
    child.write("\x05")
    await capture("ui-edit-start")
    child.write("\x1b")
    assert.match((await capture("ui-edit-cancel-preview")).frame, /Ctrl\+E Edit/)
    child.write("\x1b")
    await capture("ui-return-list")
    child.write("\r")
    assert.match((await capture("ui-retained-selection")).frame, /\*\*Second\*\*/)
    child.write("\x1b")
    await sleep(250)
    child.write("\x04")
    assert.match((await capture("ui-delete-confirm")).frame, /Delete prompt/)
    child.write("\r")
    await capture("ui-after-delete")
    assert.ok(!(await command("inspect")).prompts.some((prompt) => prompt.id === second.prompt.id))
    child.write("\r")
    assert.match((await capture("ui-delete-neighbor")).frame, /A direct-save draft/)
    child.write("\x1b")
    await sleep(200)
    child.write("\x1b")
    await command("remove", { id: third.prompt.id })
    for (const size of [
      [100, 30],
      [60, 20],
      [40, 16],
    ]) {
      child.resize(...size)
      await command("dispatch", { id: "occo.library" })
      await capture(`ui-library-${size[0]}`)
      child.write("\r")
      const body = await capture(`ui-preview-${size[0]}`)
      assert.match(body.frame, /Ctrl\+R Insert/)
      assert.match(body.frame, /Esc Back/)
      child.write("\x05")
      await capture(`ui-edit-${size[0]}`)
      await command("selectAll")
      child.write("\x7f\x13")
      const error = await capture(`ui-error-${size[0]}`)
      assert.match(error.frame, /Enter some prompt/)
      assert.match(error.frame, /Ctrl\+S Save/)
      assert.match(error.frame, /Esc Cancel/)
      child.write("Revised prompt")
      child.write("\x13")
      await capture(`ui-saved-${size[0]}`)
      child.write("\x1b")
      await sleep(200)
      child.write("\x1b")
      await sleep(200)
    }
    await command("dispatch", { id: "occo.library" })
    await sleep(250)
    child.write("\x05")
    await capture("ui-conflict-start")
    const edited = (await command("inspect")).prompts.find((prompt) => prompt.text === "Revised prompt")
    await command("remoteEdit", { id: edited.id })
    child.write(" local\x13")
    const conflict = await capture("ui-conflict-40")
    assert.match(conflict.frame, /another\s+terminal/)
    assert.match(conflict.frame, /Ctrl\+O Save as new/)
    child.write("\x0f")
    assert.match((await capture("ui-conflict-saved-as-new")).frame, /local/)
    child.write("\x1b")
    await sleep(250)
    child.write("\x1b")
    await command("libraryNoTarget")
    assert.ok(!(await capture("ui-no-target-list")).frame.includes("Insert"))
    child.write("\r")
    assert.ok(!(await capture("ui-no-target-preview")).frame.includes("Insert"))
    child.write("\x1b")
    await sleep(250)
    child.write("\x1b")
    child.resize(100, 30)
    await command("historyMode", { text: "fail" })
    await command("conversation", {
      text: "| Task | State |\n| --- | --- |\n| Build | Ready |\n\nReady to review.\n\n```ts\nReady()\nfinish()\n```",
    })
    await sleep(200)
    child.write("Ready")
    child.write("\x1b[24~")
    const loading = await capture("ui-history-loading")
    assert.match(loading.frame, /Loading history/)
    await sleep(2000)
    const failed = await capture("ui-history-failed")
    assert.match(failed.frame, /History incomplete/)
    assert.equal(failed.layout.find((menu) => menu.visible).height, loading.layout.find((menu) => menu.visible).height)
    child.write("\x1b[B")
    assert.equal(
      (await capture("ui-history-selected")).layout.find((menu) => menu.visible).height,
      failed.layout.find((menu) => menu.visible).height,
    )
    await command("historyMode", { text: "normal" })
    child.write("\x1b")
    await sleep(200)
    child.write("\x1b[24~")
    assert.ok(!(await capture("ui-history-retry")).frame.includes("History incomplete"))
    fs.writeFileSync(path.join(root, "passed.json"), JSON.stringify({ ui: true, passedAt: new Date().toISOString() }))
    console.log(
      "UI flows: direct save, readable list, preview return, deletion neighbor, responsive dialogs and history feedback passed.",
    )
    return
  }
  if (direct) {
    child.write("\x10")
    await sleep(200)
    child.write("Open prompt library")
    await sleep(200)
    child.write("\r")
    assert.match((await capture("direct-package-library")).frame, /Prompt library/)
    child.write("\x1b")
    await sleep(200)
    child.write("Prefix suffix")
    await sleep(200)
    await command("select")
    child.write("\x10")
    await sleep(200)
    child.write("Save selection")
    await sleep(200)
    child.write("\r")
    const selection = await capture("direct-save-selection")
    assert.match(selection.frame, /Save prompt/)
    assert.ok(selection.editors.some((editor) => editor.text === "Prefix"))
    child.write("\x1b")
    await sleep(300)
    child.write("\x10")
    await sleep(200)
    child.write("Open prompt library")
    await sleep(200)
    child.write("\r")
    await sleep(250)
    child.write("Review the changes")
    await sleep(200)
    child.write("\x12")
    const replaced = await capture("direct-replace-selection")
    assert.ok(replaced.editors.find((editor) => editor.focused).text.endsWith(" suffix"))
    assert.ok(!replaced.editors.find((editor) => editor.focused).text.startsWith("Prefix"))
    await command("selectAll")
    child.write("\x7f")
    const pasted = Array.from({ length: 40 }, (_, i) => `Pasted fixture line ${i}`).join("\n")
    child.write(`\x1b[200~${pasted}\x1b[201~`)
    await sleep(250)
    child.write("\x10")
    await sleep(200)
    child.write("Save current prompt")
    await sleep(200)
    child.write("\r")
    assert.ok((await capture("direct-save-paste")).editors.some((editor) => editor.text.trim() === pasted))
    child.write("\x13")
    await sleep(250)
    assert.ok((await capture("direct-save-return")).editors.find((editor) => editor.focused))
    await command("dispatch", { id: "occo.library" })
    await sleep(250)
    child.write("Pasted fixture line")
    await sleep(250)
    child.write("\r")
    await sleep(250)
    child.write("\x1b[6~\x1b[6~")
    assert.match((await capture("direct-scroll-body")).frame, /Pasted fixture line 39/)
    child.write("\x1b")
    await sleep(250)
    child.write("\x04")
    const deleting = await capture("direct-delete-summary")
    assert.match(deleting.frame, /Delete prompt/)
    assert.match(deleting.frame, /Pasted fixture line 0/)
    assert.ok(!deleting.frame.includes("Pasted fixture line 39"))
    child.write("\x1b")
    await sleep(250)
    child.write("\x1b")
    await sleep(250)
    await command("selectAll")
    child.write("\x7f")
    child.write("rev")
    await sleep(3500)
    child.write("\x1b[24~")
    assert.match((await capture("direct-package-suggestions")).frame, /Enter Insert/)
    child.write("\x1b")
    await sleep(150)
    await command("selectAll")
    child.write("\x7f")
    await sleep(3200)
    child.resize(40, 20)
    child.write("\x1b[200~第一行说明。\n审查\x1b[201~")
    const narrow = await capture("direct-chinese-multiline-narrow")
    assert.ok(narrow.layout.some((menu) => menu.visible))
    assert.ok(narrow.layout[0].x + narrow.layout[0].width <= 40)
    assert.ok(narrow.layout[0].y + narrow.layout[0].height <= narrow.editors.find((editor) => editor.focused).y)
    assert.match(narrow.frame, /Enter/)
    child.write("\x7f")
    assert.ok((await capture("direct-below-threshold")).layout.every((menu) => !menu.visible))
    child.write("\x1b[24~")
    assert.ok((await capture("direct-manual-short-query")).layout.some((menu) => menu.visible))
    child.write("\r")
    assert.equal(
      (await capture("direct-chinese-inserted")).editors.find((editor) => editor.focused).text,
      "第一行说明。\n审查这些改动，保留现有行为。\n  const value = 1",
    )
    fs.writeFileSync(
      path.join(root, "config", "opencode", "cli.json"),
      JSON.stringify({
        plugins: [pathToFileURL(path.resolve("dist/integration")).href],
      }),
    )
    await sleep(1000)
    const removed = await capture("direct-package-unloaded")
    assert.deepEqual(removed.menus, [])
    assert.ok(!removed.commands.includes("occo.library"))
    console.log("Official host: extracted package loaded directly; commands and menus removed on disable.")
    return
  }
  const before = await command("inspect")
  assert.equal(before.prompts.find((item) => item.id === "legacy").text, "Legacy body preserved.")
  await command("dispatch", { id: "occo.library" })
  await sleep(250)
  child.write("zzzzlegacyalias")
  const legacy = await capture("legacy-title-not-searchable")
  assert.ok(!legacy.frame.includes("Legacy body preserved"))
  child.write("\x1b")
  await sleep(250)
  const migrated = await command("editLegacy")
  assert.equal(migrated.status, "saved")
  assert.equal(migrated.prompt.id, "legacy")
  assert.equal(migrated.prompt.text, "Legacy body preserved.")
  assert.ok(!("title" in migrated.prompt))
  await command("dispatch", { id: "occo.library" })
  await sleep(250)
  child.write("\x01")
  const fresh = await capture("new-body-only-form")
  assert.match(fresh.frame, /New prompt/)
  assert.ok(!fresh.frame.includes("Title"))
  assert.equal(fresh.editors.find((editor) => editor.focused).text, "")
  child.write("\x13")
  assert.match((await capture("empty-body-validation")).frame, /Enter some prompt text/)
  child.write("A body-only prompt.")
  child.write("\x13")
  await capture("body-only-saved")
  const created = (await command("inspect")).prompts.find((prompt) => prompt.text === "A body-only prompt.")
  assert.ok(created && !("title" in created))
  child.write("\x1b")
  await sleep(250)
  child.write("\x1b")
  await sleep(250)
  await command("remove", { id: created.id })
  if (!before.automatic) await command("dispatch", { id: "occo.automatic" })
  await command("session")
  await sleep(400)
  for (const item of before.prompts) await command("remove", { id: item.id })
  const alternate = await command("save", {
    text: "Review alternate suggestion.",
  })
  await command("save", {
    text: "Review the changes carefully.\nPreserve existing behavior.",
  })
  await sleep(3200)
  child.write("rev")
  const preview = await capture("automatic-menu")
  assert.equal(preview.layout.filter((menu) => menu.visible).length, 1)
  assert.equal(preview.layout[0].height, 4)
  const anchor = preview.editors.find((editor) => editor.focused).ancestors[2]
  assert.equal(preview.layout[0].x, anchor.x)
  assert.equal(preview.layout[0].width, anchor.width)
  assert.equal(preview.layout[0].rows[0].cells[0].x, anchor.x + 1)
  assert.equal(preview.layout[0].y + preview.layout[0].height, anchor.y)
  assert.match(preview.frame, /┃  rev/)
  const darkBackground = assertSuggestionColors(preview)
  child.write("\x1b[B")
  assertSuggestionColors(await capture("arrow-selected"), 1)
  child.write("\r")
  assert.equal(
    (await capture("arrow-inserted")).editors.find((editor) => editor.focused).text,
    "Review alternate suggestion.",
  )
  assert.equal((await command("messages")).filter((message) => message.type === "user").length, 0)
  await command("remove", { id: alternate.prompt.id })
  await command("selectAll")
  child.write("\x7f")
  await sleep(3200)
  child.write("rev")
  await capture("automatic-again")
  const rows = (await command("inspect")).frame.split("\n")
  const row = rows.findIndex((line) => line.includes("⭐Review the changes"))
  assert.ok(row >= 0)
  const column = rows[row].indexOf("Review the changes") + 1
  child.write(`\x1b[<0;${column};${row + 1}M\x1b[<0;${column};${row + 1}m`)
  assert.match((await capture("selecting")).frame, /Enter Insert/)
  assert.equal((await command("inspect")).editors.find((editor) => editor.focused).text, "rev")
  child.write("\r")
  assert.equal(
    (await capture("inserted")).editors[0].text,
    "Review the changes carefully.\nPreserve existing behavior.",
  )
  child.write("\x10")
  await sleep(200)
  child.write("Open prompt library")
  await sleep(200)
  child.write("\r")
  assert.match((await capture("library")).frame, /Prompt library/)
  child.write("\r")
  assert.match((await capture("body-preview")).frame, /Preserve existing behavior/)
  child.write("\x05")
  assert.match((await capture("edit-form")).frame, /Edit prompt/)
  assert.equal(
    (await command("inspect")).editors.find((editor) => editor.focused).text,
    "Review the changes carefully.\nPreserve existing behavior.",
  )
  child.write("\x13")
  await capture("saved-form")
  child.write("\x12")
  const reused = await capture("library-insert")
  assert.equal(
    reused.editors[0].text,
    "Review the changes carefully.\nPreserve existing behavior.Review the changes carefully.\nPreserve existing behavior.",
  )
  assert.equal(
    (
      await command("save", {
        text: "Review the changes carefully.\nPreserve existing behavior.",
      })
    ).status,
    "duplicate",
  )
  assert.equal((await command("conflict")).status, "conflict")
  assert.ok((await command("inspect")).prompts.every((prompt) => !("title" in prompt)))
  await command("dispatch", { id: "occo.library" })
  await sleep(200)
  child.write("\x05")
  await sleep(200)
  child.write("changed")
  child.write("\x1b")
  assert.match((await capture("discard-confirm")).frame, /Discard unsaved changes/)
  child.write("\x1b")
  assert.match((await capture("retained-form")).frame, /changed/)
  fs.renameSync(storage, storage + ".backup")
  fs.mkdirSync(storage)
  child.write("\x13")
  const failed = await capture("failed-save")
  assert.match(failed.frame, /Could not save/)
  assert.match(failed.frame, /changed/)
  fs.rmdirSync(storage)
  fs.renameSync(storage + ".backup", storage)
  child.write("\x13")
  await sleep(300)
  child.write("\x1b")
  await sleep(250)
  child.write("\x1b")
  await sleep(250)
  await command("session")
  await sleep(400)
  child.write("zzzzzzzzzz")
  child.write("\x1b[24~")
  const empty = await capture("empty-menu")
  assert.match(empty.frame, /No matching suggestions/)
  assertSuggestionColors(empty, -1)
  child.write("\r")
  assert.equal((await capture("empty-enter")).editors.find((editor) => editor.focused).text, "zzzzzzzzzz")
  assert.equal((await command("messages")).filter((message) => message.type === "user").length, 0)
  child.write("\x1b")
  await sleep(250)
  await command("session")
  await sleep(400)
  child.write("rev")
  await sleep(3200)
  child.write("i")
  assert.match((await capture("send-preview")).frame, /Review the changes/)
  child.write("\x1b")
  await sleep(150)
  child.write("\r")
  await sleep(500)
  assert.equal((await command("messages")).filter((message) => message.type === "user").at(-1).text, "revi")
  for (const trigger of ["/", "@"]) {
    await command("selectAll")
    child.write("\x7f" + trigger)
    const native = await capture(trigger === "/" ? "native-slash" : "native-mention")
    assert.ok(native.layout.every((menu) => !menu.visible))
    child.write("\x1b")
    await sleep(150)
  }
  await command("selectAll")
  child.write("\x7f")
  await command("dispatch", { id: "occo.library" })
  await sleep(300)
  child.write("\x12")
  await capture("after-session-library")
  await command("dispatch", { id: "occo.library" })
  await sleep(200)
  await command("session")
  await sleep(300)
  child.write("\x12")
  assert.match((await capture("stale-library")).frame, /draft changed/)
  await command("conversation")
  await sleep(500)
  child.write("uni")
  await sleep(200)
  child.write("\x1b[24~")
  assert.match((await capture("conversation")).frame, /💬Unicode snippets remain reusable/)
  child.write("\r")
  assert.equal(
    (await capture("conversation-insert")).editors.find((editor) => editor.focused).text,
    "Unicode snippets remain reusable.",
  )
  const historySession = await command("conversation", historyFixture)
  await sleep(1200)
  const recent = await command("messages")
  assert.equal(recent.length, 20, "Host transcript starts with a single page")
  assert.ok(recent.every((message) => message.type === "user" && message.text.startsWith("Later message")))
  child.write("Earlyanswer")
  child.write("\x1b[24~")
  assert.match((await capture("full-history-early-answer")).frame, /💬Earlyanswer:/)
  child.write("\r")
  assert.equal(
    (await capture("full-history-insert")).editors.find((editor) => editor.focused).text,
    "Earlyanswer: disable Save while the request is pending.",
  )
  await command("selectAll")
  child.write("\x7fOriginalrequest")
  child.write("\x1b[24~")
  assert.match((await capture("full-history-early-user")).frame, /💬Originalrequest:/)
  child.write("\x1b")
  assert.deepEqual(await command("historyCheck"), {
    partial: 200,
    retry: true,
    cancellation: true,
    revert: true,
  })
  for (const [query, expected] of [
    ["Earlytable", "Earlytable: add a regression test."],
    ["earlycode", "earlycode = 1\n  run(earlycode)"],
  ]) {
    await command("selectAll")
    child.write("\x7f" + query)
    child.write("\x1b[24~")
    const result = await capture(`full-history-${query}`)
    assert.ok(result.frame.includes(query))
    if (query === "earlycode") {
      assert.match(result.frame, /run\(earlycode\)/)
      assert.ok(!result.frame.includes("2 lines"))
    }
    child.write("\r")
    assert.equal((await capture(`${query}-inserted`)).editors.find((editor) => editor.focused).text, expected)
  }
  await command("session")
  await sleep(400)
  child.write("Earlyanswer")
  child.write("\x1b[24~")
  const isolated = await capture("full-history-session-isolation")
  assert.ok(!isolated.frame.includes("💬Earlyanswer:"))
  await command("navigate", { id: historySession })
  await command("session")
  await sleep(1000)
  child.write("Earlyanswer")
  child.write("\x1b[24~")
  assert.ok(!(await capture("full-history-cancelled-load")).frame.includes("💬Earlyanswer:"))
  child.write("\x1b")
  await command("conversation", {
    text: Array.from({ length: 26 }, (_, i) => `Browse candidate ${i}.`).join("\n\n"),
  })
  await sleep(500)
  child.write("Browse")
  child.write("\x1b[24~")
  await capture("browse-all-start")
  child.write("\x1b[B".repeat(8))
  const ninth = await capture("browse-ninth")
  assert.match(ninth.frame, /9\/26/)
  assert.equal(ninth.layout.find((menu) => menu.visible).rows.length, 8)
  assert.equal(ninth.layout.find((menu) => menu.visible).height, 9)
  assertSuggestionColors(ninth, 7)
  const added = await command("save", { text: "Browse newly saved prompt." })
  assert.match((await capture("browse-selection-retained")).frame, /10\/27/)
  await command("remove", { id: added.prompt.id })
  assert.match((await capture("browse-selection-retained-after-remove")).frame, /9\/26/)
  child.write("\x1b")
  await command("conversation", { text: "Review this change." })
  await sleep(500)
  child.write("Review this KEEP THIS TAIL")
  await command("cursor", { cursor: 11 })
  child.write("\x1b[24~")
  assert.match((await capture("phrase-right-tail")).frame, /Enter Insert/)
  child.write("\r")
  assert.equal(
    (await capture("phrase-right-tail-inserted")).editors.find((editor) => editor.focused).text,
    "Review this change. KEEP THIS TAIL",
  )
  const other = path.join(root, "other-project")
  fs.mkdirSync(other, { recursive: true })
  execFileSync("git", ["init", "--quiet", other])
  fs.writeFileSync(path.join(other, "control.json"), JSON.stringify({ seq: 0, cmd: "inspect" }))
  fs.writeFileSync(path.join(other, "result.json"), "{}")
  const second = pty.spawn(process.env.OPENCODE_BIN || "opencode", ["--standalone"], {
    name: "xterm-256color",
    cols: 80,
    rows: 30,
    cwd: other,
    env: { ...env, OCCO_TEST_ROOT: other },
  })
  additional.push(second)
  second.onData(() => {})
  await sleep(4500)
  assert.equal((await command("inspect", {}, other)).prompts.length, (await command("inspect")).prompts.length)
  await Promise.all([command("save", { text: "Concurrent A" }), command("save", { text: "Concurrent B" }, other)])
  await sleep(800)
  for (const directory of [root, other]) {
    const state = await command("inspect", {}, directory)
    assert.ok(state.prompts.some((item) => item.text === "Concurrent A"))
    assert.ok(state.prompts.some((item) => item.text === "Concurrent B"))
  }
  const config = JSON.parse(fs.readFileSync(path.join(root, "config", "opencode", "cli.json"), "utf8"))
  await command("save", {
    text: "Review this diff for bugs and missing tests. Explain each issue and suggest a fix.",
  })
  await command("conversation", {
    text: "Review the retry logic and add a regression test for repeated requests.",
  })
  await sleep(500)
  child.write("rev")
  child.write("\x1b[24~")
  const mixed = await capture("mixed-sources-dark")
  assert.match(mixed.frame, /💬Review/)
  assert.match(mixed.frame, /⭐Review/)
  assertSuggestionColors(mixed)
  config.theme = { mode: "light" }
  fs.writeFileSync(path.join(root, "config", "opencode", "cli.json"), JSON.stringify(config))
  await command("selectAll")
  child.write("\x7f")
  child.write("rev")
  await sleep(500)
  if (!(await command("inspect")).layout.some((menu) => menu.visible)) child.write("\x1b[24~")
  child.resize(80, 30)
  const resized = await capture("light-resized")
  assert.ok(resized.layout.some((menu) => menu.visible))
  assert.ok(resized.layout[0].x + resized.layout[0].width <= 80)
  assert.ok(resized.layout[0].y + resized.layout[0].height <= resized.editors.find((editor) => editor.focused).y)
  assert.notDeepEqual(assertSuggestionColors(resized), darkBackground, "Light theme changes the surface")
  assert.match(resized.frame, /💬Review/)
  assert.match(resized.frame, /⭐Review/)
  child.resize(40, 20)
  const narrow = await capture("mixed-sources-narrow")
  assert.match(narrow.frame, /💬Review/)
  assert.match(narrow.frame, /⭐Review/)
  await command("save", {
    text: "审查这次改动，找出潜在问题和遗漏的测试，并逐项说明修复建议。",
  })
  child.write("\x1b")
  await sleep(150)
  await command("selectAll")
  child.write("\x7f审查")
  child.write("\x1b[24~")
  assert.match((await capture("chinese-emoji-narrow")).frame, /⭐审查/)
  child.resize(80, 30)
  config.theme.mode = "dark"
  fs.writeFileSync(path.join(root, "config", "opencode", "cli.json"), JSON.stringify(config))
  await sleep(800)
  assert.deepEqual(assertSuggestionColors(await capture("dark-switched")), darkBackground)
  await command("dispatch", { id: "occo.library" })
  await sleep(300)
  config.plugins = []
  fs.writeFileSync(path.join(root, "config", "opencode", "cli.json"), JSON.stringify(config))
  await sleep(1200)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "disposed.json"), "utf8")).menus, [])
  fs.writeFileSync(
    path.join(root, "passed.json"),
    JSON.stringify(
      {
        host: "2.3.0",
        concurrentProjects: 2,
        passedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  console.log(
    "Official host: automatic completion, insertion, library CRUD form, reuse, duplicate and conflict checks passed.",
  )
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (fs.existsSync(storage + ".backup")) {
      if (fs.existsSync(storage)) fs.rmdirSync(storage)
      fs.renameSync(storage + ".backup", storage)
    }
    if (screenshots && fs.existsSync(path.join(root, "window.json"))) console.log(terminal("close").trim())
    if (!screenshots && !exited) process.kill(child.pid)
    for (const process of additional) global.process.kill(process.pid)
    process.exit(process.exitCode ?? 0)
  })
