// Regenerate src/game/stage-assets.ts: copy the shared-catalog entries Iron Crown's stages use into an app-local module.
// Usage (repo root): node apps/showcase-iron-crown/scripts/extract-stage-assets.mjs src/aura-assets.ts \
//   apps/showcase-iron-crown/src/game/stages.ts apps/showcase-iron-crown/src/game/stage-assets.ts
import { readFileSync, writeFileSync } from "node:fs";
const [root, stagesPath, out] = process.argv.slice(2);
const src = readFileSync(root, "utf8");
const stages = readFileSync(stagesPath, "utf8");
const ids = [...new Set([...stages.matchAll(/stageAssets\.(\w+)/g)].map((m) => m[1]))].sort();
const lines = src.split("\n");
const start = lines.findIndex((l) => l.startsWith("export const assets"));
const entries = [];
for (const id of ids) {
  const i = lines.findIndex((l, k) => k > start && l === `  "${id}": {`);
  if (i < 0) throw new Error("missing " + id);
  let j = i + 1;
  while (!(lines[j] === "  }," || lines[j] === "  }")) j++;
  // Provenance download links (remote .glb URLs) are not needed at runtime and trip the game-checks provenance rule.
  const body = lines.slice(i, j + 1).filter((l) => !/["'`]https?:\/\/[^"'`]*\.(?:glb|gltf)\b/i.test(l));
  body[body.length - 1] = "  },";
  entries.push(body.join("\n"));
}
const header = `import { defineAuraAssets } from "@aura3d/engine";

/**
 * Iron Crown's stage props from the shared repo catalog (\`src/aura-assets.ts\`, 600+ entries, about 2.6 MB once bundled).
 * Only the entries the six stages use are kept here, copied verbatim (url, hash, bounds, metadata) except for the remote
 * provenance download links, so the game bundle no longer carries the whole shared catalog (audit row RH-06). The files
 * stay under the shared /aura-assets/ path. tests/unit/iron-crown/stage-assets.test.ts checks that every entry still
 * matches the shared catalog and that every \`stageAssets.<id>\` used in stages.ts is defined here.
 */
export const stageAssets = defineAuraAssets({
`;
writeFileSync(out, header + entries.join("\n").replace(/,$/, "") + "\n});\n");
console.log(ids.length, "entries:", ids.join(" "));
