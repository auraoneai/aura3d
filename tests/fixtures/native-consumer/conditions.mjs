import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const manifest = JSON.parse(readFileSync("node_modules/@aura3d/engine/package.json", "utf8"));
const conditions = process.argv[2] === "browser" ? new Set(["browser", "import", "node", "default"]) : new Set(["node", "import", "default"]);
function select(value, enabled, viaRequire = false) {
  if (typeof value === "string") return { target: value, viaRequire };
  if (Array.isArray(value)) return value.map(target => select(target, enabled, viaRequire)).find(Boolean);
  if (!value || typeof value !== "object") return undefined;
  for (const [condition, target] of Object.entries(value)) {
    if (enabled.has(condition)) {
      const selected = select(target, enabled, viaRequire || condition === "require");
      if (selected) return selected;
    }
  }
}
const expected = select(manifest.exports?.["."] ?? manifest.exports, conditions);
assert.ok(expected, "packed root has no import/default condition");
const actual = fileURLToPath(import.meta.resolve("@aura3d/engine"));
assert.equal(realpathSync(actual), realpathSync(resolve("node_modules/@aura3d/engine", expected.target)));
const root = manifest.exports?.["."] ?? manifest.exports;
const required = select(root, new Set(["node", "require", "default"]));
if (required?.viaRequire) {
  const require = createRequire(import.meta.url);
  assert.equal(realpathSync(require.resolve("@aura3d/engine")), realpathSync(resolve("node_modules/@aura3d/engine", required.target)));
  assert.doesNotThrow(() => require("@aura3d/engine"), "declared CommonJS condition must load");
  console.log("CommonJS: declared and loaded");
} else {
  console.log("CommonJS: no explicit require condition declared");
}
console.log(`ESM condition ${process.argv[2] ?? "node"}: ${expected.target}`);
