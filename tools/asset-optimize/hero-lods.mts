// Phase 5 (§6.6) — produce the hero's 2-level skinned LOD + collision sidecar
// INSIDE the curated library, and bind the `derived` record onto the
// auraclash-player-rig entry in aura.library.json.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { optimizeGLB } from "./pipeline.js";
import { ASSET_OPTIMIZE_PROFILES } from "./profiles.js";

const repoRoot = process.cwd();
const kitDir = "assets/library/characters/humanoid-pbr";
const src = join(repoRoot, "public/aura-assets/auraClashPlayerRig.3318d671.glb");
const bytes = readFileSync(src);

const result = await optimizeGLB(new Uint8Array(bytes), {
  profile: ASSET_OPTIMIZE_PROFILES["hero-character"],
  mobileCap: 1024,
  requireKtx2: false,
  log: (l) => console.log(l),
});

const hash = createHash("sha256").update(result.glb).digest("hex").slice(0, 8);
const glbName = `auraclash-player-rig-lod.${hash}.glb`;
const colName = `auraclash-player-rig-lod.${hash}.collision.glb`;
mkdirSync(join(repoRoot, kitDir), { recursive: true });
writeFileSync(join(repoRoot, kitDir, glbName), Buffer.from(result.glb));
if (result.collisionGlb) writeFileSync(join(repoRoot, kitDir, colName), Buffer.from(result.collisionGlb));

// Bind the derived record onto the manifest entry.
const manifestPath = join(repoRoot, "aura.library.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entry = manifest.entries.find((e) => e.kit === "characters/humanoid-pbr" && e.id === "auraclash-player-rig");
if (!entry) throw new Error("auraclash-player-rig entry missing");
entry.derived = {
  url: `${kitDir}/${glbName}`,
  hash: `sha256:${createHash("sha256").update(result.glb).digest("hex")}`,
  ...(result.collisionGlb ? { collisionUrl: `${kitDir}/${colName}` } : {}),
  profile: "hero-character",
  steps: result.steps,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(JSON.stringify({
  derivedUrl: `${kitDir}/${glbName}`,
  hash: entry.derived.hash,
  triangles: result.budget.triangles,
  flags: result.flags,
  requiredDecoders: result.requiredDecoders,
  steps: result.steps.map((s) => s.step),
}, null, 1));
