#!/usr/bin/env node
/**
 * Build a minimal multi-part glTF fixture that reproduces the "secondary meshes do not render"
 * class of defect.
 *
 * ## Why a synthetic fixture
 *
 * The observed failure (`turboRaceCar`: body renders, four wheel meshes do not) had many confounds:
 * 71k triangles, external textures, a deep Sketchfab node hierarchy, node `matrix` transforms, shared
 * bufferViews with non-zero accessor offsets, and two materials. Any of those could have been the
 * cause, so the reproduction has to isolate them.
 *
 * This fixture keeps exactly the properties the assignment requires and nothing else:
 *
 *  - one body mesh plus four "wheel" meshes (5 primitives total)
 *  - wheels on a *distinct* material from the body
 *  - child-node transforms (wheels are children of a `wheels` group node, which is itself a child of a
 *    root node, matching the real asset's `Sketchfab_model > ... > wheels > wheelBackL` depth)
 *  - a shared bufferView with *differing* accessor byteOffsets, so an offset bug is exposed
 *  - uint32 indices over a low vertex count, so an index-type downcast bug is exposed
 *  - wheels positioned outside the body silhouette, so visibility is provable from a render
 *
 * Geometry is deliberately trivial (axis-aligned boxes) so a rendered screenshot is unambiguous: if a
 * wheel primitive draws, a coloured box appears at a known corner.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("tests/fixtures/gltf-multipart/body-and-four-wheels.glb");

/** Axis-aligned box vertex positions + indices. */
function box(cx, cy, cz, hx, hy, hz) {
  const p = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    p.push(cx + sx * hx, cy + sy * hy, cz + sz * hz);
  }
  // 12 triangles over the 8 corners.
  const idx = [
    0,1,3, 0,3,2, 4,6,7, 4,7,5, 0,4,5, 0,5,1,
    2,3,7, 2,7,6, 0,2,6, 0,6,4, 1,5,7, 1,7,3
  ];
  return { positions: Float32Array.from(p), indices: Uint32Array.from(idx) };
}

// Body sits above the ground; wheels sit low and OUTSIDE the body half-width so a render can prove
// visibility rather than merely existence.
const bodyHalfWidth = 0.9;
const wheelHalfWidth = 0.25;
const wheelOutboard = bodyHalfWidth + wheelHalfWidth * 0.6; // protrudes past the body silhouette
const parts = [
  { name: "body", geom: box(0, 0.7, 0, bodyHalfWidth, 0.45, 2.0), material: 0, translation: [0, 0, 0] },
  { name: "wheelFrontL", geom: box(0, 0, 0, wheelHalfWidth, 0.35, 0.35), material: 1, translation: [ wheelOutboard, 0.35,  1.3] },
  { name: "wheelFrontR", geom: box(0, 0, 0, wheelHalfWidth, 0.35, 0.35), material: 1, translation: [-wheelOutboard, 0.35,  1.3] },
  { name: "wheelBackL",  geom: box(0, 0, 0, wheelHalfWidth, 0.35, 0.35), material: 1, translation: [ wheelOutboard, 0.35, -1.3] },
  { name: "wheelBackR",  geom: box(0, 0, 0, wheelHalfWidth, 0.35, 0.35), material: 1, translation: [-wheelOutboard, 0.35, -1.3] }
];

// Pack every part's positions into ONE bufferView so accessor byteOffsets differ per part. Indices go
// into a second shared bufferView, also at differing offsets.
const posChunks = [];
const idxChunks = [];
const accessors = [];
const meshes = [];
let posOffset = 0;
let idxOffset = 0;

