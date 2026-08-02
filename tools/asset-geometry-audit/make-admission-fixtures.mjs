#!/usr/bin/env node
/**
 * Build GLB fixtures for the two vehicle-admission cases the brief names that had no coverage.
 *
 * ## Why these two specifically
 *
 * The brief's admission fixture list is nine cases. Seven were already covered by
 * `asset-role-admission.test.ts` against injected facts, and the remaining two are the ones that can
 * only be proven end-to-end, because they are about whether the *auditor* derives the right facts from
 * a real file rather than whether admission reasons correctly about facts it is handed:
 *
 *  1. **transformed child wheel nodes** -- wheels whose world position exists only after composing a
 *     parent chain. `turboRaceCar` has a four-level Sketchfab hierarchy, so an auditor that read local
 *     translations would place every wheel at the origin, find one "corner", and reject a valid hero.
 *  2. **multi-material wheel meshes** -- a wheel split across tyre and rim materials, which is how
 *     real vehicle assets are authored. An auditor that treats one mesh as one part would see eight
 *     half-wheels instead of four wheels.
 *
 * Both fixtures use wheel-shaped proportions (near-square side profile, narrower than diameter, low on
 * the body) because that is what `wheel-detect` classifies. The existing
 * `body-and-four-wheels.glb` renderer fixture deliberately uses cubes, which is correct for proving
 * *draw* behaviour but is not a wheel to a geometry auditor -- a real distinction worth keeping.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Axis-aligned box positions + indices, centred on the origin. */
function box(hx, hy, hz) {
  const p = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    p.push(sx * hx, sy * hy, sz * hz);
  }
  const idx = [
    0,1,3, 0,3,2, 4,6,7, 4,7,5, 0,4,5, 0,5,1,
    2,3,7, 2,7,6, 0,2,6, 0,6,4, 1,5,7, 1,7,3
  ];
  return { positions: Float32Array.from(p), indices: Uint16Array.from(idx) };
}

const align4 = (b, fill = 0x00) => (b.length % 4 === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), fill)]));

/**
 * Assemble a GLB from parts. Each part is `{ primitives: [{ geom, material }], node }`.
 * A part with more than one primitive is a multi-material mesh.
 */
function writeGlb(outPath, parts, nodes, materials) {
  const posChunks = [];
  const idxChunks = [];
  const accessors = [];
  const meshes = [];
  let posOffset = 0;
  let idxOffset = 0;
  for (const part of parts) {
    const primitives = [];
    for (const { geom, material } of part.primitives) {
      const { positions, indices } = geom;
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
      accessors.push({ bufferView: 1, byteOffset: idxOffset, componentType: 5123, count: indices.length, type: "SCALAR" });
      posChunks.push(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength));
      idxChunks.push(Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength));
      posOffset += positions.byteLength;
      idxOffset += indices.byteLength;
      primitives.push({ attributes: { POSITION: posAccessor }, indices: idxAccessor, material, mode: 4 });
    }
    meshes.push({ name: `${part.name}_mesh`, primitives });
  }
  const posBytes = Buffer.concat(posChunks);
  const idxBytes = Buffer.concat(idxChunks);
  const bin = Buffer.concat([align4(posBytes), align4(idxBytes)]);
  const json = {
    asset: { version: "2.0", generator: "aura3d make-admission-fixtures" },
    scene: 0,
    scenes: [{ name: "AdmissionScene", nodes: [0] }],
    nodes,
    meshes,
    accessors,
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length },
      { buffer: 0, byteOffset: align4(posBytes).length, byteLength: idxBytes.length }
    ],
    buffers: [{ byteLength: bin.length }],
    materials
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
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, out);
  return { meshes: meshes.length, accessors: accessors.length, bytes: total };
}

/*
 * Proportions chosen against `wheel-detect`'s documented criteria, not by eye.
 *
 * The detector requires a wheel to sit low on the body: `topFraction = (wheel.hi.y - scene.lo.y) /
 * scene.height` must be <= 0.55. A first attempt used a 0.84-tall body with 0.7 wheels and measured
 * topFraction 0.680 -- the wheels reached two-thirds up a too-shallow body, so they read as bodywork
 * rather than as wheels. That is the fixture being wrong about vehicle proportions, not the detector.
 *
 * A real car is roughly 1.4m tall with 0.65m wheels, so the wheel top sits near 45% of body height.
 * These numbers reproduce that ratio: body height 1.4 (half 0.7) with 0.7-diameter wheels whose tops
 * reach 0.7 of a ~1.5 scene height.
 */
