import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "fixtures/advanced-gallery/assets/smart-city-district");
mkdirSync(outDir, { recursive: true });

const meshes = [];
const materials = [
  material("district graphite", [0.045, 0.064, 0.084, 1], [0.008, 0.028, 0.052], 0.18),
  material("district cyan glass", [0.055, 0.125, 0.15, 1], [0.004, 0.045, 0.07], 0.18),
  material("district violet glass", [0.095, 0.078, 0.125, 1], [0.032, 0.012, 0.052], 0.16),
  material("district green glass", [0.055, 0.115, 0.095, 1], [0.003, 0.04, 0.025], 0.16),
  material("warm windows", [0.9, 0.55, 0.3, 1], [0.7, 0.28, 0.07], 1.05),
  material("cool windows", [0.36, 0.72, 0.82, 1], [0.035, 0.24, 0.34], 0.9),
  material("roads", [0.025, 0.032, 0.04, 1], [0.0, 0.0, 0.0], 0),
  material("lane paint", [0.85, 0.95, 1.0, 1], [0.3, 0.65, 0.95], 0.9),
  material("trees", [0.035, 0.19, 0.13, 1], [0.0, 0.035, 0.02], 0.1),
  material("beacons", [0.34, 0.76, 0.86, 1], [0.035, 0.28, 0.38], 1.05),
  material("park canopy", [0.04, 0.12, 0.082, 1], [0.0, 0.025, 0.012], 0.08),
  material("water canal", [0.018, 0.068, 0.095, 1], [0.0, 0.025, 0.045], 0.18),
  material("solar glass", [0.025, 0.07, 0.105, 1], [0.0, 0.06, 0.11], 0.42),
  material("curb concrete", [0.23, 0.25, 0.245, 1], [0.0, 0.0, 0.0], 0),
  material("bridge concrete", [0.13, 0.145, 0.145, 1], [0.0, 0.0, 0.0], 0),
  material("roof equipment", [0.095, 0.11, 0.115, 1], [0.0, 0.0, 0.0], 0),
  material("park path", [0.24, 0.23, 0.195, 1], [0.0, 0.0, 0.0], 0),
  material("traffic amber", [0.95, 0.52, 0.16, 1], [0.62, 0.2, 0.04], 1.05)
];

const districtA = meshBuilder("cyan district buildings", 1);
const districtB = meshBuilder("violet district buildings", 2);
const districtC = meshBuilder("green district buildings", 3);
const graphite = meshBuilder("dark civic towers", 0);
const windowsWarm = meshBuilder("warm window ribbons", 4);
const windowsCool = meshBuilder("cool window ribbons", 5);
const roads = meshBuilder("road network", 6);
const lanes = meshBuilder("lane markers", 7);
const trees = meshBuilder("tree canopy", 8);
const beacons = meshBuilder("beacon and antenna lights", 9);
const parks = meshBuilder("parks and planted terraces", 10);
const water = meshBuilder("canal and harbor water", 11);
const solar = meshBuilder("solar roofs and glass bridges", 12);
const curbs = meshBuilder("raised curbs and quay edges", 13);
const bridges = meshBuilder("bridges and transit viaducts", 14);
const roofKit = meshBuilder("roof equipment and facade fins", 15);
const paths = meshBuilder("park walks and plaza paving", 16);
const traffic = meshBuilder("traffic and marker lights", 17);
const buildingRecords = [];

const roadZ = [-4.72, -2.28, 0.72, 3.08];
const roadX = [-5.18, -2.64, 0.78, 3.38, 5.22];
const diagonalRoads = [
  { x0: -6.05, z0: 1.98, x1: 5.85, z1: -3.2, width: 0.42 },
  { x0: -5.72, z0: -5.3, x1: 3.94, z1: 3.76, width: 0.34 }
];
const canalZ = 4.35;
const harborX = 4.25;

