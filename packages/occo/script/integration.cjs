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
  : path.resolve("../../tmp/occo-integration")
const direct = process.env.OCCO_DIRECT === "1"
assert.ok(!(screenshots && direct), "Screenshot mode requires the integration observer")
const storage = path.join(root, "state", "opencode", "latest", "tui", "plugin.occo.state.json")
fs.mkdirSync(path.join(root, "config", "opencode"), { recursive: true })
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
        settings: { baseURL: "http://127.0.0.1:1/v1", apiKey: "local-test-only", timeout: 100 },
        models: { fixture: { name: screenshots ? "Offline demo" : "occo fixture", limit: { context: 8192, output: 512 } } },
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
      prompts: screenshots ? [] : [{ id: "legacy", title: "zzzzlegacyalias", text: "Legacy body preserved.", updatedAt: 1 }],
    }),
  )
}
if (direct) {
  const state = JSON.parse(fs.readFileSync(storage, "utf8"))
  if (!state.prompts.some((prompt) => prompt.id === "chinese-layout"))
    state.prompts.push({ id: "chinese-layout", text: "审查这些改动，保留现有行为。\n  const value = 1", updatedAt: 1 })
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
      environment: Object.fromEntries([
        "TERM", "OPENCODE_TEST_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME",
        "OPENCODE_CONFIG_DIR", "OCCO_TEST_ROOT", "OCCO_SCREENSHOTS", "OCCO_ENTRY",
      ].map((key) => [key, env[key]])),
    }),
  )
}
function terminal(action, ...args) {
  return execFileSync("powershell.exe", [
    "-NoProfile", "-File", path.resolve("script/capture-terminal.ps1"), "-Action", action, "-StateDir", root, ...args,
  ], { encoding: "utf8", windowsHide: true })
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
  fs.renameSync(path.join(directory, "control.next"), path.join(directory, "control.json"))
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
  fs.writeFileSync(path.join(root, `${name}.txt`), value.frame)
  fs.writeFileSync(path.join(root, `${name}.json`), JSON.stringify(value, null, 2))
  if (screenshots && /^(conversation|library)-(en|zh)$/.test(name))
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
  const background = cell(editor.x, editor.y).bg
  for (let row = 0; row < menu.height; row++) {
    const span = cell(menu.x + 3, menu.y + row)
    if (row === selected) assert.notDeepEqual(span.bg, background, "Selection remains highlighted")
    if (row !== selected) assert.deepEqual(span.bg, background, "Menu surface matches the prompt")
    assert.notDeepEqual(span.fg, span.bg, "Menu text remains visible")
  }
  return background
}
async function main() {
  if (screenshots) console.log(terminal("launch", "-Profile", process.env.OCCO_TERMINAL_PROFILE || "PowerShell").trim())
  await sleep(5000)
  if (screenshots) {
    const examples = [
      {
        language: "en",
        question: "Clicking Save twice quickly creates duplicate records. How should I fix this?",
        advice: "Disable the Save button while the request is pending, and ignore new submissions until it finishes.",
        task: "Add a regression test that clicks Save twice and checks that only one POST request is sent.",
        prefix: "Start with this: ",
        query: "Add",
        prompt: "Review this diff for bugs and missing tests. Explain each issue and suggest a fix. Avoid unrelated refactoring.",
        savedQuery: "review",
      },
      {
        language: "zh",
        question: "快速连续点击保存会创建两条相同记录，这个问题怎么修？",
        advice: "请求进行时禁用保存按钮，并忽略新的提交操作，直到请求结束。",
        task: "补一个连续点击保存按钮的回归测试，确认只发送一次 POST 请求。",
        prefix: "先做这个：",
        query: "补一个",
        prompt: "审查这次改动，找出潜在 bug 和遗漏的测试。逐项说明问题并给出修复建议，不要做无关重构。",
        savedQuery: "审查",
      },
    ]
    for (const example of examples) {
      for (const prompt of (await command("inspect")).prompts) await command("remove", { id: prompt.id })
      await command("session", { text: example.language === "en" ? "Fix duplicate submissions" : "修复重复提交" })
      await sleep(400)
      await command("conversation", { question: example.question, text: `${example.advice}\n\n${example.task}` })
      await command("onlyTab")
      await sleep(3500)
      const before = await command("messages")
      assert.equal(before.filter((message) => message.type === "user").length, 1)
      assert.deepEqual((await command("inspect")).prompts, [])
      // The terminal transport types the query through Windows input, without F12 or clipboard changes.
      child.write(`\x1b[200~${example.prefix}${example.query}\x1b[201~`)
      const conversation = await capture(`conversation-${example.language}`)
      assert.equal(conversation.layout.filter((menu) => menu.visible).length, 1)
      assert.ok(conversation.frame.includes(`· ${example.task}`))
      assert.ok(!conversation.frame.includes("★"))
      const transcript = conversation.frame.split("\n").slice(1, conversation.layout[0].y).join("\n")
      assert.ok(transcript.includes(example.question))
      assert.ok(transcript.includes(example.task))
      assert.equal(conversation.editors.find((editor) => editor.focused).text, example.prefix + example.query)
      assertSuggestionColors(conversation)
      child.write("\r")
      assert.equal(
        (await capture(`conversation-${example.language}-inserted`)).editors.find((editor) => editor.focused).text,
        example.prefix + example.task,
      )
      assert.deepEqual((await command("messages")).map((message) => message.id), before.map((message) => message.id))

      await command("session", { text: example.language === "en" ? "Review changes" : "审查改动" })
      await command("onlyTab")
      await sleep(400)
      assert.deepEqual(await command("messages"), [])
      assert.equal((await command("save", { text: example.prompt })).status, "saved")
      await sleep(3500)
      child.write(`\x1b[200~${example.savedQuery}\x1b[201~`)
      const saved = await capture(`library-${example.language}`)
      assert.equal(saved.layout.filter((menu) => menu.visible).length, 1)
      assert.ok(saved.frame.includes(`★ ${example.prompt.split(/[.。]/u)[0]}`))
      assert.equal(saved.prompts.length, 1)
      assert.equal(saved.editors.find((editor) => editor.focused).text, example.savedQuery)
      assertSuggestionColors(saved)
      child.write("\r")
      assert.equal(
        (await capture(`library-${example.language}-inserted`)).editors.find((editor) => editor.focused).text,
        example.prompt,
      )
      assert.deepEqual(await command("messages"), [])
    }
    fs.writeFileSync(path.join(root, "passed.json"), JSON.stringify({ host: "2.3.0", screenshots: 4, automatic: true }, null, 2))
    for (const name of ["conversation-en", "conversation-zh", "library-en", "library-zh"]) {
      for (const directory of ["../../docs", "docs"])
        fs.copyFileSync(path.join(root, `${name}.png`), path.resolve(directory, `${name}.png`))
    }
    console.log(`Native captures saved under ${path.relative(path.resolve("../.."), root)}.`)
    console.log("README captures: four automatic menus; source isolation, insertion and no-send checks passed.")
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
    assert.match(selection.frame, /Save to library/)
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
    assert.match(narrow.frame, /Enter Insert/)
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
      JSON.stringify({ plugins: [pathToFileURL(path.resolve("dist/integration")).href] }),
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
  assert.match(fresh.frame, /Save to library/)
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
  const alternate = await command("save", { text: "Review alternate suggestion." })
  await command("save", { text: "Review the changes carefully.\nPreserve existing behavior." })
  await sleep(3200)
  child.write("rev")
  const preview = await capture("automatic-menu")
  assert.equal(preview.layout.filter((menu) => menu.visible).length, 1)
  assert.ok(preview.layout[0].height <= 4)
  const anchor = preview.editors.find((editor) => editor.focused).ancestors[2]
  assert.equal(preview.layout[0].x, anchor.x)
  assert.equal(preview.layout[0].width, anchor.width)
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
  const row = rows.findIndex((line) => line.includes("★ Review the changes"))
  assert.ok(row >= 0)
  const column = rows[row].indexOf("Review the changes") + 1
  child.write(`\x1b[<0;${column};${row + 1}M\x1b[<0;${column};${row + 1}m`)
  assert.match((await capture("selecting")).frame, /Replaces current word/)
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
  assert.match((await capture("conversation")).frame, /· Unicode snippets remain reusable/)
  child.write("\r")
  assert.equal(
    (await capture("conversation-insert")).editors.find((editor) => editor.focused).text,
    "Unicode snippets remain reusable.",
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
    JSON.stringify({ host: "2.3.0", concurrentProjects: 2, passedAt: new Date().toISOString() }, null, 2),
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
