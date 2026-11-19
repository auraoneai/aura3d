#!/usr/bin/env node
// Regenerate src/art/idol-assets.ts: copy the shared-catalog entries of Bunker Zero's admitted Idol models
// (keys from tools/idol/specs/bunker-zero.json that exist in src/aura-assets.ts) into an app-local module, so the game
// never bundles the multi-megabyte shared catalog.
// Usage (repo root): node apps/showcase-bunker-zero/scripts/extract-idol-assets.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const spec = JSON.parse(readFileSync(resolve(repoRoot, "tools/idol/specs/bunker-zero.json"), "utf8"));
const src = readFileSync(resolve(repoRoot, "src/aura-assets.ts"), "utf8");
const out = resolve(appDir, "src/art/idol-assets.ts");
const lines = src.split("\n");
const start = lines.findIndex((l) => l.startsWith("export const assets"));
const entries = [];
const ids = [];
for (const { key } of spec.items) {
  const i = lines.findIndex((l, k) => k > start && l === `  "${key}": {`);
  if (i < 0) continue;
  let j = i + 1;
  while (!(lines[j] === "  }," || lines[j] === "  }")) j++;
  const body = lines.slice(i, j + 1).filter((l) => !/["'`]https?:\/\/[^"'`]*\.(?:glb|gltf)\b/i.test(l));
  body[body.length - 1] = "  },";
  entries.push(body.join("\n"));
  ids.push(key);
}
const text = `import { defineAuraAssets } from "@aura3d/engine";

/**
 * Bunker Zero's Idol image-to-3D models (first-person weapons, enemies, held guns, doors, pickups, bunker dressing), copied verbatim from the shared repo
 * catalog (\`src/aura-assets.ts\`) by scripts/extract-idol-assets.mjs so the game bundle never carries the whole shared
 * catalog. Generated — do not edit by hand. Provenance: apps/showcase-bunker-zero/assets/idol/<key>.idol.json.
 */
export const idolAssets = defineAuraAssets({
${entries.join("\n").replace(/,$/, "")}
});
`;
if (process.argv.includes("--check")) {
  if (readFileSync(out, "utf8") !== text) { console.error("idol-assets.ts is stale: run node apps/showcase-bunker-zero/scripts/extract-idol-assets.mjs"); process.exit(1); }
  console.log("idol-assets.ts up to date");
} else {
  writeFileSync(out, text);
  console.log(ids.length, "entries:", ids.join(" "));
}
