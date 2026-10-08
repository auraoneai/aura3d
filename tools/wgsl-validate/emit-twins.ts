/**
 * PRD 11 Phase 6 groundwork (◦) — dumps every WGSL twin recorded in the
 * C-02 chunk manifest to `out/<chunk>.wgsl` plus `out/manifest.json`
 * (parity report: twins present, registered chunks missing twins per owner).
 *
 * Run: `pnpm exec tsx tools/wgsl-validate/emit-twins.ts` — the naga job then
 * validates each `.wgsl` file. Missing twins are reported, not failed
 * (§6.2: not fatal until G-WGPU is a "go").
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// Register lane-11 chunk owners so their twins enter the manifest.
import { registerPrd11DrawIdShader } from "../../packages/rendering/src/batching/shaders/drawId.glsl";
import { registerPrd11InstanceEmissiveShader } from "../../packages/rendering/src/batching/shaders/instanceEmissive.glsl";
import { wgslTwins, manifestParity } from "../../packages/rendering/src/program/chunks/manifest";
// T2.7 — the prd06 deform twins live in a leaf module so this tool registers
// them without pulling the lane's scene/engine import graph.
import { registerPrd06WgslTwins } from "../../packages/rendering/src/shaders/deform/twins";

registerPrd11DrawIdShader();
registerPrd11InstanceEmissiveShader();
registerPrd06WgslTwins();

const outDir = process.argv[2] ?? path.join("tools", "wgsl-validate", "out");
mkdirSync(outDir, { recursive: true });

const twins = wgslTwins();
const twinText = new Map(twins.map((t) => [t.chunkName, t.wgsl]));
/**
 * Chunks whose WGSL twins call sibling-chunk functions — WGSL has no
 * #include, so for standalone naga validation their emitted file composes the
 * twin with its `requires` chain in hookSplice order (deps first). The
 * registered twin text stays the pure per-chunk fragment; this affects only
 * what this tool writes to disk.
 */
const composeForValidation: Readonly<Record<string, readonly string[]>> = {
  a3d_prd06_deform: ["a3d_prd06_skinning_common", "a3d_prd06_morph_texture", "a3d_prd06_deform"]
};
for (const twin of twins) {
  const chain = composeForValidation[twin.chunkName];
  const text = chain ? chain.map((name) => twinText.get(name) ?? "").join("\n") : twin.wgsl;
  writeFileSync(path.join(outDir, `${twin.chunkName}.wgsl`), text, "utf8");
}

const parity = manifestParity();
writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify({ generated: new Date().toISOString(), twins: twins.map((t) => t.chunkName), parity }, null, 2),
  "utf8"
);
console.log(`wgsl-validate: emitted ${twins.length} twin(s); parity missing=${parity.missing.length}`);
