#!/usr/bin/env node
// Test double for the aura3d CLI: prints the same JSON shapes (`print(...)` in the real CLI) for the wrapped commands.
const args = process.argv.slice(2);
if (args[0] === "check-deploy") {
  const bad = args.includes("--release");
  console.log(JSON.stringify({ ok: !bad, failures: bad ? ["release: missing LICENSE"] : [], warnings: [], messages: ["checked"] }, null, 2));
  process.exit(bad ? 1 : 0);
}
if (args[0] === "assets" && args[1] === "inspect") {
  console.log(JSON.stringify({ file: args[2], triangles: 1234, materials: 2, bounds: { min: [0, 0, 0], max: [1, 1, 1] } }));
} else if (args[0] === "assets" && args[1] === "resolve") {
  console.log(JSON.stringify({ ok: true, need: args[2], dryRun: args.includes("--dry-run"), candidates: [{ id: "kenney-robot", license: "CC0" }], assetName: args[args.indexOf("--name") + 1] ?? null }));
} else {
  console.error("unknown command");
  process.exit(2);
}
