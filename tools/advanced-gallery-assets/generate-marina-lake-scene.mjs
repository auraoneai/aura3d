import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "fixtures/advanced-gallery/assets/marina-lake-scene");
mkdirSync(outDir, { recursive: true });

const meshes = [];
const materials = [
  material("sunset lodge cladding", [0.26, 0.17, 0.11, 1], [0.02, 0.008, 0.002], 0.08),
  material("warm lodge windows", [1.0, 0.58, 0.24, 1], [0.95, 0.35, 0.08], 1.7),
  material("weathered dock wood", [0.32, 0.22, 0.15, 1], [0.015, 0.006, 0.002], 0.06),
  material("brushed rail metal", [0.38, 0.42, 0.42, 1], [0.03, 0.045, 0.05], 0.18),
  material("shoreline stone", [0.38, 0.34, 0.28, 1], [0.01, 0.008, 0.004], 0.03),
  material("distant mountain dusk", [0.08, 0.105, 0.135, 1], [0.006, 0.012, 0.02], 0.08),
  material("pine silhouettes", [0.025, 0.12, 0.085, 1], [0.0, 0.018, 0.01], 0.06),
  material("dock lanterns", [1.0, 0.72, 0.35, 1], [0.95, 0.42, 0.1], 2.2),
  material("marina boat paint", [0.86, 0.9, 0.88, 1], [0.05, 0.06, 0.06], 0.2),
  material("glass canopy", [0.2, 0.46, 0.56, 0.82], [0.015, 0.08, 0.11], 0.42),
  material("sunset cable lights", [0.72, 0.86, 0.98, 1], [0.2, 0.48, 0.75], 1.2),
  material("authored shoreline foam strips", [0.82, 0.96, 1.0, 0.58], [0.16, 0.36, 0.44], 0.42),
  material("authored fresnel glint strips", [0.74, 0.96, 1.0, 0.46], [0.22, 0.52, 0.68], 0.62),
  material("floating ripple sensor buoys", [0.92, 0.12, 0.08, 1], [0.5, 0.04, 0.03], 0.9),
  material("wet dock reflection shadows", [0.02, 0.052, 0.064, 0.5], [0.0, 0.015, 0.02], 0.18)
];

const lodges = meshBuilder("authored marina lodges", 0);
const windows = meshBuilder("authored warm lodge windows", 1);
const dock = meshBuilder("authored timber dock", 2);
const rails = meshBuilder("authored rails and posts", 3);
const shore = meshBuilder("authored shoreline and rocks", 4);
const mountains = meshBuilder("authored mountain backdrop", 5);
const pines = meshBuilder("authored pine shoreline", 6);
const lanterns = meshBuilder("authored dock lanterns", 7);
const boat = meshBuilder("authored small sailboat", 8);
const glass = meshBuilder("authored boat glass", 9);
const cable = meshBuilder("authored cable lights", 10);
const foam = meshBuilder("authored shoreline and wake foam", 11);
const glints = meshBuilder("authored water glint reference strips", 12);
const sensors = meshBuilder("authored floating ripple sensors", 13);
const reflections = meshBuilder("authored wet dock reflection patches", 14);

shore.box(0, -0.34, -5.8, 9.6, 0.12, 0.72);
shore.box(-5.8, -0.34, 5.35, 6.2, 0.12, 0.82);
shore.box(5.4, -0.38, 4.92, 2.4, 0.1, 0.52);

for (let i = 0; i < 10; i += 1) {
  const x = -8.6 + i * 1.9;
  const height = 0.9 + noise(i, 3) * 1.5;
  mountains.box(x, 0.2 + height * 0.5, -6.72, 1.42, height, 0.14);
  mountains.box(x + 0.42, 0.04 + height * 0.34, -6.58, 1.05, height * 0.68, 0.1);
}

for (let i = 0; i < 18; i += 1) {
  const x = -8.2 + i * 0.96;
  const z = i % 2 ? -5.72 : 5.46;
  pines.box(x, 0.22, z, 0.075, 0.68, 0.075);
  pines.box(x, 0.72, z, 0.28, 0.5, 0.28);
  pines.box(x, 1.02, z, 0.2, 0.32, 0.2);
}

for (let i = 0; i < 7; i += 1) {
  const x = -6.85 + i * 1.05;
  const h = 0.68 + (i % 3) * 0.24;
  lodges.box(x, 0.18 + h * 0.5, -5.46, 0.64, h, 0.46);
  lodges.box(x, 0.18 + h + 0.07, -5.46, 0.72, 0.14, 0.54);
  for (let w = 0; w < 3; w += 1) {
    windows.box(x - 0.2 + w * 0.2, 0.34 + h * 0.45, -5.215, 0.055, 0.095, 0.025);
    rails.box(x - 0.2 + w * 0.2, 0.34 + h * 0.45, -5.195, 0.008, 0.13, 0.012);
  }
}

