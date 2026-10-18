#!/usr/bin/env node
/**
 * Shrink a raw Meshy GLB export into something the Aura3D guardrails accept.
 *
 * Raw Meshy refine output routinely lands at 15-80 MB: 200k-1.7M vertices and
 * 4K PNG texture sets. The engine guardrails cap admitted assets at 20,000
 * vertices and ~2 MB, because main-thread glTF parsing stalls and GPU memory
 * goes with it when several of them load in one scene.
 *
 * Usage:
 *   node arcade/tools/shrink-glb.mjs <input.glb> <output.glb>
 *
 * Env:
 *   TARGET_VERTS  vertex ceiling after weld  (default 16000)
 *   MAX_TEX       texture edge in pixels     (default 1024)
 *   TEX_QUALITY   JPEG quality               (default 80)
 *   SIMPLIFY_ERROR        simplifier error bound (default 0.02)
 *   SIMPLIFY_LOCK_BORDER  false lets the simplifier collapse UV-seam border
 *                         edges. Hard-surface shells with many UV islands
 *                         (vehicles, machines) stall above the ceiling with
 *                         borders locked; unlock only if the default stalls.
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const TARGET_VERTS = Number(process.env.TARGET_VERTS ?? 16000);
const MAX_TEX = Number(process.env.MAX_TEX ?? 1024);
const TEX_QUALITY = Number(process.env.TEX_QUALITY ?? 80);
const SIMPLIFY_ERROR = Number(process.env.SIMPLIFY_ERROR ?? 0.02);
const SIMPLIFY_LOCK_BORDER = process.env.SIMPLIFY_LOCK_BORDER !== "false";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error("usage: shrink-glb.mjs <input.glb> <output.glb>");
  process.exit(2);
}
const input = resolve(inputArg);
const output = resolve(outputArg);

function countVerts(doc) {
  let verts = 0;
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (pos) verts += pos.getCount();
      const idx = prim.getIndices();
      if (idx) tris += idx.getCount() / 3;
    }
  }
  return { verts, tris: Math.round(tris) };
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const beforeBytes = (await stat(input)).size;
const before = countVerts(doc);

await doc.transform(dedup(), prune(), weld({ tolerance: 0.0001 }), resample());
const welded = countVerts(doc);

// A single simplify pass undershoots: it targets triangle count, but the
// resulting vertex count stays higher because normals and UV seams keep
// positions split. Iterate until the vertex ceiling is actually met.
let passes = 0;
for (; passes < 6; passes += 1) {
  const current = countVerts(doc).verts;
  if (current <= TARGET_VERTS) break;
  const ratio = Math.max(0.04, (TARGET_VERTS / current) * 0.9);
  await doc.transform(
    simplify({ simplifier: MeshoptSimplifier, ratio, error: SIMPLIFY_ERROR, lockBorder: SIMPLIFY_LOCK_BORDER })
  );
  await doc.transform(weld({ tolerance: 0.0001 }), prune());
}

await doc.transform(
  textureCompress({
    encoder: sharp,
    targetFormat: "jpeg",
    resize: [MAX_TEX, MAX_TEX],
    quality: TEX_QUALITY
  }),
  prune()
);

const after = countVerts(doc);
await mkdir(dirname(output), { recursive: true });
await io.write(output, doc);
const afterBytes = (await stat(output)).size;

const report = {
  input,
  output,
  simplifyPasses: passes,
  verts: { before: before.verts, welded: welded.verts, after: after.verts, target: TARGET_VERTS },
  tris: { before: before.tris, after: after.tris },
  bytes: { before: beforeBytes, after: afterBytes, mbAfter: +(afterBytes / 1024 / 1024).toFixed(2) },
  withinVertexCeiling: after.verts <= 20000,
  withinSizeCeiling: afterBytes <= 2 * 1024 * 1024
};
await writeFile(`${output}.report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
