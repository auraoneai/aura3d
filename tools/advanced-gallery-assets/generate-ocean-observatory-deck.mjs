import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "fixtures/advanced-gallery/assets/ocean-observatory-deck");
mkdirSync(outDir, { recursive: true });

const meshes = [];
const materials = [
  material("composite yacht deck", [0.24, 0.21, 0.17, 1], [0.012, 0.008, 0.004], 0.08),
  material("graphite structural steel", [0.038, 0.046, 0.056, 1], [0.006, 0.009, 0.012], 0.08),
  material("brushed rail metal", [0.42, 0.46, 0.47, 1], [0.04, 0.055, 0.06], 0.2),
  material("laminated blue glass", [0.12, 0.34, 0.44, 0.72], [0.01, 0.08, 0.12], 0.55),
  material("warm deck markers", [1.0, 0.68, 0.34, 1], [0.92, 0.36, 0.08], 1.9),
  material("cool instrument light", [0.34, 0.82, 1.0, 1], [0.05, 0.45, 0.72], 1.7),
  material("observatory shell", [0.08, 0.11, 0.13, 1], [0.012, 0.018, 0.02], 0.1),
  material("solar black glass", [0.018, 0.042, 0.065, 1], [0.0, 0.045, 0.08], 0.38),
  material("authored whitecap spray strips", [0.82, 0.94, 1.0, 0.62], [0.14, 0.3, 0.42], 0.48),
  material("authored ocean glint lanes", [0.68, 0.9, 1.0, 0.44], [0.12, 0.42, 0.66], 0.58),
  material("patrol drone marker shells", [0.88, 0.9, 0.86, 1], [0.08, 0.12, 0.14], 0.42),
  material("floating ocean telemetry buoys", [1.0, 0.55, 0.12, 1], [0.8, 0.22, 0.04], 1.2)
];

const deck = meshBuilder("authored observatory deck", 0);
const steel = meshBuilder("authored deck structure", 1);
const rails = meshBuilder("authored rails and braces", 2);
const glass = meshBuilder("authored wind glass", 3);
const warm = meshBuilder("authored warm marker lights", 4);
const cool = meshBuilder("authored instrument lights", 5);
const shell = meshBuilder("authored observatory shell", 6);
const solar = meshBuilder("authored solar glass accents", 7);
const whitecaps = meshBuilder("authored ocean whitecap and spray cards", 8);
const glints = meshBuilder("authored ocean horizon glint lanes", 9);
const drones = meshBuilder("authored patrol drone reference markers", 10);
const buoys = meshBuilder("authored floating ocean telemetry buoys", 11);

deck.box(0, -0.35, 1.08, 11.4, 0.16, 3.55);
steel.box(0, -0.53, 2.78, 11.8, 0.16, 0.22);
steel.box(0, -0.53, -0.66, 11.8, 0.16, 0.22);
steel.box(-5.78, -0.52, 1.05, 0.22, 0.14, 3.6);
steel.box(5.78, -0.52, 1.05, 0.22, 0.14, 3.6);

for (let i = 0; i < 13; i += 1) {
  const x = -5.1 + i * 0.85;
  deck.box(x, -0.235, 1.08, 0.055, 0.035, 3.34);
}

for (let i = 0; i < 10; i += 1) {
  const x = -5.0 + i * 1.12;
  steel.box(x, -0.96, 2.12, 0.075, 1.18, 0.075);
  steel.box(x, -0.88, -0.08, 0.055, 0.94, 0.055);
  if (i < 9) {
    rails.box(x + 0.56, -0.82, 1.02, 2.35, 0.035, 0.05);
    rails.box(x + 0.56, -0.8, 1.02, 2.15, 0.035, 0.05);
  }
}

for (let i = 0; i < 16; i += 1) {
  const x = -5.35 + i * 0.72;
  glass.box(x, 0.34, -0.62, 0.32, 0.62, 0.045);
  rails.box(x, 0.01, -0.62, 0.035, 0.74, 0.08);
}