const WHEEL_R = 0.35;
const WHEEL_HALF_W = 0.18;
const BODY_HALF_H = 0.7;
const BODY_HALF_W = 0.9;
// Outboard so the wheels break the body silhouette and visibility is geometrically provable.
const OUTBOARD = BODY_HALF_W + WHEEL_HALF_W * 0.7;
const MATERIALS = [
  { name: "bodyPaint", pbrMetallicRoughness: { baseColorFactor: [0.2, 0.3, 0.7, 1], metallicFactor: 0.3, roughnessFactor: 0.5 } },
  { name: "tyreRubber", pbrMetallicRoughness: { baseColorFactor: [0.06, 0.06, 0.07, 1], metallicFactor: 0, roughnessFactor: 0.95 } },
  { name: "rimChrome", pbrMetallicRoughness: { baseColorFactor: [0.85, 0.86, 0.9, 1], metallicFactor: 0.95, roughnessFactor: 0.15 } }
];
const CORNERS = [[1.25, 1], [1.25, -1], [-1.25, 1], [-1.25, -1]];

/*
 * Fixture 1: transformed child wheel nodes.
 *
 * Every wheel mesh is centred on its own origin. Its world position exists *only* through a three-level
 * parent chain (root -> axleGroup -> hub -> wheel), with each level contributing translation. An auditor
 * that reads local transforms sees four wheels stacked at one point.
 */
const transformedParts = [
  { name: "body", primitives: [{ geom: box(BODY_HALF_W, BODY_HALF_H, 1.95), material: 0 }] },
  ...CORNERS.map(([z, xs], i) => ({ name: `wheel${i}`, primitives: [{ geom: box(WHEEL_HALF_W, WHEEL_R, WHEEL_R), material: 1 }] }))
];
const transformedNodes = [
  { name: "root", children: [1, 2], translation: [0, 0.05, 0] },
  { name: "bodyNode", mesh: 0, translation: [0, BODY_HALF_H + 0.12, 0] },
  { name: "axleGroup", children: [3, 4, 5, 6], translation: [0, 0.02, 0] },
  // Each hub carries half the offset; the wheel node carries the rest. Both levels must compose.
  ...CORNERS.map(([z, xs], i) => ({
    name: `hub${i}`,
    children: [7 + i],
    translation: [(OUTBOARD * xs) / 2, WHEEL_R / 2, z / 2]
  })),
  ...CORNERS.map(([z, xs], i) => ({
    name: `wheel${i}`,
    mesh: 1 + i,
    translation: [(OUTBOARD * xs) / 2, WHEEL_R / 2 + 0.01, z / 2]
  }))
];
const one = writeGlb(
  resolve("tests/fixtures/gltf-multipart/transformed-child-wheels.glb"),
  transformedParts, transformedNodes, MATERIALS
);
console.log(`wrote transformed-child-wheels.glb  meshes=${one.meshes} bytes=${one.bytes}`);

/*
 * Fixture 2: multi-material wheel meshes.
 *
 * Each wheel is ONE mesh carrying TWO primitives -- an outer tyre and an inner rim on different
 * materials -- which is how real vehicle assets are authored. An auditor that counts primitives rather
 * than mesh nodes would report eight partial wheels across eight "corners".
 */
const multiMaterialParts = [
  { name: "body", primitives: [{ geom: box(BODY_HALF_W, BODY_HALF_H, 1.95), material: 0 }] },
  ...CORNERS.map((_, i) => ({
    name: `wheel${i}`,
    primitives: [
      { geom: box(WHEEL_HALF_W, WHEEL_R, WHEEL_R), material: 1 },
      { geom: box(WHEEL_HALF_W * 1.05, WHEEL_R * 0.55, WHEEL_R * 0.55), material: 2 }
    ]
  }))
];
const multiMaterialNodes = [
  { name: "root", children: [1, 2, 3, 4, 5], translation: [0, 0.05, 0] },
  { name: "bodyNode", mesh: 0, translation: [0, BODY_HALF_H + 0.12, 0] },
  ...CORNERS.map(([z, xs], i) => ({
    name: `wheel${i}`,
    mesh: 1 + i,
    translation: [OUTBOARD * xs, WHEEL_R + 0.01, z]
  }))
];
const two = writeGlb(
  resolve("tests/fixtures/gltf-multipart/multi-material-wheels.glb"),
  multiMaterialParts, multiMaterialNodes, MATERIALS
);
console.log(`wrote multi-material-wheels.glb     meshes=${two.meshes} bytes=${two.bytes}`);
