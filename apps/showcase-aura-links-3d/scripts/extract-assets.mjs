#!/usr/bin/env node
// Writes apps/showcase-aura-links-3d/src/aura-assets.ts: the subset of the root typed catalog (src/aura-assets.ts) this game
// loads, so the page no longer ships the 2.6 MB shared catalog (audit RH-06). Entries are copied verbatim (same url, hash,
// bounds, metadata), so the root aura.assets.json stays the single source of truth.
// Run after the root catalog changes: node apps/showcase-aura-links-3d/scripts/extract-assets.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootCatalog = resolve(appDir, "../../src/aura-assets.ts");
const outFile = resolve(appDir, "src/aura-assets.ts");

/** every catalog key the game reads: the Idol image-to-3D models (tools/idol/specs/aura-links-3d.json, admitted with tools/idol/admit.sh) */
export const LINKS_ASSET_KEYS = [
  "linksIdolGolferBlue",
  "linksIdolGolferRed",
  "linksIdolGolferWhite",
  "linksIdolGolferNavy",
  "linksIdolGolferOrange",
  "linksIdolCaddie",
  "linksIdolSpectatorA",
  "linksIdolSpectatorB",
  "linksIdolSpectatorC",
  "linksIdolSpectatorD",
  "linksIdolGolfCart",
  "linksIdolTourBag",
  "linksIdolBallWasher",
  "linksIdolClubhouseStone",
  "linksIdolClubhouseTudor",
  "linksIdolOakGreen",
  "linksIdolMapleRed",
  "linksIdolMapleOrange",
  "linksIdolClumpDunes",
  "linksIdolClumpParkland",
  "linksIdolClumpAlpine",
  "linksIdolClumpNight",
  "linksIdolClumpAsh"
];

/** the game's own synthesised cues (scripts/build-sfx.mjs), served from this app's public/aura-assets */
export const LINKS_LOCAL_ASSETS = [
  // GU47 phase 9 (D2): replaces the drive cue; CC0 Aura3D synthesis, scripts/build-sfx.mjs
  { key: "linksDriveStrikeSfx", type: "audio", url: "/aura-assets/linksDriveStrikeSfx.2a73323c.wav", hash: "sha256-2a73323cc0a78f1c411a7df7ccc1f21c2374882451504290a2dd1147e07c0d5f" },
  // GU47 phase 9 (D2): replaces the cup cue; CC0 Aura3D synthesis, scripts/build-sfx.mjs
  { key: "linksCupDropSfx", type: "audio", url: "/aura-assets/linksCupDropSfx.106be901.wav", hash: "sha256-106be9019526f3f68bcd6c6b72e224ea2d95bfc3715082b3b4b1b4ac762d9462" },
  // GU47 phase 9 (D2): replaces the flagstick rattle cue; CC0 Aura3D synthesis, scripts/build-sfx.mjs
  { key: "linksFlagstickRattleSfx", type: "audio", url: "/aura-assets/linksFlagstickRattleSfx.18e2730e.wav", hash: "sha256-18e2730e977dda6705e61f52b94ed545037c59e89cf5c45fd2dfbe9d45c6450c" },
  // GU47 phase 9 (D2): replaces the birdie/par chime; CC0 Aura3D synthesis, scripts/build-sfx.mjs
  { key: "linksBirdieChimeSfx", type: "audio", url: "/aura-assets/linksBirdieChimeSfx.a5239014.wav", hash: "sha256-a5239014921336e9c6f14f389c3fa1c670a30fcbe21caae89d02c707f910e426" },
  // GU47 phase 9 (D2): replaces the bogey sting; CC0 Aura3D synthesis, scripts/build-sfx.mjs
  { key: "linksBogeyThudSfx", type: "audio", url: "/aura-assets/linksBogeyThudSfx.6042e2b1.wav", hash: "sha256-6042e2b15846da4911ad21a7f18a53f9ce96658463a5b20470c6dc7d5c1fb2d0" },
  // GU47 phase 9 (D2): replaces the menu cue; CC0 Aura3D synthesis, scripts/build-sfx.mjs
  { key: "linksMenuTickSfx", type: "audio", url: "/aura-assets/linksMenuTickSfx.7d711e78.wav", hash: "sha256-7d711e7880b855e38a46a6dbf0c9ceacf33adff66d27d3ed9e0396e14bb23c23" },
  // GU47 phase 9 (D2): replaces the course wind bed; CC0 Aura3D synthesis, scripts/build-sfx.mjs
  { key: "linksCoastWindLoopSfx", type: "audio", url: "/aura-assets/linksCoastWindLoopSfx.2fa04237.wav", hash: "sha256-2fa04237e22c28431ccd1831ee4682c2d4eede23e89bc05723c59a18bbfcceca" }
];

const src = readFileSync(rootCatalog, "utf8");
const valuesAt = src.indexOf("defineAuraAssets({");
if (valuesAt < 0) throw new Error("root catalog: defineAuraAssets({ not found");

const typeLines = [];
const valueBlocks = [];
for (const key of LINKS_ASSET_KEYS) {
  const typeMatch = new RegExp(`^  readonly "${key}": .*$`, "m").exec(src.slice(0, valuesAt));
  if (!typeMatch) throw new Error(`root catalog: no type line for ${key}`);
  typeLines.push(typeMatch[0]);
  const start = src.indexOf(`\n  "${key}": {`, valuesAt);
  if (start < 0) throw new Error(`root catalog: no entry for ${key}`);
  const end = src.indexOf("\n  }", start + 1);
  const close = src.slice(end, end + 5).startsWith("\n  },") ? end + 5 : end + 4;
  valueBlocks.push(src.slice(start + 1, close).replace(/,$/, ""));
}

for (const a of LINKS_LOCAL_ASSETS) {
  if (a.type === "audio") {
    typeLines.push(`  readonly "${a.key}": AuraAssetDefinition & { readonly type: "audio"; readonly format: "wav"; readonly url: string; readonly hash: string; };`);
    valueBlocks.push(`  "${a.key}": {\n    type: "audio",\n    format: "wav",\n    url: "${a.url}",\n    hash: "${a.hash}"\n  }`);
    continue;
  }
  typeLines.push(`  readonly "${a.key}": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };`);
  valueBlocks.push(`  "${a.key}": {\n    type: "model",\n    format: "glb",\n    url: "${a.url}",\n    hash: "${a.hash}",\n    bounds: [\n      ${a.bounds.join(",\n      ")}\n    ]\n  }`);
}
const total = LINKS_ASSET_KEYS.length + LINKS_LOCAL_ASSETS.length;

const out = `// Generated by apps/showcase-aura-links-3d/scripts/extract-assets.mjs from src/aura-assets.ts — do not edit by hand.
// Aura Links 3D loads only these ${total} entries instead of the shared 1,000+ entry catalog (audit RH-06).
import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

type AuraLinksAssetDefinitions = {
${typeLines.join("\n")}
};

export const assets: AuraAssetMap<AuraLinksAssetDefinitions> = defineAuraAssets({
${valueBlocks.join(",\n")}
} as const);

export type AuraLinksAssets = typeof assets;
`;

if (process.argv.includes("--check")) {
  const current = readFileSync(outFile, "utf8");
  if (current !== out) {
    console.error("apps/showcase-aura-links-3d/src/aura-assets.ts is stale: run node apps/showcase-aura-links-3d/scripts/extract-assets.mjs");
    process.exit(1);
  }
  console.log("aura-links-3d asset subset is current");
} else {
  writeFileSync(outFile, out);
  console.log(`wrote ${outFile} (${total} assets, ${out.length} bytes)`);
}