for (let i = 0; i < 9; i += 1) {
  const x = -5.0 + i * 1.25;
  glass.box(x, 0.28, 2.32, 0.78, 0.48, 0.04);
  steel.box(x + 0.08, -0.19, 0.08, 0.82, 0.045, 0.2);
}

for (let i = 0; i < 18; i += 1) {
  warm.box(-5.15 + i * 0.6, -0.18, 2.52, 0.06, 0.026, 0.18);
}

shell.box(2.25, 0.0, 1.22, 3.05, 0.72, 1.66);
glass.box(2.25, 0.72, 1.22, 2.0, 0.58, 1.42);
rails.box(2.25, 0.23, 1.22, 1.75, 0.12, 1.75);
rails.box(2.25, 1.52, 1.22, 1.45, 0.08, 0.12);
rails.box(2.25, 1.52, 1.22, 0.12, 0.08, 1.45);
glass.box(4.12, 0.52, 1.14, 1.26, 0.58, 0.08);
shell.box(4.2, 0.09, 1.02, 1.48, 0.1, 0.16);
solar.box(3.08, 0.42, 0.18, 1.45, 0.025, 0.72);
solar.box(1.28, 0.42, 0.18, 1.15, 0.025, 0.58);
rails.box(-4.62, 0.94, 1.7, 0.08, 2.22, 0.08);
cool.box(-4.62, 1.92, 1.7, 0.86, 0.035, 0.035);
warm.box(-4.62, 2.12, 1.7, 0.22, 0.16, 0.22);

for (let i = 0; i < 30; i += 1) {
  const col = i % 15;
  const row = Math.floor(i / 15);
  whitecaps.box(-8.1 + col * 1.1, -0.42 + Math.sin(i * 0.7) * 0.035, -9.8 - row * 2.6 + Math.cos(i * 0.8) * 0.35, 0.42 + noise(i, 29) * 0.68, 0.012, 0.026 + noise(i, 31) * 0.024);
}

for (let i = 0; i < 38; i += 1) {
  const x = -8.4 + i * 0.45 + Math.sin(i * 0.6) * 0.12;
  const z = -14.2 + Math.sin(i * 0.31) * 2.8;
  glints.box(x, -0.46 + Math.cos(i * 0.4) * 0.025, z, 0.22 + noise(i, 37) * 0.82, 0.01, 0.018);
}

for (let i = 0; i < 5; i += 1) {
  const x = -4.8 + i * 2.25;
  const z = -4.9 - i * 0.5;
  drones.box(x, 1.28 + Math.sin(i) * 0.16, z, 0.36, 0.16, 0.22);
  drones.box(x + 0.32, 1.27 + Math.sin(i) * 0.16, z, 0.28, 0.035, 0.035);
  drones.box(x - 0.32, 1.27 + Math.sin(i) * 0.16, z, 0.28, 0.035, 0.035);
  glints.box(x - 0.24, 0.98 + Math.sin(i) * 0.08, z + 0.1, 0.62, 0.012, 0.02);
}

for (let i = 0; i < 8; i += 1) {
  const x = -6.5 + i * 1.65;
  const z = -6.6 + Math.cos(i * 1.2) * 0.7;
  buoys.box(x, -0.18 + Math.sin(i) * 0.08, z, 0.18, 0.18, 0.18);
  whitecaps.box(x - 0.18, -0.37, z - 0.2, 0.52, 0.01, 0.024);
}

for (const builder of [deck, steel, rails, glass, warm, cool, shell, solar, whitecaps, glints, drones, buoys]) {
  const finished = builder.finish();
  if (finished.positions.length > 0) meshes.push(finished);
}

const buffers = [];
const bufferViews = [];
const accessors = [];
const nodes = [];
let byteOffset = 0;

