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

/** every catalog key the game reads (main.ts and game/rig.ts) */
export const LINKS_ASSET_KEYS = [
  "linksGolfCartMeshy",
  "linksGolferAthleteMeshy",
  "linksPinFlagMeshy",
  "propPineTree",
  "propRockA"
];

/**
 * GU47 WP-36: Links-owned Meshy assets admitted with `aura3d assets import-meshy --into apps/showcase-aura-links-3d/assets
 * --prefix links` (isolated import; the shared root catalog is never written). The hashed GLB is served from this app's
 * public/aura-assets (layered over the root public tree by the dev server and the capture serve step); licence and rights
 * rows live in assets/provenance/<key>.rights.json and .meta.json.
 * GU47 phase 9: CC0 catalog models admitted the same way (scripts in the lane report; source ids claimed for this game in the
 * GU47 CC0 ledger) and the game's own synthesised cues (scripts/build-sfx.mjs, audio rows: `type: "audio"`).
 */
export const LINKS_LOCAL_ASSETS = [
  // golfMarram (WP-36 row, LINKS-07): meshoptimizer sloppy simplify 159,492 -> 6,793 triangles, 1k -> 512 px maps
  { key: "links_marram", url: "/aura-assets/links_marram.1a43521b.glb", hash: "sha256-1a43521bacd8787754a0795d6467319e52ab6bba48a7c8eec192b08d47ce754e", bounds: [1.762, 1.27, 1.82] },
  // GU47 phase 9 (D2): replaces the dunes landmark tower; CC0 kenney:city-kit-industrial:water-tower (Kenney), 968 triangles
  { key: "linksDunesBeaconTower", url: "/aura-assets/linksDunesBeaconTower.76dd47f8.glb", hash: "sha256-76dd47f8fefa762e1d7f6a27e545cc211f2f726a67dbd32bc86cafb2e9bac303", bounds: [0.852, 2.142, 0.832] },
  // GU47 phase 9 (D2): replaces the dunes burn bridge; CC0 kenney:mini-forest:bridge (Kenney), 372 triangles
  { key: "linksBurnFootbridge", url: "/aura-assets/linksBurnFootbridge.9d2c3d5c.glb", hash: "sha256-9d2c3d5ccd977379d966b5777bb0cd37fdc8f83c59044ef9652939e35a013b03", bounds: [1.041, 0.473, 0.801] },
  // GU47 phase 9 (D2): replaces the Cinder Rim crater spire; CC0 quaternius:ultimate-platformer-pack:Gem_Blue (Quaternius), 44 triangles
  { key: "linksCraterCrystal", url: "/aura-assets/linksCraterCrystal.971f0bc5.glb", hash: "sha256-971f0bc53af16ee54b1df9e5e2dabc7bf927e406bad6c6f652b0e8f6dec62103", bounds: [0.986, 2.109, 0.697] },
  // GU47 phase 9 (D2): replaces the Cloud Terrace backdrop card (now a snow-pine treeline); CC0 kenney:platformer-kit:tree-pine-snow (Kenney), 204 triangles
  { key: "linksAlpineSnowPine", url: "/aura-assets/linksAlpineSnowPine.c20c1f4f.glb", hash: "sha256-c20c1f4fcaeb58d22257c018070b3749ff7f949e8a476f81cd14d1c878144ff4", bounds: [0.948, 1.997, 0.948] },
  // GU47 phase 9 (D2): replaces the Neon Bay floodlight pylons; CC0 kenney:city-kit-roads:light-curved-double (Kenney), 152 triangles
  { key: "linksHarbourFloodlight", url: "/aura-assets/linksHarbourFloodlight.f84c02e6.glb", hash: "sha256-f84c02e6be3f9320ae281a96345c96ef8f8c2ffef2d5a1f1b5b809d9d8a789db", bounds: [0.05, 0.675, 0.4] },
  // GU47 phase 9 (D2): replaces Neon Bay skyline tower 1; CC0 kenney:city-kit-commercial:building-skyscraper-e (Kenney), 1156 triangles
  { key: "linksHarbourTowerA", url: "/aura-assets/linksHarbourTowerA.a75e53fe.glb", hash: "sha256-a75e53fed1ff8451d81a3662f2ba6e0a72eea745c30003dea96f577e434a4f18", bounds: [1.295, 4.08, 1.242] },
  // GU47 phase 9 (D2): replaces Neon Bay skyline tower 2; CC0 kenney:city-kit-commercial:building-skyscraper-d (Kenney), 1892 triangles
  { key: "linksHarbourTowerB", url: "/aura-assets/linksHarbourTowerB.55b28fce.glb", hash: "sha256-55b28fcefefc24bb81d876632e12b35e89b5ca9819d0c981c3268d76be31cae6", bounds: [1.28, 5.47, 1.388] },
  // GU47 phase 9 (D2): replaces Neon Bay skyline tower 3; CC0 kenney:city-kit-commercial:building-skyscraper-b (Kenney), 1592 triangles
  { key: "linksHarbourTowerC", url: "/aura-assets/linksHarbourTowerC.ac4622ed.glb", hash: "sha256-ac4622eded3db9ff49abbe5ce770159ed4982f9d510373a2540b7b56e53151dd", bounds: [1.36, 4.48, 1.36] },
  // GU47 phase 9 (D2): replaces the Mare habitat landmark; CC0 aura-library:kaykit-lander-b (Kay Lousberg (KayKit)), 1208 triangles
  { key: "linksMareLander", url: "/aura-assets/linksMareLander.092da6ed.glb", hash: "sha256-092da6eda89f9c6553029ca8ccdd8c69df7a7c9cd6998b612f137fa15fcf996c", bounds: [1.372, 1.095, 1.422] },
  // GU47 phase 9 (D2): replaces the Mare rover; CC0 kenney:car-kit:race-future (Kenney), 1404 triangles
  { key: "linksMareRover", url: "/aura-assets/linksMareRover.4f632143.glb", hash: "sha256-4f632143a57b4c92c54c81d5fcb4e91fb238c9378a2445d0c9ec5d98385b4305", bounds: [1.2, 0.833, 2.66] },
  // GU47 phase 9 (D2): replaces the Mare relay mast; CC0 os3a:crystal-crossroads-041 (Polygonal Mind), 328 triangles
  { key: "linksMareRelay", url: "/aura-assets/linksMareRelay.de4b176d.glb", hash: "sha256-de4b176dcd63e2b231bdf1a39e6523858580de94ec7a79137dda54ef9969b72e", bounds: [0.942, 1.406, 0.742] },
  // GU47 phase 9 (D2): replaces the golf ball; CC0 quaternius:ultimate-platformer-pack:Cannonball (Quaternius), 380 triangles
  { key: "linksGolfBall", url: "/aura-assets/linksGolfBall.1267e1a4.glb", hash: "sha256-1267e1a42d86f549c7d8caba48368a4a0e392782b575cf4d7426068e44b68285", bounds: [1.125, 1.141, 1.122] },
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