roads.box(0, -0.065, -0.08, 13.4, 0.04, 11.8);
water.box(-0.95, -0.01, canalZ, 11.55, 0.038, 0.72);
water.box(harborX, -0.01, -3.72, 0.58, 0.038, 2.72);
water.box(4.95, -0.008, 3.64, 1.62, 0.034, 0.62);
for (const z of roadZ) addRoadX(z, 12.25, z === 0.72 ? 0.42 : 0.34);
for (const x of roadX) addRoadZ(x, 10.15, x === 0.78 ? 0.44 : 0.34);
for (const road of diagonalRoads) addDiagonalRoad(road);

parks.box(-4.9, 0.035, 3.18, 1.48, 0.07, 1.5);
parks.box(4.18, 0.035, 1.22, 1.18, 0.07, 1.84);
parks.box(-0.25, 0.035, -0.06, 2.22, 0.07, 0.88);
parks.box(2.55, 0.032, -3.55, 1.05, 0.064, 0.9);
paths.box(-4.9, 0.082, 3.18, 1.28, 0.018, 0.13);
paths.box(-4.9, 0.084, 3.18, 0.13, 0.018, 1.22);
paths.box(4.18, 0.082, 1.22, 0.14, 0.018, 1.55);
paths.box(4.18, 0.084, 1.22, 0.96, 0.018, 0.14);
paths.box(-0.25, 0.086, -0.06, 1.72, 0.018, 0.1);
paths.box(2.55, 0.084, -3.55, 0.78, 0.018, 0.12);
paths.box(2.55, 0.086, -3.55, 0.12, 0.018, 0.72);

addDistrictCluster({ cx: -3.8, cz: -3.25, rx: 1.9, rz: 1.32, count: 72, min: 0.58, span: 1.9, core: 1.45, seed: 11 });
addDistrictCluster({ cx: -0.65, cz: -3.35, rx: 1.75, rz: 1.58, count: 86, min: 0.72, span: 2.35, core: 1.8, seed: 23 });
addDistrictCluster({ cx: 2.65, cz: -2.5, rx: 2.02, rz: 1.65, count: 88, min: 0.62, span: 2.1, core: 1.62, seed: 37 });
addDistrictCluster({ cx: -4.2, cz: 0.55, rx: 1.48, rz: 1.9, count: 58, min: 0.42, span: 1.5, core: 0.85, seed: 41 });
addDistrictCluster({ cx: 1.65, cz: 0.4, rx: 1.95, rz: 1.28, count: 70, min: 0.55, span: 1.75, core: 1.25, seed: 59 });
addDistrictCluster({ cx: 4.45, cz: 3.0, rx: 1.22, rz: 1.36, count: 40, min: 0.34, span: 1.05, core: 0.6, seed: 71 });
addDistrictCluster({ cx: -1.9, cz: 2.75, rx: 1.68, rz: 1.18, count: 58, min: 0.4, span: 1.25, core: 0.7, seed: 83 });
addDistrictCluster({ cx: 5.05, cz: -0.9, rx: 0.98, rz: 1.38, count: 34, min: 0.36, span: 0.95, core: 0.45, seed: 97 });

addHeroTower(-0.68, -2.86, 0.62, 0.58, 3.8, districtA, 4);
addHeroTower(1.12, -2.34, 0.5, 0.74, 3.25, districtC, 8);
addHeroTower(3.2, -1.08, 0.72, 0.48, 3.55, districtB, 12);
addHeroTower(-3.48, -2.72, 0.52, 0.82, 2.65, graphite, 15);
addHeroTower(0.18, -3.74, 0.7, 0.54, 4.15, graphite, 18);
addHeroTower(2.18, -3.05, 0.58, 0.64, 3.95, districtA, 22);

bridges.box(-1.2, 0.19, canalZ, 1.28, 0.14, 0.92);
bridges.box(2.52, 0.19, canalZ, 1.12, 0.14, 0.92);
bridges.box(4.25, 0.17, -4.32, 0.78, 0.12, 1.16);
bridges.box(4.96, 0.16, 3.64, 1.44, 0.11, 0.32);
solar.box(-1.2, 0.29, canalZ, 0.96, 0.025, 0.62);
solar.box(2.52, 0.29, canalZ, 0.82, 0.025, 0.62);
solar.box(4.96, 0.245, 3.64, 1.18, 0.024, 0.18);
for (const bridgeX of [-1.2, 2.52]) {
  for (const edge of [-0.36, 0.36]) {
    roofKit.box(bridgeX, 0.38, canalZ + edge, 1.1, 0.05, 0.035);
  }
}