for (const part of parts) {
  const { positions, indices } = part.geom;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(min[a], positions[i + a]);
      max[a] = Math.max(max[a], positions[i + a]);
    }
  }
  const posAccessor = accessors.length;
  accessors.push({ bufferView: 0, byteOffset: posOffset, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max });
  const idxAccessor = accessors.length;
  // componentType 5125 (uint32) with a tiny vertex count: exposes an index down-cast bug.
  accessors.push({ bufferView: 1, byteOffset: idxOffset, componentType: 5125, count: indices.length, type: "SCALAR" });
  posChunks.push(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength));
  idxChunks.push(Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength));
  posOffset += positions.byteLength;
  idxOffset += indices.byteLength;
  meshes.push({ name: `${part.name}_mesh`, primitives: [{ attributes: { POSITION: posAccessor }, indices: idxAccessor, material: part.material, mode: 4 }] });
}

const posBytes = Buffer.concat(posChunks);
const idxBytes = Buffer.concat(idxChunks);
/**
 * Pad a chunk to a 4-byte boundary.
 *
 * The pad byte matters: glTF 2.0 requires the JSON chunk to be padded with **spaces (0x20)** and the
 * BIN chunk with **zeros (0x00)**. Padding JSON with zeros produces trailing NULs inside the declared
 * chunk length, which `JSON.parse` rejects. That is a real spec violation, not a loader quirk, so the
 * fixture must get it right or it tests the wrong thing.
 */
const align4 = (b, fill = 0x00) => (b.length % 4 === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]));
const bin = Buffer.concat([align4(posBytes), align4(idxBytes)]);

// Node hierarchy: root -> chassis -> body, and root -> wheels -> four wheel nodes. The intermediate
// group nodes carry transforms so a missing parent-transform composition is exposed.
const nodes = [
  { name: "root", children: [1, 2], translation: [0, 0.05, 0] },
  { name: "chassis", children: [3], translation: [0, 0.02, 0] },
  { name: "wheels", children: [4, 5, 6, 7], translation: [0, 0.01, 0] },
  { name: "body", mesh: 0, translation: parts[0].translation },
  ...parts.slice(1).map((part, i) => ({ name: part.name, mesh: i + 1, translation: part.translation }))
];

const json = {
  asset: { version: "2.0", generator: "aura3d make-multipart-fixture" },
  scene: 0,
  scenes: [{ name: "MultipartScene", nodes: [0] }],
  nodes,
  meshes,
  accessors,
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBytes.length },
    { buffer: 0, byteOffset: align4(posBytes, 0x00).length, byteLength: idxBytes.length }
  ],
  buffers: [{ byteLength: bin.length }],
  materials: [
    { name: "bodyPaint", pbrMetallicRoughness: { baseColorFactor: [0.85, 0.12, 0.12, 1], metallicFactor: 0.2, roughnessFactor: 0.5 } },
    // Distinct material for the wheels, in a colour no body pixel can produce, so a screenshot can
    // attribute visible pixels to the wheel primitives specifically.
    { name: "tyreRubber", pbrMetallicRoughness: { baseColorFactor: [0.05, 0.85, 0.35, 1], metallicFactor: 0.0, roughnessFactor: 0.9 } }
  ]
};

const jsonBytes = align4(Buffer.from(JSON.stringify(json)), 0x20);
const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
const out = Buffer.alloc(total);
let o = 0;
out.writeUInt32LE(0x46546c67, o); o += 4;
out.writeUInt32LE(2, o); o += 4;
out.writeUInt32LE(total, o); o += 4;
out.writeUInt32LE(jsonBytes.length, o); o += 4;
out.writeUInt32LE(0x4e4f534a, o); o += 4;
jsonBytes.copy(out, o); o += jsonBytes.length;
out.writeUInt32LE(bin.length, o); o += 4;
out.writeUInt32LE(0x004e4942, o); o += 4;
bin.copy(out, o);
writeFileSync(OUT, out);
console.log(`wrote ${OUT}`);
console.log(`  meshes=${meshes.length} accessors=${accessors.length} materials=${json.materials.length} nodes=${nodes.length} bin=${bin.length}B`);
console.log(`  wheels protrude to |x|=${wheelOutboard.toFixed(3)} vs body half-width ${bodyHalfWidth}`);
