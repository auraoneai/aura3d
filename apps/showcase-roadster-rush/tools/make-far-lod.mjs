// Builds the far-distance level of detail of the baked Meshy traffic: geometry simplified with meshoptimizer to about a
// tenth of the triangles and textures downscaled to 256 px. The renderer draws traffic beyond 90 m with these (audit
// RR-1/RR-E1: drawing every simulated vehicle must not multiply the triangle count). Same axes and bounds as the source.
// usage (repo root): node apps/showcase-roadster-rush/tools/make-far-lod.mjs
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync } from "node:fs";
const require = createRequire(new URL("../../../package.json", import.meta.url).pathname);
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { textureCompress, prune, dedup, compactPrimitive } = require("@gltf-transform/functions");
const { MeshoptSimplifier } = require("meshoptimizer");
const sharp = require("sharp");
await MeshoptSimplifier.ready;

const dir = new URL("../src/assets/meshy/", import.meta.url).pathname;
const types = ["sedan", "hatch", "suv", "taxi", "van", "pickup", "boxtruck", "bus", "carrier"];
// the sky-lane car (public/aura-assets, used only by this game); its far LOD lives with the traffic LODs
const SOURCES = { skycar: new URL("../../../public/aura-assets/roadsterRushSkyCar.295dcba7.glb", import.meta.url).pathname };
mkdirSync(`${dir}lod`, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const tris = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0);
for (const t of [...types, ...Object.keys(SOURCES)]) {
  const doc = await io.read(SOURCES[t] ?? `${dir}${t}.glb`);
  const before = tris(doc);
  // Sloppy simplification ignores UV seams (the regular simplifier stops at about half the triangles on these scans); far
  // traffic is a few dozen pixels tall, so topology and seams do not show.
  for (const prim of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
    const indices = prim.getIndices();
    const pos = prim.getAttribute("POSITION");
    const src = Uint32Array.from(indices.getArray());
    const target = Math.floor(src.length / 3 * 0.1) * 3;
    const [next] = MeshoptSimplifier.simplifySloppy(src, pos.getArray(), 3, null, target, 1);
    indices.setArray(next);
    compactPrimitive(prim);
  }
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [256, 256], quality: 80 }),
    dedup(),
    prune()
  );
  const out = `${dir}lod/${t}.far.glb`;
  await io.write(out, doc);
  const sha = createHash("sha256").update(readFileSync(out)).digest("hex");
  console.log(JSON.stringify({ type: t, trisBefore: Math.round(before), trisAfter: Math.round(tris(doc)), sizeBytes: statSync(out).size, sha256: sha }));
}