for (let i = 0; i < 18; i += 1) {
  const x = -4.8 + i * 0.56;
  dock.box(x, 0.03, -3.18, 0.44, 0.075, 1.34);
  rails.box(x, 0.27, -2.48, 0.032, 0.48, 0.032);
  rails.box(x, -0.16, -3.82, 0.05, 0.42, 0.05);
  if (i < 17) rails.box(x + 0.28, 0.6, -2.48, 0.28, 0.024, 0.026);
  if (i % 2 === 0) {
    lanterns.box(x, 0.43, -3.9, 0.055, 0.48, 0.055);
    lanterns.box(x, 0.7, -3.9, 0.18, 0.055, 0.18);
  }
}

for (let i = 0; i < 28; i += 1) {
  const x = -8.4 + (i % 14) * 1.28;
  const z = i < 20 ? -6.36 : 6.28;
  const sx = 0.36 + noise(i, 9) * 0.38;
  const sy = 0.14 + noise(i, 17) * 0.16;
  const sz = 0.28 + noise(i, 23) * 0.32;
  shore.box(x, -0.27 + sy * 0.22, z, sx, sy, sz);
}

boat.box(2.15, 0.16, 1.72, 1.42, 0.16, 0.58);
boat.box(2.15, 0.3, 1.72, 1.05, 0.1, 0.42);
glass.box(2.15, 0.46, 1.44, 0.62, 0.26, 0.08);
rails.box(2.15, 0.86, 1.43, 0.035, 0.96, 0.035);
boat.box(2.38, 1.03, 1.22, 0.035, 0.58, 0.38);

for (let i = 0; i < 18; i += 1) {
  const x = -7.4 + i * 0.9;
  cable.box(x, 1.06 + Math.sin(i) * 0.055, -4.82 + Math.sin(i * 1.7) * 0.16, 0.32, 0.018, 0.018);
}

for (let i = 0; i < 22; i += 1) {
  const x = -8.1 + i * 0.76;
  foam.box(x, -0.055, 4.58 + Math.sin(i * 0.72) * 0.14, 0.52 + noise(i, 31) * 0.46, 0.012, 0.026 + noise(i, 37) * 0.018);
  if (i < 17) foam.box(x + 0.14, -0.062, -5.02 + Math.cos(i * 0.5) * 0.08, 0.38 + noise(i, 41) * 0.32, 0.01, 0.022);
}

for (let i = 0; i < 54; i += 1) {
  const col = i % 18;
  const row = Math.floor(i / 18);
  const x = -7.3 + col * 0.86 + Math.sin(i * 1.8) * 0.05;
  const z = -3.55 + row * 2.18 + Math.sin(i * 0.9) * 0.18;
  glints.box(x, -0.038, z, 0.18 + noise(i, 53) * 0.56, 0.01, 0.018 + noise(i, 59) * 0.018);
}

for (let i = 0; i < 12; i += 1) {
  const x = -5.2 + i * 0.94;
  const z = 2.3 + Math.sin(i * 0.82) * 0.74;
  sensors.box(x, 0.065, z, 0.16, 0.16, 0.16);
  foam.box(x - 0.18, -0.046, z - 0.18, 0.54 + noise(i, 67) * 0.34, 0.01, 0.022);
}

for (let i = 0; i < 14; i += 1) {
  reflections.box(-4.8 + i * 0.66, -0.049, -2.62 + Math.sin(i * 0.64) * 0.18, 0.42 + noise(i, 71) * 0.26, 0.008, 0.08 + noise(i, 73) * 0.09);
}

for (const builder of [lodges, windows, dock, rails, shore, mountains, pines, lanterns, boat, glass, cable, foam, glints, sensors, reflections]) {
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
  mesh.primitive = {
    attributes: { POSITION: positionAccessor, NORMAL: normalAccessor },
    indices: indexAccessor,
    material: mesh.material,
    mode: 4
  };
}

const bin = Buffer.concat(buffers);
writeFileSync(join(outDir, "marina-lake-scene.bin"), bin);
writeFileSync(join(outDir, "marina-lake-scene.gltf"), `${JSON.stringify({
  asset: {
    version: "2.0",
    generator: "A3D threejs-parity advanced gallery authored marina lake generator"
  },
  scene: 0,
  scenes: [{ name: "Marina Lake Scene", nodes: nodes.map((_, index) => index) }],
  nodes,
  meshes: meshes.map((mesh) => ({ name: mesh.name, primitives: [mesh.primitive] })),
  materials,
  buffers: [{ uri: "marina-lake-scene.bin", byteLength: bin.byteLength }],
  bufferViews,
  accessors
}, null, 2)}\n`);

function material(name, baseColorFactor, emissiveFactor, emissiveStrength) {
  return {
    name,
    pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0.16, roughnessFactor: 0.48 },
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
  accessors.push({
    bufferView,
    byteOffset: 0,
    componentType,
    count,
    type,
    ...(min ? { min } : {}),
    ...(max ? { max } : {})
  });
  return index;
}

function noise(x, z) {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return v - Math.floor(v);
}