addViaduct(-3.1, 0.04, 3.6, 0.04, 1.0, 0.18, 13);
addViaduct(-4.85, -1.95, 2.65, 1.2, 1.18, 0.15, 29);
addViaduct(-1.7, -4.15, 5.15, -1.62, 0.82, 0.16, 47);

districtB.box(-0.2, 0.13, -0.1, 2.45, 0.1, 0.8);
solar.box(-0.2, 0.21, -0.1, 2.05, 0.025, 0.58);
beacons.box(-0.2, 0.43, -0.1, 1.7, 0.055, 0.055);
beacons.box(-0.2, 0.64, -0.1, 0.055, 0.38, 0.055);
addDataSpine(-0.2, -0.1, 0.72, 1.18, 9);

for (let i = 0; i < 78; i += 1) {
  const a = i * 2.399963;
  const radius = 3.2 + noise(i, 4) * 3.1;
  const x = Math.cos(a) * radius + (i % 5 === 0 ? -1.6 : 0.4);
  const z = Math.sin(a) * radius + (i % 4 === 0 ? 2.0 : 0.1);
  if (isReservedSite(x, z, 0.24)) continue;
  addTree(x, z, 0.8 + noise(i + 10, 2) * 0.55);
}

for (let i = 0; i < buildingRecords.length; i += 6) {
  const current = buildingRecords[i];
  const next = buildingRecords.find((candidate) => Math.abs(candidate.z - current.z) < 0.32 && candidate.x > current.x + 0.75 && Math.abs(candidate.x - current.x) < 2.3);
  if (!next) continue;
  const x = (current.x + next.x) * 0.5;
  const z = (current.z + next.z) * 0.5;
  const span = Math.abs(next.x - current.x);
  const y = Math.min(current.h, next.h) * 0.58;
  graphite.box(x, y, z, Math.max(0.3, span - current.w * 0.25), 0.08, 0.09);
  windowsCool.box(x, y + 0.08, z, Math.max(0.24, span - current.w * 0.36), 0.04, 0.035);
}

for (let i = 0; i < buildingRecords.length; i += 9) {
  const building = buildingRecords[i];
  beacons.box(building.x, building.h + 0.17, building.z, 0.035, 0.32, 0.035);
  lanes.box(building.x, building.h + 0.34, building.z, 0.28, 0.024, 0.035);
  lanes.box(building.x, building.h + 0.34, building.z, 0.035, 0.024, 0.28);
}

for (let i = 3; i < buildingRecords.length; i += 17) {
  const building = buildingRecords[i];
  addDataSpine(building.x, building.z, building.h + 0.04, 0.38 + noise(i, 16) * 0.5, i);
}

addTrafficFlowX(-4.72, -5.6, 5.7, 36, 0.18, 101);
addTrafficFlowX(-2.28, -5.45, 5.8, 42, -0.18, 127);
addTrafficFlowX(0.72, -5.5, 5.75, 46, 0.19, 149);
addTrafficFlowX(3.08, -5.65, 5.45, 34, -0.18, 173);
addTrafficFlowZ(-5.18, -4.65, 4.78, 30, 0.18, 191);
addTrafficFlowZ(-2.64, -4.55, 4.75, 32, -0.18, 211);
addTrafficFlowZ(0.78, -4.55, 4.7, 36, 0.2, 233);
addTrafficFlowZ(3.38, -4.65, 4.75, 30, -0.18, 251);
for (const [index, road] of diagonalRoads.entries()) addTrafficFlowDiagonal(road, 30 + index * 8, 271 + index * 31);