for (const mesh of meshes) {
  const positionOffset = pushBuffer(new Float32Array(mesh.positions));
  const normalOffset = pushBuffer(new Float32Array(mesh.normals));
  const indexOffset = pushBuffer(new Uint32Array(mesh.indices));
  const positionView = view(positionOffset, mesh.positions.length * 4, 34962);
  const normalView = view(normalOffset, mesh.normals.length * 4, 34962);
  const indexView = view(indexOffset, mesh.indices.length * 4, 34963);
  const positionAccessor = accessor(positionView, 5126, mesh.positions.length / 3, "VEC3", mesh.min, mesh.max);
  const normalAccessor = accessor(normalView, 5126, mesh.normals.length / 3, "VEC3");
  const indexAccessor = accessor(indexView, 5125, mesh.indices.length, "SCALAR");
  nodes.push({ name: mesh.name, mesh: nodes.length });
  mesh.primitive = { attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material: mesh.material, mode: 4 };
}

const bin = Buffer.concat(buffers);
writeFileSync(join(outDir, "ocean-observatory-deck.bin"), bin);
writeFileSync(join(outDir, "ocean-observatory-deck.gltf"), `${JSON.stringify({
  asset: { version: "2.0", generator: "G3D v9 advanced gallery authored ocean observatory generator" },
  scene: 0,
  scenes: [{ name: "Ocean Observatory Deck", nodes: nodes.map((_, index) => index) }],
  nodes,
  meshes: meshes.map((mesh) => ({ name: mesh.name, primitives: [mesh.primitive] })),
  materials,
  buffers: [{ uri: "ocean-observatory-deck.bin", byteLength: bin.byteLength }],
  bufferViews,
  accessors
}, null, 2)}\n`);

function material(name, baseColorFactor, emissiveFactor, emissiveStrength) {
  return {
    name,
    pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0.22, roughnessFactor: 0.36 },
    emissiveFactor,
    extensions: emissiveStrength > 1 ? { KHR_materials_emissive_strength: { emissiveStrength } } : undefined
  };
}

function meshBuilder(name, materialIndex) {
  const positions = [];
  const normals = [];
  const indices = [];
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  return {
    name,
    material: materialIndex,
    positions,
    normals,
    indices,
    min,
    max,
    box(cx, cy, cz, sx, sy, sz) {
      const x0 = cx - sx * 0.5, x1 = cx + sx * 0.5;
      const y0 = cy - sy * 0.5, y1 = cy + sy * 0.5;
      const z0 = cz - sz * 0.5, z1 = cz + sz * 0.5;
      face(this, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
      face(this, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
      face(this, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
      face(this, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
      face(this, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
      face(this, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
    },
    finish() {
      return { name, positions, normals, indices, material: materialIndex, min, max };
    }
  };
}

function face(mesh, corners, normal) {
  const base = mesh.positions.length / 3;
  for (const point of corners) {
    mesh.positions.push(point[0], point[1], point[2]);
    mesh.normals.push(normal[0], normal[1], normal[2]);
    for (let i = 0; i < 3; i += 1) {
      mesh.min[i] = Math.min(mesh.min[i], point[i]);
      mesh.max[i] = Math.max(mesh.max[i], point[i]);
    }
  }
  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function pushBuffer(typed) {
  const buffer = Buffer.from(typed.buffer);
  const padding = (4 - (byteOffset % 4)) % 4;
  if (padding) {
    buffers.push(Buffer.alloc(padding));
    byteOffset += padding;
  }
  const offset = byteOffset;
  buffers.push(buffer);
  byteOffset += buffer.byteLength;
  return offset;
}

function view(offset, length, target) {
  const index = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: length, target });
  return index;
}

function accessor(bufferView, componentType, count, type, min, max) {
  const index = accessors.length;
  accessors.push({ bufferView, byteOffset: 0, componentType, count, type, ...(min ? { min } : {}), ...(max ? { max } : {}) });
  return index;
}

function noise(x, z) {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return v - Math.floor(v);
}
