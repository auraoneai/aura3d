/**
 * Deep Recovery model synth — generates high-fidelity CC0 GLB props entirely in-repo.
 * Multi-material glTF 2.0 binary GLB container writer with PBR metallic/roughness.
 *
 * Models:
 *   - deepRecoverySub.glb          : 6-DOF high-tech research submarine with viewport dome, twin vector thrusters, grapple arm, dive planes, and spotlight arrays
 *   - deepRecoveryCrateStandard.glb: steel salvage cargo container with magnetic latch ring and hazard trims
 *   - deepRecoveryCrateHeavy.glb   : heavy reinforced titanium salvage container with corner bumpers
 *   - deepRecoveryWreckHull.glb    : sunken ironclad hull wreckage with curved structural ribs and deck machinery
 *   - deepRecoveryBuoyBeacon.glb   : surface salvage buoy station with circular pontoons, truss mast, and beacon strobe
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/models");

function part() {
  return { positions: [], normals: [], indices: [], nextVertex: 0 };
}

function addTriangle(p, a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  for (const v of [a, b, c]) {
    p.positions.push(v[0], v[1], v[2]);
    p.normals.push(nx, ny, nz);
  }
  p.indices.push(p.nextVertex, p.nextVertex + 1, p.nextVertex + 2);
  p.nextVertex += 3;
}

function addQuad(p, a, b, c, d) {
  addTriangle(p, a, b, c);
  addTriangle(p, a, c, d);
}

function addBox(p, cx, cy, cz, hx, hy, hz) {
  const v = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz],
    [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz],
    [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]
  ];
  addQuad(p, v[0], v[3], v[2], v[1]); // -Y
  addQuad(p, v[4], v[5], v[6], v[7]); // +Y
  addQuad(p, v[1], v[2], v[6], v[5]); // +X
  addQuad(p, v[3], v[0], v[4], v[7]); // -X
  addQuad(p, v[2], v[3], v[7], v[6]); // +Z
  addQuad(p, v[0], v[1], v[5], v[4]); // -Z
}

function addCylinderZ(p, r0, r1, z0, z1, cx = 0, cy = 0, segments = 16) {
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0a = cx + Math.cos(a0) * r0, y0a = cy + Math.sin(a0) * r0;
    const x1a = cx + Math.cos(a1) * r0, y1a = cy + Math.sin(a1) * r0;
    const x0b = cx + Math.cos(a0) * r1, y0b = cy + Math.sin(a0) * r1;
    const x1b = cx + Math.cos(a1) * r1, y1b = cy + Math.sin(a1) * r1;

    addQuad(p, [x0a, y0a, z0], [x1a, y1a, z0], [x1b, y1b, z1], [x0b, y0b, z1]);
  }
}

function addCylinderY(p, r0, r1, y0, y1, cx = 0, cz = 0, segments = 16) {
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0a = cx + Math.cos(a0) * r0, z0a = cz + Math.sin(a0) * r0;
    const x1a = cx + Math.cos(a1) * r0, z1a = cz + Math.sin(a1) * r0;
    const x0b = cx + Math.cos(a0) * r1, z0b = cz + Math.sin(a0) * r1;
    const x1b = cx + Math.cos(a1) * r1, z1b = cz + Math.sin(a1) * r1;

    addQuad(p, [x0a, y0, z0a], [x1a, y0, z1a], [x1b, y1, z1b], [x0b, y1, z0b]);
    addTriangle(p, [cx, y1, cz], [x0b, y1, z0b], [x1b, y1, z1b]);
    addTriangle(p, [cx, y0, cz], [x1a, y0, z1a], [x0a, y0, z0a]);
  }
}

function addDomeZ(p, r, zCenter, front = true, segments = 14) {
  for (let lat = 0; lat < segments; lat += 1) {
    const lat0 = (lat / segments) * (Math.PI / 2);
    const lat1 = ((lat + 1) / segments) * (Math.PI / 2);
    const r0 = Math.cos(lat0) * r;
    const r1 = Math.cos(lat1) * r;
    const z0 = zCenter + (front ? 1 : -1) * Math.sin(lat0) * r;
    const z1 = zCenter + (front ? 1 : -1) * Math.sin(lat1) * r;

    for (let lon = 0; lon < segments * 2; lon += 1) {
      const a0 = (lon / (segments * 2)) * Math.PI * 2;
      const a1 = ((lon + 1) / (segments * 2)) * Math.PI * 2;
      const x0a = Math.cos(a0) * r0, y0a = Math.sin(a0) * r0;
      const x1a = Math.cos(a1) * r0, y1a = Math.sin(a1) * r0;
      const x0b = Math.cos(a0) * r1, y0b = Math.sin(a0) * r1;
      const x1b = Math.cos(a1) * r1, y1b = Math.sin(a1) * r1;

      if (front) {
        addQuad(p, [x0a, y0a, z0], [x1a, y1a, z0], [x1b, y1b, z1], [x0b, y0b, z1]);
      } else {
        addQuad(p, [x1a, y1a, z0], [x0a, y0a, z0], [x0b, y0b, z1], [x1b, y1b, z1]);
      }
    }
  }
}

function addSphere(p, cx, cy, cz, radius, rings = 10, sectors = 14) {
  for (let r = 0; r < rings; r += 1) {
    const phi0 = (r / rings) * Math.PI - Math.PI / 2;
    const phi1 = ((r + 1) / rings) * Math.PI - Math.PI / 2;
    const y0 = cy + Math.sin(phi0) * radius;
    const y1 = cy + Math.sin(phi1) * radius;
    const rad0 = Math.cos(phi0) * radius;
    const rad1 = Math.cos(phi1) * radius;

    for (let s = 0; s < sectors; s += 1) {
      const theta0 = (s / sectors) * Math.PI * 2;
      const theta1 = ((s + 1) / sectors) * Math.PI * 2;
      const x0a = cx + Math.cos(theta0) * rad0, z0a = cz + Math.sin(theta0) * rad0;
      const x1a = cx + Math.cos(theta1) * rad0, z1a = cz + Math.sin(theta1) * rad0;
      const x0b = cx + Math.cos(theta0) * rad1, z0b = cz + Math.sin(theta0) * rad1;
      const x1b = cx + Math.cos(theta1) * rad1, z1b = cz + Math.sin(theta1) * rad1;

      addQuad(p, [x0a, y0, z0a], [x1a, y0, z1a], [x1b, y1, z1b], [x0b, y1, z0b]);
    }
  }
}

function writeMultiPartGlb(path, parts) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];

  const materials = parts.map((entry) => ({
    name: entry.name + "-mat",
    pbrMetallicRoughness: {
      baseColorFactor: entry.color,
      metallicFactor: entry.metallic ?? 0.1,
      roughnessFactor: entry.roughness ?? 0.5
    },
    ...(entry.emissive ? { emissiveFactor: entry.emissive } : {})
  }));

  let offset = 0;
  const pushView = (typedArray, target) => {
    const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes);
    if (pad > 0) chunks.push(Buffer.alloc(pad));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    offset += bytes.length + pad;
    return bufferViews.length - 1;
  };

  parts.forEach((entry, partIndex) => {
    const positionCount = entry.part.positions.length / 3;
    if (positionCount === 0 || entry.part.indices.length === 0) return;

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < entry.part.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], entry.part.positions[i + axis]);
        max[axis] = Math.max(max[axis], entry.part.positions[i + axis]);
      }
    }
    const positions = new Float32Array(entry.part.positions);
    const normals = new Float32Array(entry.part.normals);
    const indices = new Uint32Array(entry.part.indices);
    const posView = pushView(positions, 34962);
    const normView = pushView(normals, 34962);
    const idxView = pushView(indices, 34963);

    accessors.push({ bufferView: posView, componentType: 5126, count: positionCount, type: "VEC3", min, max });
    accessors.push({ bufferView: normView, componentType: 5126, count: positionCount, type: "VEC3" });
    accessors.push({ bufferView: idxView, componentType: 5125, count: indices.length, type: "SCALAR" });

    meshes.push({
      name: entry.name,
      primitives: [{
        attributes: { POSITION: accessors.length - 3, NORMAL: accessors.length - 2 },
        indices: accessors.length - 1,
        material: partIndex
      }]
    });
    nodes.push({ name: entry.name, mesh: meshes.length - 1 });
  });

  const body = Buffer.concat(chunks);
  const document = {
    asset: { version: "2.0", generator: "Aura3D Deep Recovery procedural GLB synth" },
    scene: 0,
    scenes: [{ name: "root", nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: body.length }]
  };

  const jsonSource = Buffer.from(JSON.stringify(document), "utf8");
  const jsonPadding = (4 - (jsonSource.length % 4)) % 4;
  const jsonData = Buffer.concat([jsonSource, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (body.length % 4)) % 4;
  const binData = Buffer.concat([body, Buffer.alloc(binPadding)]);
  const total = 12 + 8 + jsonData.length + 8 + binData.length;
  const output = Buffer.alloc(total);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(total, 8);
  output.writeUInt32LE(jsonData.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonData.copy(output, 20);
  const binHead = 20 + jsonData.length;
  output.writeUInt32LE(binData.length, binHead);
  output.writeUInt32LE(0x004e4942, binHead + 4);
  binData.copy(output, binHead + 8);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, output);
  return total;
}

mkdirSync(OUT_DIR, { recursive: true });

// ============================================================================
// 1. deepRecoverySub.glb — Sleek 6-DOF Research Submarine (3.2m long)
// Forward direction is +Z.
// ============================================================================
{
  const hullPart = part();       // Hazard Yellow Titanium Hull
  const darkPart = part();       // Carbon Armor / Trim / Propeller
  const glassPart = part();      // Glowing Viewport Dome
  const lightPart = part();      // Intense Bow Spotlights
  const thrusterGlow = part();   // Cyan Ion Exhaust

  // --- Main Streamlined Torpedo Hull (Z: -1.4 to +1.1, radius 0.52) ---
  addCylinderZ(hullPart, 0.52, 0.52, -1.1, 0.8, 0, 0, 16);
  // Tapered Tail (Z: -1.1 down to -1.5)
  addCylinderZ(hullPart, 0.22, 0.52, -1.5, -1.1, 0, 0, 16);
  // Forward Taper to Nose (Z: 0.8 to 1.15)
  addCylinderZ(hullPart, 0.52, 0.44, 0.8, 1.15, 0, 0, 16);

  // --- Cockpit Bubble at Forward Nose (Z: 1.15 to 1.45) ---
  addDomeZ(glassPart, 0.42, 1.12, true, 12);
  // Cockpit Titanium Frame Ring
  addCylinderZ(darkPart, 0.46, 0.46, 1.1, 1.18, 0, 0, 16);

  // --- Dorsal Conning Tower / Sensor Mast ---
  addBox(darkPart, 0, 0.58, -0.1, 0.22, 0.22, 0.55);
  // Upper Periscope Pylon & Optical Housing
  addBox(darkPart, 0, 0.88, 0.1, 0.06, 0.14, 0.08);
  addSphere(lightPart, 0, 0.98, 0.14, 0.08, 8, 10); // Mast Beacon

  // --- Stabilizer Tail Fins (X & Y 十字尾翼) ---
  // Top Vertical Rudder
  addBox(hullPart, 0, 0.45, -1.35, 0.04, 0.28, 0.25);
  // Bottom Keel Fin
  addBox(darkPart, 0, -0.42, -1.35, 0.04, 0.22, 0.25);
  // Horizontal Port/Starboard Dive Planes
  addBox(hullPart, -0.52, 0, -1.35, 0.32, 0.04, 0.22);
  addBox(hullPart, 0.52, 0, -1.35, 0.32, 0.04, 0.22);

  // --- Outrigger Vector Thruster Pods (Left & Right) ---
  for (const side of [-1, 1]) {
    const tx = side * 0.82;
    // Heavy Strut Pylon connecting pod to hull
    addBox(darkPart, side * 0.58, -0.05, -0.2, 0.24, 0.06, 0.16);
    // Cylindrical Nacelle Housing
    addCylinderZ(hullPart, 0.22, 0.22, -0.65, 0.35, tx, -0.05, 14);
    // Intake Cowling Front
    addCylinderZ(darkPart, 0.24, 0.22, 0.35, 0.42, tx, -0.05, 14);
    // Exhaust Nozzle Rear
    addCylinderZ(darkPart, 0.22, 0.24, -0.72, -0.65, tx, -0.05, 14);
    // Glowing Ion Exhaust Disc at Rear
    addDomeZ(thrusterGlow, 0.18, -0.7, false, 8);
    // Side Trim Stripe
    addBox(darkPart, tx + side * 0.2, -0.05, -0.15, 0.03, 0.08, 0.4);
  }

  // --- Forward High-Intensity Searchlight Array ---
  addBox(darkPart, -0.38, -0.22, 1.12, 0.12, 0.1, 0.14);
  addSphere(lightPart, -0.38, -0.22, 1.24, 0.11, 8, 10);

  addBox(darkPart, 0.38, -0.22, 1.12, 0.12, 0.1, 0.14);
  addSphere(lightPart, 0.38, -0.22, 1.24, 0.11, 8, 10);

  // --- Hydraulic Grapple Arm Rig on Forward Underside ---
  // Base Mount
  addBox(darkPart, 0, -0.52, 0.4, 0.18, 0.08, 0.28);
  // Articulated Arm Segments
  addBox(darkPart, 0, -0.68, 0.65, 0.07, 0.07, 0.26);
  // Magnetic Latch Claw Collar
  addBox(darkPart, 0, -0.72, 0.95, 0.16, 0.06, 0.12);
  // Magnetic Claw Tips
  addBox(lightPart, -0.14, -0.76, 1.05, 0.03, 0.06, 0.08);
  addBox(lightPart, 0.14, -0.76, 1.05, 0.03, 0.06, 0.08);

  const subParts = [
    { name: "hull", part: hullPart, color: [0.95, 0.72, 0.08, 1.0], roughness: 0.32, metallic: 0.45 },
    { name: "dark", part: darkPart, color: [0.12, 0.15, 0.22, 1.0], roughness: 0.45, metallic: 0.65 },
    { name: "glass", part: glassPart, color: [0.15, 0.85, 0.95, 0.9], roughness: 0.08, metallic: 0.1, emissive: [0.1, 0.6, 0.8] },
    { name: "lights", part: lightPart, color: [0.95, 0.98, 1.0, 1.0], roughness: 0.1, metallic: 0.1, emissive: [0.75, 0.88, 1.0] },
    { name: "exhaust", part: thrusterGlow, color: [0.2, 0.75, 1.0, 1.0], roughness: 0.2, metallic: 0.0, emissive: [0.25, 0.75, 1.0] }
  ];
  writeMultiPartGlb(resolve(OUT_DIR, "deepRecoverySub.glb"), subParts);
}

// ============================================================================
// 2. deepRecoveryCrateStandard.glb — Steel Salvage Cargo Pod (~1.0m)
// ============================================================================
{
  const crateHull = part();
  const crateTrim = part();
  const crateGlow = part();

  // Main container body
  addBox(crateHull, 0, 0.45, 0, 0.42, 0.42, 0.42);
  // Outer Steel Reinforcement Cage / Edges
  addBox(crateTrim, 0, 0.45, 0, 0.45, 0.44, 0.45);
  // Magnetic Docking Ring Top
  addCylinderY(crateTrim, 0.24, 0.24, 0.86, 0.98, 0, 0, 12);
  addSphere(crateGlow, 0, 0.94, 0, 0.12, 8, 10);

  const crateParts = [
    { name: "crateHull", part: crateHull, color: [0.18, 0.48, 0.78, 1.0], roughness: 0.4, metallic: 0.6 },
    { name: "crateTrim", part: crateTrim, color: [0.22, 0.26, 0.32, 1.0], roughness: 0.5, metallic: 0.8 },
    { name: "crateGlow", part: crateGlow, color: [0.2, 0.9, 0.95, 1.0], roughness: 0.2, metallic: 0.1, emissive: [0.2, 0.8, 1.0] }
  ];
  writeMultiPartGlb(resolve(OUT_DIR, "deepRecoveryCrateStandard.glb"), crateParts);
}

// ============================================================================
// 3. deepRecoveryCrateHeavy.glb — Reinforced Hazard Titanium Container (~1.4m)
// ============================================================================
{
  const crateHull = part();
  const crateTrim = part();
  const crateGlow = part();

  // Heavy hexagonal / octagonal container body
  addBox(crateHull, 0, 0.55, 0, 0.58, 0.52, 0.58);
  // Heavy Corner Shock Bumpers
  addBox(crateTrim, 0, 0.55, 0, 0.64, 0.54, 0.64);
  // Heavy Dual Ring Collar
  addCylinderY(crateTrim, 0.32, 0.32, 1.04, 1.22, 0, 0, 14);
  addSphere(crateGlow, 0, 1.15, 0, 0.18, 8, 10);

  const heavyParts = [
    { name: "crateHull", part: crateHull, color: [0.92, 0.48, 0.12, 1.0], roughness: 0.35, metallic: 0.5 },
    { name: "crateTrim", part: crateTrim, color: [0.15, 0.18, 0.22, 1.0], roughness: 0.45, metallic: 0.85 },
    { name: "crateGlow", part: crateGlow, color: [1.0, 0.7, 0.1, 1.0], roughness: 0.2, metallic: 0.1, emissive: [1.0, 0.65, 0.12] }
  ];
  writeMultiPartGlb(resolve(OUT_DIR, "deepRecoveryCrateHeavy.glb"), heavyParts);
}

// ============================================================================
// 4. deepRecoveryWreckHull.glb — Sunken Ironclad Wreckage (~6.5m)
// ============================================================================
{
  const rustPart = part();
  const metalPart = part();
  const deckPart = part();
  const glowPart = part();

  // A broad, readable ironclad silhouette for the overhead salvage-map state.
  // The previous asset was almost entirely tall black ribs; from above it read
  // as unrelated bars and hid its own hull. Layered deck plates now establish
  // a continuous ship form while leaving broken edges and machinery visible.
  const deckSections = [
    { z: -2.55, width: 0.9, length: 0.62 },
    { z: -1.75, width: 1.38, length: 0.58 },
    { z: -0.9, width: 1.62, length: 0.62 },
    { z: 0.0, width: 1.75, length: 0.68 },
    { z: 0.92, width: 1.55, length: 0.62 },
    { z: 1.82, width: 1.28, length: 0.6 },
    { z: 2.62, width: 0.78, length: 0.48 }
  ];
  for (const section of deckSections) {
    addBox(rustPart, 0, 0.28, section.z, section.width, 0.28, section.length);
    addBox(deckPart, 0, 0.59, section.z, section.width * 0.9, 0.055, section.length * 0.9);
  }

  // Keel, gunwales, and three low surviving ribs retain the wreck identity
  // without creating a forest of near-black columns.
  addBox(metalPart, 0, 0.15, 0, 0.22, 0.18, 3.18);
  addBox(rustPart, -1.5, 0.72, 0, 0.12, 0.42, 2.35);
  addBox(rustPart, 1.5, 0.72, -0.35, 0.12, 0.42, 1.95);
  for (const z of [-1.55, 0.05, 1.55]) {
    addBox(rustPart, -1.18, 1.02, z, 0.11, 0.46, 0.11);
    addBox(rustPart, 1.18, 0.94, z, 0.11, 0.38, 0.11);
    addBox(rustPart, 0, 1.42, z, 1.25, 0.09, 0.11);
  }

  // Boilers, bridge plinth, hatch covers, and broken cargo machinery create a
  // readable top surface with several material responses.
  addCylinderZ(metalPart, 0.48, 0.48, -1.15, 0.9, -0.42, 1.0, 20);
  addCylinderZ(metalPart, 0.34, 0.34, -0.82, 0.72, 0.6, 0.92, 18);
  addBox(metalPart, 0.18, 0.82, 1.55, 0.62, 0.22, 0.48);
  addBox(deckPart, -0.65, 0.72, -1.55, 0.42, 0.08, 0.34);
  addBox(deckPart, 0.72, 0.72, 1.72, 0.36, 0.08, 0.3);

  // Warm surviving lamps give the wreck a focal rhythm and remain real GLB
  // emissive geometry, not a DOM or capture-only overlay.
  for (const [x, z] of [[-1.34, -1.5], [1.34, -0.65], [-1.34, 0.55], [1.34, 1.35]]) {
    addSphere(glowPart, x, 0.78, z, 0.12, 8, 12);
  }

  const wreckParts = [
    { name: "rustHull", part: rustPart, color: [0.34, 0.28, 0.2, 1.0], roughness: 0.82, metallic: 0.24 },
    { name: "darkMetal", part: metalPart, color: [0.18, 0.33, 0.35, 1.0], roughness: 0.58, metallic: 0.5 },
    { name: "wornDeck", part: deckPart, color: [0.46, 0.43, 0.32, 1.0], roughness: 0.76, metallic: 0.12 },
    { name: "survivingLamps", part: glowPart, color: [1.0, 0.66, 0.2, 1.0], roughness: 0.18, metallic: 0.08, emissive: [1.0, 0.42, 0.06] }
  ];
  writeMultiPartGlb(resolve(OUT_DIR, "deepRecoveryWreckHull.glb"), wreckParts);
}

// ============================================================================
// 5. deepRecoveryBuoyBeacon.glb — Surface Recovery Rig Platform (~5.5m)
// ============================================================================
{
  const hullPart = part();
  const mastPart = part();
  const lightPart = part();

  // Toroidal circular flotation pontoon ring
  addCylinderY(hullPart, 2.4, 2.4, -0.5, 0.5, 0, 0, 18);
  // Yellow safety fender collar
  addCylinderY(hullPart, 2.6, 2.6, -0.15, 0.25, 0, 0, 18);

  // Cross deck platform
  addBox(mastPart, 0, 0.52, 0, 1.6, 0.08, 1.6);

  // Central lattice truss mast
  for (const corner of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) {
    addBox(mastPart, corner[0], 1.8, corner[1], 0.06, 1.3, 0.06);
  }
  // Upper beacon housing
  addBox(mastPart, 0, 3.1, 0, 0.45, 0.2, 0.45);
  // High-intensity green salvage strobe
  addSphere(lightPart, 0, 3.45, 0, 0.35, 10, 12);

  const buoyParts = [
    { name: "buoyHull", part: hullPart, color: [0.95, 0.75, 0.1, 1.0], roughness: 0.4, metallic: 0.3 },
    { name: "buoyMast", part: mastPart, color: [0.18, 0.22, 0.28, 1.0], roughness: 0.5, metallic: 0.8 },
    { name: "buoyLight", part: lightPart, color: [0.2, 0.95, 0.5, 1.0], roughness: 0.1, metallic: 0.1, emissive: [0.25, 1.0, 0.55] }
  ];
  writeMultiPartGlb(resolve(OUT_DIR, "deepRecoveryBuoyBeacon.glb"), buoyParts);
}

console.log("Deep Recovery high-fidelity GLB models synthesized successfully into", OUT_DIR);