for (const builder of [districtA, districtB, districtC, graphite, windowsWarm, windowsCool, roads, lanes, trees, beacons, parks, water, solar, curbs, bridges, roofKit, paths, traffic]) {
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
writeFileSync(join(outDir, "smart-city-district.bin"), bin);
writeFileSync(join(outDir, "smart-city-district.gltf"), `${JSON.stringify({
  asset: {
    version: "2.0",
    generator: "G3D v9 advanced gallery authored smart-city generator"
  },
  scene: 0,
  scenes: [{ name: "Smart City District", nodes: nodes.map((_, index) => index) }],
  nodes,
  meshes: meshes.map((mesh) => ({ name: mesh.name, primitives: [mesh.primitive] })),
  materials,
  buffers: [{ uri: "smart-city-district.bin", byteLength: bin.byteLength }],
  bufferViews,
  accessors
}, null, 2)}\n`);

function addRoadX(z, length, width = 0.34) {
  roads.box(0, -0.012, z, length, 0.06, width);
  curbs.box(0, 0.04, z - width * 0.64, length, 0.08, 0.055);
  curbs.box(0, 0.04, z + width * 0.64, length, 0.08, 0.055);
  for (let x = -5.75; x <= 5.75; x += 0.82) {
    lanes.box(x, 0.026, z, 0.34, 0.018, 0.035);
  }
  for (let x = -5.6; x <= 5.6; x += 1.64) {
    traffic.box(x, 0.17, z - width * 0.84, 0.055, 0.08, 0.055);
    traffic.box(x + 0.35, 0.17, z + width * 0.84, 0.055, 0.08, 0.055);
  }
}

function addRoadZ(x, length, width = 0.34) {
  roads.box(x, -0.01, 0.02, width, 0.06, length);
  curbs.box(x - width * 0.64, 0.04, 0.02, 0.055, 0.08, length);
  curbs.box(x + width * 0.64, 0.04, 0.02, 0.055, 0.08, length);
  for (let z = -4.85; z <= 4.85; z += 0.82) {
    lanes.box(x, 0.028, z, 0.035, 0.018, 0.34);
  }
  for (let z = -4.45; z <= 4.45; z += 1.64) {
    traffic.box(x - width * 0.84, 0.17, z, 0.055, 0.08, 0.055);
    traffic.box(x + width * 0.84, 0.17, z + 0.38, 0.055, 0.08, 0.055);
  }
}

function addDiagonalRoad({ x0, z0, x1, z1, width }) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const nx = -Math.sin(angle);
  const nz = Math.cos(angle);
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  roads.boxRotatedY(cx, -0.009, cz, length, 0.06, width, angle);
  curbs.boxRotatedY(cx + nx * width * 0.64, 0.04, cz + nz * width * 0.64, length, 0.08, 0.055, angle);
  curbs.boxRotatedY(cx - nx * width * 0.64, 0.04, cz - nz * width * 0.64, length, 0.08, 0.055, angle);
  for (let i = 0.5; i < length - 0.25; i += 0.74) {
    const t = i / length;
    const x = x0 + dx * t;
    const z = z0 + dz * t;
    lanes.boxRotatedY(x, 0.029, z, 0.28, 0.018, 0.035, angle);
  }
}

function addDistrictCluster({ cx, cz, rx, rz, count, min, span, core, seed }) {
  for (let i = 0; i < count; i += 1) {
    const a = noise(seed + i * 3, i + 2) * Math.PI * 2;
    const radius = Math.sqrt(noise(seed + i, i + 31));
    const sweep = 0.68 + noise(seed + i, i + 43) * 0.42;
    const x = cx + Math.cos(a) * rx * radius * sweep + (noise(seed, i + 61) - 0.5) * 0.28;
    const z = cz + Math.sin(a) * rz * radius + (noise(seed + 7, i + 71) - 0.5) * 0.24;
    if (isReservedSite(x, z, 0.18)) continue;

    const w = 0.28 + noise(seed + i, 83) * 0.32;
    const d = 0.28 + noise(seed + i, 89) * 0.3;
    if (!isBuildableLot(x, z, w, d)) continue;

    const coreFalloff = Math.max(0, 1 - Math.hypot((x - cx) / rx, (z - cz) / rz) * 0.56);
    const downtownLift = z < -2.15 ? 0.44 : z > 2.4 ? -0.22 : 0.08;
    const waterfrontLift = Math.abs(z - canalZ) < 1.2 || Math.abs(x - harborX) < 0.8 ? 0.18 : 0;
    const h = min + noise(seed + i, 97) * span + coreFalloff * core + downtownLift + waterfrontLift;
    addTower({ x, z, h, w, d, seed: seed * 101 + i * 17 });
  }
}

