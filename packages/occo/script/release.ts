import assert from "node:assert/strict"
import { lstat } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import manifest from "../../../release-files.json"
import pkg from "../package.json"

const root = path.resolve(import.meta.dir, "../../..")
const files = Object.fromEntries(
  await Promise.all(
    manifest.map(async (file) => {
      assert.ok(!path.isAbsolute(file) && !file.includes("..") && !file.includes("\\"), `Invalid path: ${file}`)
      assert.ok((await lstat(path.join(root, file))).isFile(), `Expected a regular file: ${file}`)
      return [file, await Bun.file(path.join(root, file)).bytes()] as const
    }),
  ),
)
assert.equal(Object.keys(files).length, manifest.length, "Duplicate source entries")
for (const file of [
  "README.md",
  "README.zh-CN.md",
  "docs/usage.md",
  "docs/usage.zh-CN.md",
  "docs/conversation-en.png",
  "docs/conversation-zh.png",
  "docs/library-en.png",
  "docs/library-zh.png",
  "docs/conversation-en-framed.png",
  "docs/conversation-zh-framed.png",
  "docs/library-en-framed.png",
  "docs/library-zh-framed.png",
  ...pkg.files.filter((file) => file.startsWith("docs/brand/")),
  "CONTRIBUTING.md",
  "VALIDATION.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
])
  assert.deepEqual(files[file], files[`packages/occo/${file}`], `Documentation copies differ: ${file}`)

const archive = new Bun.Archive(await Bun.file(path.join(root, `artifacts/occo-${pkg.version}.tgz`)).arrayBuffer())
const packaged = await archive.files()
assert.deepEqual([...packaged.keys()].sort(), ["package.json", ...pkg.files].map((file) => `package/${file}`).sort())
for (const [name, file] of packaged) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  assert.deepEqual(
    bytes,
    await Bun.file(path.join(root, "packages/occo", name.slice(8))).bytes(),
    `Stale package: ${name}`,
  )
  if (!name.endsWith(".png")) check(name, new TextDecoder().decode(bytes))
}
for (const [name, bytes] of Object.entries(files))
  if (!name.endsWith(".png")) check(name, new TextDecoder().decode(bytes))

const output = path.join(root, `artifacts/occo-${pkg.version}-source.tgz`)
await Bun.Archive.write(
  output,
  Object.fromEntries(Object.entries(files).map(([name, bytes]) => [`occo/${name}`, bytes])),
  { compress: "gzip" },
)
const exported = await new Bun.Archive(await Bun.file(output).arrayBuffer()).files()
assert.deepEqual([...exported.keys()].sort(), manifest.map((file) => `occo/${file}`).sort())
for (const [name, file] of exported) assert.deepEqual(new Uint8Array(await file.arrayBuffer()), files[name.slice(5)])
console.log(`Release checks passed: ${manifest.length} source files, ${packaged.size} package files.`)
console.log(`Created artifacts/occo-${pkg.version}-source.tgz`)

function check(name: string, text: string) {
  const normalized = text.replaceAll("\\\\", "/").replaceAll("\\", "/").toLowerCase()
  for (const directory of [root, homedir()])
    assert.ok(!normalized.includes(directory.replaceAll("\\", "/").toLowerCase()), `Local directory in ${name}`)
  assert.ok(!/\b[a-z]:[\\/]+[\w.-]|\/(?:Users|home)\/[^/\s]+\//i.test(text), `Absolute user path in ${name}`)
  assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text), `Private key in ${name}`)
  assert.ok(!/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/.test(text), `Credential in ${name}`)
}
