import solid from "@opentui/solid/bun-plugin"

const gate = process.argv.includes("--gate")
const integration = process.argv.includes("--integration")
const result = await Bun.build({
  entrypoints: [gate ? "./test/host-gate.tsx" : integration ? "./test/host-integration.ts" : "./src/tui.tsx"],
  outdir: gate ? "./dist/gate" : integration ? "./dist/integration" : "./dist",
  target: "bun",
  format: "esm",
  plugins: [solid],
  external: ["@opencode/*", "@opentui/*", "solid-js", "solid-js/*"],
  sourcemap: "linked",
})
if (!result.success) throw new AggregateError(result.logs, "Build failed")
if (gate)
  await Bun.write(
    "./dist/gate/package.json",
    JSON.stringify({
      name: "occo-gate",
      type: "module",
      exports: { "./tui": "./host-gate.js" },
    }),
  )
if (integration)
  await Bun.write(
    "./dist/integration/package.json",
    JSON.stringify({
      name: "occo-integration",
      type: "module",
      exports: { "./tui": "./host-integration.js" },
    }),
  )