function isReservedSite(x, z, margin = 0.34) {
  if (roadX.some((road) => Math.abs(x - road) < margin + 0.22)) return true;
  if (roadZ.some((road) => Math.abs(z - road) < margin + 0.22)) return true;
  if (diagonalRoads.some((road) => pointSegmentDistance(x, z, road.x0, road.z0, road.x1, road.z1) < road.width * 0.5 + margin)) return true;
  if (Math.abs(z - canalZ) < 0.56 || Math.abs(x - harborX) < 0.36 && z < -2.28) return true;
  if (x < -4.08 && z > 2.34) return true;
  if (x > 3.54 && z > 0.02 && z < 2.18) return true;
  if (Math.abs(x) < 1.45 && Math.abs(z) < 0.64) return true;
  if (x > 1.8 && x < 3.26 && z < -3.0 && z > -4.12) return true;
  return false;
}

function isBuildableLot(x, z, w, d) {
  for (const building of buildingRecords) {
    const minDistance = Math.max(0.2, (w + d + building.w + building.d) * 0.15);
    if (Math.hypot(x - building.x, z - building.z) < minDistance) return false;
  }
  return true;
}

function pointSegmentDistance(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const lengthSq = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / lengthSq));
  const x = x0 + dx * t;
  const z = z0 + dz * t;
  return Math.hypot(px - x, pz - z);
}

function addViaduct(x0, z0, x1, z1, y, width, seed) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const cx = (x0 + x1) * 0.5;
  const cz = (z0 + z1) * 0.5;
  bridges.boxRotatedY(cx, y, cz, length, 0.12, width, angle);
  solar.boxRotatedY(cx, y + 0.07, cz, length * 0.94, 0.025, width * 1.65, angle);
  for (let i = 0.42; i < length - 0.2; i += 0.62) {
    const t = i / length;
    const x = x0 + dx * t;
    const z = z0 + dz * t;
    beacons.box(x, y + 0.16, z, 0.03, 0.22, 0.03);
    traffic.boxRotatedY(x, y + 0.31, z, 0.07 + noise(seed, i) * 0.04, 0.045, 0.06, angle);
  }
}

function addDataSpine(x, z, baseY, height, seed) {
  beacons.box(x, baseY + height * 0.5, z, 0.028, height, 0.028);
  const rings = Math.max(3, Math.floor(height / 0.16));
  for (let i = 0; i < rings; i += 1) {
    const y = baseY + 0.08 + i * height / rings;
    const span = 0.16 + noise(seed + i, 3) * 0.16;
    lanes.box(x, y, z, span, 0.014, 0.026);
    lanes.box(x, y + 0.012, z, 0.026, 0.014, span);
  }
  traffic.box(x, baseY + height + 0.04, z, 0.1, 0.055, 0.1);
}

function addTrafficFlowX(z, x0, x1, count, laneOffset, seed) {
  const span = x1 - x0;
  for (let i = 0; i < count; i += 1) {
    const t = (i + noise(seed, i) * 0.64) / count;
    const x = x0 + span * t;
    if (isReservedIntersection(x, z)) continue;
    const builder = i % 4 === 0 ? windowsCool : traffic;
    const length = 0.08 + noise(seed + i, 2) * 0.09;
    builder.box(x, 0.065, z + laneOffset, length, 0.045, 0.052);
  }
}

function addTrafficFlowZ(x, z0, z1, count, laneOffset, seed) {
  const span = z1 - z0;
  for (let i = 0; i < count; i += 1) {
    const t = (i + noise(seed, i) * 0.64) / count;
    const z = z0 + span * t;
    if (isReservedIntersection(x, z)) continue;
    const builder = i % 5 === 0 ? windowsCool : traffic;
    const length = 0.08 + noise(seed + i, 2) * 0.09;
    builder.box(x + laneOffset, 0.067, z, 0.052, 0.045, length);
  }
}

