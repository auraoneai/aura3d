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

registerPrd11DrawIdShader();
registerPrd11InstanceEmissiveShader();

const outDir = process.argv[2] ?? path.join("tools", "wgsl-validate", "out");
mkdirSync(outDir, { recursive: true });

const twins = wgslTwins();
for (const twin of twins) {
  writeFileSync(path.join(outDir, `${twin.chunkName}.wgsl`), twin.wgsl, "utf8");
}

const parity = manifestParity();
writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify({ generated: new Date().toISOString(), twins: twins.map((t) => t.chunkName), parity }, null, 2),
  "utf8"
);
console.log(`wgsl-validate: emitted ${twins.length} twin(s); parity missing=${parity.missing.length}`);
