const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")
const pty = require("@lydell/node-pty")
const root = path.resolve("../../tmp/occo-host-gate")
fs.mkdirSync(root, { recursive: true })
const log = path.join(root, "gate.jsonl")
const output = path.join(root, "terminal.txt")
fs.writeFileSync(log, "")
fs.writeFileSync(output, "")
fs.mkdirSync(path.join(root, "config", "opencode"), { recursive: true })
fs.writeFileSync(
  path.join(root, "config", "opencode", "cli.json"),
  JSON.stringify({
    plugins: [pathToFileURL(path.resolve("dist/gate")).href],
    animations: false,
  }),
)
const env = {
  ...process.env,
  XDG_CONFIG_HOME: path.join(root, "config"),
  XDG_DATA_HOME: path.join(root, "data"),
  XDG_STATE_HOME: path.join(root, "state"),
  XDG_CACHE_HOME: path.join(root, "cache"),
  OPENCODE_CONFIG_DIR: path.join(root, "config", "opencode"),
  OPENCODE_TEST_HOME: root,
  OCCO_GATE_LOG: log,
  TERM: "xterm-256color",
}
const child = pty.spawn(process.env.OPENCODE_BIN || "opencode", ["--standalone"], {
  name: "xterm-256color",
  cols: 120,
  rows: 40,
  cwd: root,
  env,
})
child.onData((data) => fs.appendFileSync(output, data))
let exited = false
child.onExit((event) => {
  exited = true
  console.log(event)
  console.log(fs.readFileSync(log, "utf8"))
  process.exit(event.exitCode)
})
setTimeout(() => child.write("hello world"), 15000)
setTimeout(() => child.write("\x1b[24~"), 17000)
setTimeout(() => child.write("\x1b[200~\n一行\n第二行\n第三行\x1b[201~"), 18500)
setTimeout(() => child.write(" tail"), 19500)
setTimeout(() => child.write("\x1b[24~"), 20500)
setTimeout(() => child.write("\x03"), 23000)
setTimeout(() => child.write("\x03"), 24000)
setTimeout(() => {
  if (!exited) process.kill(child.pid)
  process.exit(1)
}, 28000)