function addTrafficFlowDiagonal({ x0, z0, x1, z1, width }, count, seed) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const nx = -Math.sin(angle);
  const nz = Math.cos(angle);
  for (let i = 0; i < count; i += 1) {
    const t = (i + noise(seed, i) * 0.7) / count;
    const offset = (i % 2 === 0 ? -1 : 1) * width * 0.22;
    const x = x0 + dx * t + nx * offset;
    const z = z0 + dz * t + nz * offset;
    const builder = i % 4 === 0 ? windowsCool : traffic;
    builder.boxRotatedY(x, 0.07, z, 0.11 + noise(seed + i, 1) * 0.06, 0.045, 0.05, angle);
  }
}

function isReservedIntersection(x, z) {
  return roadX.some((road) => Math.abs(x - road) < 0.18) || roadZ.some((road) => Math.abs(z - road) < 0.18);
}

function addTower({ x, z, h, w, d, seed }) {
  const districtChoice = seed % 11;
  const builder = districtChoice < 3 ? districtA : districtChoice < 6 ? districtB : districtChoice < 9 ? districtC : graphite;
  const baseH = Math.max(0.32, Math.min(0.62, h * 0.28));
  const shoulderH = Math.max(0.2, h * (0.22 + noise(seed, 11) * 0.18));
  const shaftH = Math.max(0.32, h - baseH - shoulderH * 0.35);
  const terraceInset = 0.08 + noise(seed, 17) * 0.08;
  const capInset = 0.13 + noise(seed, 23) * 0.12;

  builder.box(x, baseH * 0.5, z, w * 1.32, baseH, d * 1.22);
  builder.box(x + (noise(seed, 3) - 0.5) * 0.08, baseH + shaftH * 0.5, z, w, shaftH, d);
  if (h > 1.35) {
    builder.box(x - w * 0.08, baseH + shaftH + shoulderH * 0.18, z + d * 0.06, w - terraceInset, shoulderH * 0.36, d - terraceInset);
  }
  if (h > 2.05) {
    builder.box(x + w * 0.05, baseH + shaftH + shoulderH * 0.52, z - d * 0.04, w - capInset, shoulderH * 0.34, d - capInset);
  }

  const topY = Math.max(h, baseH + shaftH + shoulderH * 0.7);
  graphite.box(x, topY + 0.025, z, w * 0.86, 0.05, d * 0.82);
  addWindows(x, z, w, d, topY, seed);
  addRoofKit(x, z, w, d, topY, seed);
  if (h > 1.85 && seed % 4 === 0) addBeacon(x, z, topY, 0.24 + noise(seed, 41) * 0.22);
  if (h > 1.15 && seed % 5 === 0) {
    solar.box(x, topY + 0.06, z, w * 0.58, 0.02, d * 0.5);
    lanes.box(x, topY + 0.084, z, w * 0.46, 0.012, 0.018);
  }

  buildingRecords.push({ x, z, h: topY, w, d, districtChoice });
}

function addHeroTower(x, z, w, d, h, builder, seed) {
  builder.box(x, h * 0.28, z, w * 1.18, h * 0.56, d * 1.1);
  builder.box(x + w * 0.12, h * 0.74, z - d * 0.08, w * 0.76, h * 0.36, d * 0.86);
  builder.box(x - w * 0.08, h * 0.98, z + d * 0.08, w * 0.54, h * 0.14, d * 0.62);
  graphite.box(x, h + 0.055, z, w * 0.5, 0.08, d * 0.58);
  addWindows(x, z, w * 1.05, d, h, seed + 100);
  addRoofKit(x, z, w, d, h, seed + 200);
  addBeacon(x, z, h, 0.5);
  buildingRecords.push({ x, z, h, w, d, districtChoice: seed });
}

