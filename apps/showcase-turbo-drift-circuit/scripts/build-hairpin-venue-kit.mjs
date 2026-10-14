/**
 * Deterministic low-poly 3D venue kit for Turbo Drift's retained hairpin.
 *
 * This is deliberately real geometry with depth: tiered conifers, tents,
 * spectators, rocks, and timber rails. It replaces the rejected billboard
 * panorama without adding collision or pretending to be track geometry.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const OUTPUT = resolve(import.meta.dirname, "../generated/turboHairpinVenueKit.glb");
const align4 = (value) => (value + 3) & ~3;
const pad = (buffer, fill = 0) => {
  const output = Buffer.alloc(align4(buffer.length), fill);
  buffer.copy(output);
  return output;
};
const floats = (values) => {
  const output = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => output.writeFloatLE(value, index * 4));
  return output;
};
const uints = (values) => {
  const output = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => output.writeUInt32LE(value, index * 4));
  return output;
};

const materials = [
  ["pine-dark", [0.075, 0.19, 0.12, 1], 0.93],
  ["pine-mid", [0.13, 0.31, 0.18, 1], 0.9],
  ["pine-warm", [0.36, 0.31, 0.16, 1], 0.92],
  ["timber", [0.31, 0.16, 0.08, 1], 0.88],
  ["tent-canvas", [0.91, 0.82, 0.62, 1], 0.82],
  ["tent-red", [0.68, 0.12, 0.08, 1], 0.76],
  ["crowd-coral", [0.89, 0.23, 0.12, 1], 0.8],
  ["crowd-teal", [0.08, 0.48, 0.46, 1], 0.8],
  ["crowd-gold", [0.93, 0.61, 0.12, 1], 0.8],
  ["rock", [0.29, 0.31, 0.28, 1], 0.98],
  ["meadow-shadow", [0.13, 0.24, 0.12, 1], 0.98],
  ["meadow-sun", [0.25, 0.36, 0.16, 1], 0.96],
  ["log-cut", [0.62, 0.39, 0.18, 1], 0.9]
];
const parts = materials.map(() => ({ positions: [], normals: [], indices: [] }));

function triangle(part, a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length; ny /= length; nz /= length;
  const base = part.positions.length / 3;
  for (const vertex of [a, b, c]) {
    part.positions.push(...vertex);
    part.normals.push(nx, ny, nz);
  }
  part.indices.push(base, base + 1, base + 2);
}

function quad(part, a, b, c, d) {
  triangle(part, a, b, c);
  triangle(part, a, c, d);
}

function box(materialIndex, x, y, z, width, height, depth) {
  const p = parts[materialIndex];
  const hx = width / 2, hy = height / 2, hz = depth / 2;
  const v = [
    [x - hx, y - hy, z - hz], [x + hx, y - hy, z - hz],
    [x + hx, y - hy, z + hz], [x - hx, y - hy, z + hz],
    [x - hx, y + hy, z - hz], [x + hx, y + hy, z - hz],
    [x + hx, y + hy, z + hz], [x - hx, y + hy, z + hz]
  ];
  quad(p, v[0], v[3], v[2], v[1]); quad(p, v[4], v[5], v[6], v[7]);
  quad(p, v[1], v[2], v[6], v[5]); quad(p, v[3], v[0], v[4], v[7]);
  quad(p, v[0], v[1], v[5], v[4]); quad(p, v[2], v[3], v[7], v[6]);
}

function tapered(materialIndex, x, baseY, z, bottomRadius, topRadius, height, sides = 8) {
  const p = parts[materialIndex];
  const lower = [], upper = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = (index / sides) * Math.PI * 2;
    lower.push([x + Math.cos(angle) * bottomRadius, baseY, z + Math.sin(angle) * bottomRadius]);
    upper.push([x + Math.cos(angle) * topRadius, baseY + height, z + Math.sin(angle) * topRadius]);
  }
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    quad(p, lower[index], lower[next], upper[next], upper[index]);
    triangle(p, [x, baseY, z], lower[next], lower[index]);
    triangle(p, [x, baseY + height, z], upper[index], upper[next]);
  }
}

function mound(materialIndex, x, baseY, z, radiusX, radiusZ, height, sides = 20) {
  const p = parts[materialIndex];
  const rings = [
    { y: baseY, scale: 1 },
    { y: baseY + height * 0.46, scale: 0.7 },
    { y: baseY + height * 0.78, scale: 0.38 },
    { y: baseY + height, scale: 0.08 }
  ].map((ring, ringIndex) => Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;
    const irregular = 1 + Math.sin(index * 2.17 + ringIndex * 0.7) * 0.035;
    return [
      x + Math.cos(angle) * radiusX * ring.scale * irregular,
      ring.y,
      z + Math.sin(angle) * radiusZ * ring.scale * irregular
    ];
  }));
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let index = 0; index < sides; index += 1) {
      const next = (index + 1) % sides;
      quad(p, rings[ring][index], rings[ring][next], rings[ring + 1][next], rings[ring + 1][index]);
    }
  }
  const top = [x, baseY + height * 1.03, z];
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    triangle(p, rings.at(-1)[index], rings.at(-1)[next], top);
  }
}

function conifer(x, z, height, palette = 0) {
  tapered(3, x, 0, z, height * 0.055, height * 0.038, height * 0.34, 7);
  tapered(palette, x, height * 0.18, z, height * 0.36, 0.02, height * 0.48, 9);
  tapered(palette === 0 ? 1 : palette, x, height * 0.43, z, height * 0.29, 0.015, height * 0.44, 9);
  tapered(1, x, height * 0.66, z, height * 0.2, 0, height * 0.34, 9);
}

function tent(x, z, width, depth, height, accent) {
  const canvas = parts[4], stripe = parts[accent];
  const x0 = x - width / 2, x1 = x + width / 2;
  const z0 = z - depth / 2, z1 = z + depth / 2;
  quad(canvas, [x0, 0, z0], [x1, 0, z0], [x, height, z0], [x, height, z0]);
  quad(canvas, [x1, 0, z1], [x0, 0, z1], [x, height, z1], [x, height, z1]);
  quad(canvas, [x0, 0, z1], [x0, 0, z0], [x, height, z0], [x, height, z1]);
  quad(stripe, [x, height, z1], [x, height, z0], [x1, 0, z0], [x1, 0, z1]);
  box(3, x0, height * 0.48, z, 0.045, height, 0.045);
  box(3, x1, height * 0.48, z, 0.045, height, 0.045);
}

function spectator(x, z, scale, materialIndex) {
  tapered(materialIndex, x, 0, z, scale * 0.11, scale * 0.09, scale * 0.42, 7);
  tapered(materialIndex, x, scale * 0.42, z, scale * 0.13, scale * 0.08, scale * 0.2, 8);
}

function rock(x, z, scale) {
  tapered(9, x, 0, z, scale * 0.44, scale * 0.24, scale * 0.42, 7);
}

// Overlapping low-poly meadow mounds establish actual relief behind the track;
// their irregular silhouettes remain below the trees and never supply road or
// collision geometry.
// Relief is supplied by the actual circuit terrain. Large synthetic mounds were
// tested here and rejected because their foreground facets read as a stage skirt.


// Deep, irregular tree layers. The central opening leaves the corner sightline clear.
[
  [-5.7, 2.2, 2.35, 0], [-4.8, 2.75, 2.8, 1], [-3.75, 2.15, 2.2, 0],
  [-2.8, 3.0, 2.75, 2], [-1.7, 2.55, 2.15, 1], [1.8, 2.8, 2.25, 0],
  [2.8, 2.15, 2.7, 1], [3.9, 2.85, 2.2, 2], [4.9, 2.25, 2.85, 0],
  [5.8, 3.0, 2.35, 1], [-5.25, 0.85, 1.7, 1], [5.3, 0.95, 1.8, 0]
].forEach(([x, z, height, palette]) => conifer(x, z, height, palette));

tent(-3.55, 0.15, 1.25, 1.0, 0.9, 5);
tent(3.55, 0.28, 1.2, 0.95, 0.82, 7);
box(3, 0, 0.18, -0.65, 8.2, 0.2, 0.18);
box(3, 0, 0.44, -0.63, 8.2, 0.12, 0.12);
for (let index = 0; index < 25; index += 1) {
  const x = -2.45 + (index % 13) * 0.4 + (index > 12 ? 0.18 : 0);
  const z = index > 12 ? 0.38 : -0.03;
  spectator(x, z, 0.62 + (index % 4) * 0.045, 6 + (index % 3));
}
rock(-5.9, -0.2, 0.75); rock(5.95, -0.15, 0.82); rock(-4.75, 0.15, 0.48); rock(4.72, 0.08, 0.5);

// Two stacked logging piles echo the working-forest venue without copying any
// reference pixels. Alternating lengths and end caps avoid a single flat block.
for (const centerX of [-4.7, 4.65]) {
  for (let row = 0; row < 3; row += 1) {
    for (let log = 0; log < 4 - row; log += 1) {
      const x = centerX + (log - (3 - row) / 2) * 0.29 + row * 0.04;
      const y = 0.16 + row * 0.2;
      box(3, x, y, 0.72 + row * 0.06, 0.25, 0.16, 0.78 - row * 0.06);
      box(12, x, y, 0.3 + row * 0.03, 0.2, 0.13, 0.035);
    }
  }
}

const chunks = [];
const bufferViews = [];
const accessors = [];
const primitives = [];
let byteOffset = 0;
for (let materialIndex = 0; materialIndex < parts.length; materialIndex += 1) {
  const part = parts[materialIndex];
  if (!part.indices.length) continue;
  const positionBytes = pad(floats(part.positions));
  const normalBytes = pad(floats(part.normals));
  const indexBytes = pad(uints(part.indices));
  const positionView = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset, byteLength: positionBytes.length, target: 34962 });
  chunks.push(positionBytes); byteOffset += positionBytes.length;
  const normalView = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset, byteLength: normalBytes.length, target: 34962 });
  chunks.push(normalBytes); byteOffset += normalBytes.length;
  const indexView = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset, byteLength: indexBytes.length, target: 34963 });
  chunks.push(indexBytes); byteOffset += indexBytes.length;
  const xs = part.positions.filter((_, i) => i % 3 === 0);
  const ys = part.positions.filter((_, i) => i % 3 === 1);
  const zs = part.positions.filter((_, i) => i % 3 === 2);
  const positionAccessor = accessors.length;
  accessors.push({ bufferView: positionView, componentType: 5126, count: part.positions.length / 3, type: "VEC3", min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)] });
  const normalAccessor = accessors.length;
  accessors.push({ bufferView: normalView, componentType: 5126, count: part.normals.length / 3, type: "VEC3" });
  const indexAccessor = accessors.length;
  accessors.push({ bufferView: indexView, componentType: 5125, count: part.indices.length, type: "SCALAR", min: [0], max: [Math.max(...part.indices)] });
  primitives.push({ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material: materialIndex });
}
const binary = Buffer.concat(chunks);
const gltf = {
  asset: { version: "2.0", generator: "Aura3D deterministic Turbo hairpin venue builder", extras: { license: "CC0-1.0", source: "apps/showcase-turbo-drift-circuit/scripts/build-hairpin-venue-kit.mjs", role: "renderer-owned-trackside-set-dressing" } },
  scene: 0,
  scenes: [{ name: "Turbo Hairpin Festival", nodes: [0] }],
  nodes: [{ name: "Turbo Hairpin Festival Kit", mesh: 0 }],
  meshes: [{ name: "Turbo Hairpin Festival Geometry", primitives }],
  materials: materials.map(([name, color, roughness]) => ({ name, pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0.02, roughnessFactor: roughness } })),
  accessors,
  bufferViews,
  buffers: [{ byteLength: binary.length }]
};
const json = pad(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
const body = Buffer.alloc(12 + 8 + json.length + 8 + binary.length);
body.write("glTF", 0, "ascii"); body.writeUInt32LE(2, 4); body.writeUInt32LE(body.length, 8);
body.writeUInt32LE(json.length, 12); body.writeUInt32LE(0x4e4f534a, 16); json.copy(body, 20);
const binaryHeader = 20 + json.length;
body.writeUInt32LE(binary.length, binaryHeader); body.writeUInt32LE(0x004e4942, binaryHeader + 4); binary.copy(body, binaryHeader + 8);
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, body);
console.log(JSON.stringify({ output: OUTPUT, bytes: body.length, triangles: parts.reduce((sum, part) => sum + part.indices.length / 3, 0) }, null, 2));
