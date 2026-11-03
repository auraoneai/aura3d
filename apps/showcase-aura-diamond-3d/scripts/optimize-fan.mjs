// GU47 WP-36 (DIA-A2): the seated-fan Meshy row, simplified for ~600 instanced fans in the stands.
// node apps/showcase-aura-diamond-3d/scripts/optimize-fan.mjs <in.glb> <outDir> <baseName> [ratio] [error]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, prune, weld, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [input, outDir, base, ratioArg] = process.argv.slice(2);
const ratio = Number(ratioArg ?? "0.04");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const tris = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute("POSITION").getCount() / 3), 0);
const doc = await io.read(input);
const before = tris(doc);
await MeshoptSimplifier.ready;
// Sloppy simplify ignores the UV seams that stop the regular simplifier near 2.8k triangles; at stand distance a seated
// fan is a few dozen pixels tall, so the seam drift is not visible.
await doc.transform(weld());
const error = Number(process.argv[6] ?? "0.02");
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    const idx = prim.getIndices();
    if (!pos || !idx) continue;
    const indices = Uint32Array.from(idx.getArray());
    const positions = Float32Array.from(pos.getArray());
    const target = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3);
    const [out] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, error);
    idx.setArray(out);
    compactPrimitive(prim);
  }
}
await doc.transform(prune());
let resized = false;
try {
  const sharp = (await import("sharp")).default;
  await doc.transform(textureCompress({ encoder: sharp, resize: [256, 256] }));
  resized = true;
} catch {
  /* sharp not installed: keep the source maps */
}
const bytes = await io.writeBinary(doc);
const sha = createHash("sha256").update(bytes).digest("hex");
const name = `${base}.${sha.slice(0, 8)}.glb`;
writeFileSync(`${outDir}/${name}`, bytes);
console.log(JSON.stringify({ input, trisBefore: before, trisAfter: tris(doc), resized, name, sha: `sha256-${sha}`, sizeBefore: readFileSync(input).length, sizeAfter: bytes.length }));