function addWindows(x, z, w, d, h, seed) {
  const windowBuilder = seed % 3 === 0 ? windowsWarm : windowsCool;
  const rows = Math.min(14, Math.max(2, Math.floor(h / 0.24)));
  const columnCount = h > 2.2 ? 3 : 2;
  for (let row = 0; row < rows; row += 1) {
    if ((row + seed) % 7 === 0) continue;
    const wy = 0.25 + row * (h - 0.38) / rows;
    const glowScale = row > rows * 0.58 ? 0.72 : 1.0;
    for (let col = 0; col < columnCount; col += 1) {
      if ((col * 3 + row + seed) % 5 === 0) continue;
      const offset = (col - (columnCount - 1) * 0.5) * w * 0.24;
      windowBuilder.box(x + offset, wy, z - d * 0.512, w * 0.15 * glowScale, 0.028, 0.014);
      windowBuilder.box(x + offset, wy, z + d * 0.512, w * 0.15 * glowScale, 0.028, 0.014);
    }
    windowBuilder.box(x + w * 0.512, wy, z, 0.014, 0.028, d * 0.46 * glowScale);
    if ((row + seed) % 4 !== 0) {
      windowBuilder.box(x - w * 0.512, wy, z, 0.014, 0.028, d * 0.36 * glowScale);
    }
  }
  if (h > 1.6) {
    windowBuilder.box(x, h * 0.54, z - d * 0.518, w * 0.82, 0.035, 0.016);
    windowBuilder.box(x, h * 0.72, z + d * 0.518, w * 0.68, 0.035, 0.016);
  }
}

function addRoofKit(x, z, w, d, h, seed) {
  const unitCount = 1 + seed % 3;
  for (let i = 0; i < unitCount; i += 1) {
    const ox = (noise(seed, i + 50) - 0.5) * w * 0.45;
    const oz = (noise(seed + 7, i + 50) - 0.5) * d * 0.45;
    roofKit.box(x + ox, h + 0.075, z + oz, w * 0.16, 0.08, d * 0.2);
  }
  if (seed % 2 === 0) {
    roofKit.box(x - w * 0.53, h * 0.55, z, 0.025, h * 0.58, 0.035);
    roofKit.box(x + w * 0.53, h * 0.48, z, 0.025, h * 0.46, 0.035);
  } else {
    roofKit.box(x, h * 0.5, z - d * 0.53, 0.035, h * 0.48, 0.025);
  }
}

function addBeacon(x, z, h, height) {
  beacons.box(x, h + height * 0.5, z, 0.032, height, 0.032);
  beacons.box(x, h + height + 0.035, z, 0.11, 0.05, 0.11);
}

function addTree(x, z, scale) {
  trees.box(x, 0.08 * scale, z, 0.055 * scale, 0.18 * scale, 0.055 * scale);
  trees.box(x, 0.26 * scale, z, 0.25 * scale, 0.23 * scale, 0.25 * scale);
  trees.box(x + 0.06 * scale, 0.36 * scale, z - 0.04 * scale, 0.17 * scale, 0.14 * scale, 0.17 * scale);
}

function material(name, baseColorFactor, emissiveFactor, emissiveStrength) {
  return {
    name,
    pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0.25, roughnessFactor: 0.42 },
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
    boxRotatedY(cx, cy, cz, sx, sy, sz, angle) {
      rotatedBox(this, cx, cy, cz, sx, sy, sz, angle);
    },
    finish() {
      return { name, positions, normals, indices, material: materialIndex, min, max };
    }
  };
}

function rotatedBox(mesh, cx, cy, cz, sx, sy, sz, angle) {
  const y0 = cy - sy * 0.5, y1 = cy + sy * 0.5;
  const x0 = -sx * 0.5, x1 = sx * 0.5;
  const z0 = -sz * 0.5, z1 = sz * 0.5;
  const p = (x, y, z) => rotatePoint(cx, cz, x, y, z, angle);
  const n = (x, z) => rotateNormal(x, z, angle);
  face(mesh, [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], n(0, 1));
  face(mesh, [p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0)], n(0, -1));
  face(mesh, [p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)], n(-1, 0));
  face(mesh, [p(x1, y0, z1), p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1)], n(1, 0));
  face(mesh, [p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), p(x0, y1, z0)], [0, 1, 0]);
  face(mesh, [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)], [0, -1, 0]);
}

function rotatePoint(cx, cz, x, y, z, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cx + x * cos - z * sin, y, cz + x * sin + z * cos];
}

function rotateNormal(x, z, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - z * sin, 0, x * sin + z * cos];
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
