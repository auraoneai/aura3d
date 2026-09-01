/**
 * Patrol Wing model synth — generates original CC0 GLB props entirely in-repo
 * (aurora-lander / vault-breakers writer pattern: minimal glTF 2.0 GLB writer,
 * flat-shaded, indexed, no dependencies).
 *
 *   - patrolWingPlane.glb     : low-poly stunt plane, local +X = forward, ~2 m wingspan
 *   - patrolWingDroneA.glb    : menacing quad-rotor pursuit drone (heavy frame)
 *   - patrolWingDroneB.glb    : lighter, faster quad-rotor variant
 *   - patrolWingPadBeacon.glb : cliff landing pad with emissive light ring + beacons
 *
 * Units are meters. The plane's origin sits at its center of mass; +X is the
 * nose, +Y is up, +Z is the right wing.
 *
 * Run from the repo root:  node apps/showcase-patrol-wing/scripts/build-models.mjs
 * Output: apps/showcase-patrol-wing/assets/models/*.glb
 *
 * After generation register each model with the CLI so it lands in the typed root
 * asset map the route imports (`../../../src/aura-assets`). This script documents
 * the commands but does NOT run them:
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add apps/showcase-patrol-wing/assets/models/patrolWingPlane.glb --name patrolWingPlane --type model --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-patrol-wing/scripts/build-models.mjs"
 *   ... same for patrolWingDroneA.glb, patrolWingDroneB.glb, patrolWingPadBeacon.glb
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/models");

// ---- geometry helpers (vault-breakers writer pattern) ------------------------
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

function ringZ(n, r, z) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    pts.push([Math.cos(angle) * r, Math.sin(angle) * r, z]);
  }
  return pts;
}

function addBand(p, lower, upper) {
  const n = Math.min(lower.length, upper.length);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    addQuad(p, lower[i], lower[j], upper[j], upper[i]);
  }
}

function addZCap(p, pts, z, front, cx = 0, cy = 0) {
  const center = [cx, cy, z];
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    if (front) addTriangle(p, center, pts[i], pts[j]);
    else addTriangle(p, center, pts[j], pts[i]);
  }
}

function addBox(p, cx, cy, cz, hx, hy, hz) {
  const v = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz],
    [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz],
    [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]
  ];
  addQuad(p, v[0], v[3], v[2], v[1]); // bottom
  addQuad(p, v[4], v[5], v[6], v[7]); // top
  addQuad(p, v[1], v[2], v[6], v[5]); // +Z
  addQuad(p, v[3], v[0], v[4], v[7]); // -Z
  addQuad(p, v[0], v[1], v[5], v[4]); // -X
  addQuad(p, v[2], v[3], v[7], v[6]); // +X
}

function ringX(n, radiusY, radiusZ, x, centerY = 0, centerZ = 0) {
  const points = [];
  for (let index = 0; index < n; index += 1) {
    const angle = (index / n) * Math.PI * 2;
    points.push([x, centerY + Math.cos(angle) * radiusY, centerZ + Math.sin(angle) * radiusZ]);
  }
  return points;
}

function addXCap(p, points, x, front) {
  const centerY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const centerZ = points.reduce((sum, point) => sum + point[2], 0) / points.length;
  const center = [x, centerY, centerZ];
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    if (front) addTriangle(p, center, points[next], points[index]);
    else addTriangle(p, center, points[index], points[next]);
  }
}

function addExtrudedPolygonXZ(p, points, bottomY, topY) {
  const bottom = points.map(([x, z]) => [x, bottomY, z]);
  const top = points.map(([x, z]) => [x, topY, z]);
  for (let index = 1; index < points.length - 1; index += 1) {
    addTriangle(p, top[0], top[index], top[index + 1]);
    addTriangle(p, bottom[0], bottom[index + 1], bottom[index]);
  }
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    addQuad(p, bottom[index], bottom[next], top[next], top[index]);
  }
}

/**
 * A flat 8-sided rotor disc centered at (x, cy, cz), spinning in the YZ plane
 * (the drone's +X facing): a thin ring band plus hub, like a blurred prop.
 */
function addRotorAt(p, x, cy, cz, radius) {
  const inner = [];
  const outer = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    inner.push([x, cy + Math.cos(angle) * radius * 0.18, cz + Math.sin(angle) * radius * 0.18]);
    outer.push([x, cy + Math.cos(angle) * radius, cz + Math.sin(angle) * radius]);
  }
  for (let i = 0; i < 8; i += 1) {
    const j = (i + 1) % 8;
    addQuad(p, inner[i], inner[j], outer[j], outer[i]);
  }
}

/** An arm along a diagonal in the YZ plane at x, from r0 to r1. */
function addArm(p, x, angle, r0, r1, thickness) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const ax = (r) => [x, c * r, s * r];
  const pts = [
    [ax(r0)[1] - thickness, ax(r0)[2] - thickness],
    [ax(r1)[1] - thickness, ax(r1)[2] - thickness],
    [ax(r1)[1] + thickness, ax(r1)[2] + thickness],
    [ax(r0)[1] + thickness, ax(r0)[2] + thickness]
  ];
  addQuad(
    p,
    [x - thickness * 0.5, pts[0][0], pts[0][1]],
    [x - thickness * 0.5, pts[1][0], pts[1][1]],
    [x - thickness * 0.5, pts[2][0], pts[2][1]],
    [x - thickness * 0.5, pts[3][0], pts[3][1]]
  );
  addQuad(
    p,
    [x + thickness * 0.5, pts[3][0], pts[3][1]],
    [x + thickness * 0.5, pts[2][0], pts[2][1]],
    [x + thickness * 0.5, pts[1][0], pts[1][1]],
    [x + thickness * 0.5, pts[0][0], pts[0][1]]
  );
  addQuad(
    p,
    [x - thickness * 0.5, pts[0][0], pts[0][1]],
    [x + thickness * 0.5, pts[0][0], pts[0][1]],
    [x + thickness * 0.5, pts[1][0], pts[1][1]],
    [x - thickness * 0.5, pts[1][0], pts[1][1]]
  );
  addQuad(
    p,
    [x - thickness * 0.5, pts[1][0], pts[1][1]],
    [x + thickness * 0.5, pts[1][0], pts[1][1]],
    [x + thickness * 0.5, pts[2][0], pts[2][1]],
    [x - thickness * 0.5, pts[2][0], pts[2][1]]
  );
  addQuad(
    p,
    [x - thickness * 0.5, pts[2][0], pts[2][1]],
    [x + thickness * 0.5, pts[2][0], pts[2][1]],
    [x + thickness * 0.5, pts[3][0], pts[3][1]],
    [x - thickness * 0.5, pts[3][0], pts[3][1]]
  );
  addQuad(
    p,
    [x - thickness * 0.5, pts[3][0], pts[3][1]],
    [x + thickness * 0.5, pts[3][0], pts[3][1]],
    [x + thickness * 0.5, pts[0][0], pts[0][1]],
    [x - thickness * 0.5, pts[0][0], pts[0][1]]
  );
}

// ---- stunt plane -------------------------------------------------------------
/**
 * Low-poly stunt plane, +X = nose. Cream fuselage with a red cowl, 2.0 m
 * wingspan main wing at x = 0.1, tailplane + fin at the tail.
 */
function buildPlane() {
  const fuselage = part();
  const bodyRings = [
    ringX(8, 0.045, 0.045, 1.52, 0.01),
    ringX(8, 0.2, 0.2, 1.12),
    ringX(8, 0.31, 0.3, 0.35, 0.01),
    ringX(8, 0.29, 0.27, -0.48),
    ringX(8, 0.14, 0.13, -1.38, -0.01)
  ];
  for (let index = 0; index < bodyRings.length - 1; index += 1) addBand(fuselage, bodyRings[index], bodyRings[index + 1]);
  addXCap(fuselage, bodyRings[0], 1.52, true);
  addXCap(fuselage, bodyRings.at(-1), -1.38, false);

  const canopy = part();
  addExtrudedPolygonXZ(canopy, [[0.72, -0.2], [0.7, 0.2], [-0.18, 0.23], [-0.46, 0.16], [-0.46, -0.16], [-0.18, -0.23]], 0.18, 0.4);

  const wing = part();
  addExtrudedPolygonXZ(wing, [[0.52, -0.2], [0.15, -1.68], [-0.55, -1.78], [-0.28, -0.23]], -0.055, 0.025);
  addExtrudedPolygonXZ(wing, [[0.52, 0.2], [-0.28, 0.23], [-0.55, 1.78], [0.15, 1.68]], -0.055, 0.025);

  const trim = part();
  addExtrudedPolygonXZ(trim, [[0.18, -1.28], [0.08, -1.68], [-0.53, -1.76], [-0.42, -1.34]], 0.026, 0.075);
  addExtrudedPolygonXZ(trim, [[0.18, 1.28], [-0.42, 1.34], [-0.53, 1.76], [0.08, 1.68]], 0.026, 0.075);

  const tail = part();
  addExtrudedPolygonXZ(tail, [[-0.84, -0.12], [-1.08, -0.78], [-1.42, -0.82], [-1.28, -0.1]], 0.0, 0.06);
  addExtrudedPolygonXZ(tail, [[-0.84, 0.12], [-1.28, 0.1], [-1.42, 0.82], [-1.08, 0.78]], 0.0, 0.06);
  addBox(tail, -1.16, 0.29, -0.14, 0.28, 0.29, 0.045);
  addBox(tail, -1.16, 0.29, 0.14, 0.28, 0.29, 0.045);

  const engines = part();
  addBox(engines, -1.37, -0.03, -0.13, 0.035, 0.09, 0.075);
  addBox(engines, -1.37, -0.03, 0.13, 0.035, 0.09, 0.075);

  return [
    { name: "fuselage", part: fuselage, color: [0.18, 0.29, 0.42, 1], roughness: 0.34, metallic: 0.58 },
    { name: "canopy", part: canopy, color: [0.08, 0.58, 0.78, 1], roughness: 0.12, metallic: 0.45 },
    { name: "wing", part: wing, color: [0.28, 0.46, 0.64, 1], roughness: 0.38, metallic: 0.5 },
    { name: "trim", part: trim, color: [1.0, 0.25, 0.34, 1], roughness: 0.28, metallic: 0.35 },
    { name: "tail", part: tail, color: [0.15, 0.25, 0.38, 1], roughness: 0.4, metallic: 0.5 },
    { name: "engines", part: engines, color: [0.28, 0.95, 1.0, 1], roughness: 0.1, metallic: 0.15 }
  ];
}

// ---- pursuit drones ----------------------------------------------------------
/**
 * Quad-rotor pursuit drone facing +X. Heavy "A" variant: wide arms, big
 * rotors, dark gunmetal frame with an amber sensor eye.
 */
function buildDrone(variant) {
  const heavy = variant === "A";
  const frame = part();
  const bodyRings = [
    ringX(6, 0.035, 0.035, 0.82),
    ringX(6, heavy ? 0.2 : 0.16, heavy ? 0.2 : 0.16, 0.46),
    ringX(6, heavy ? 0.24 : 0.2, heavy ? 0.23 : 0.19, -0.14),
    ringX(6, 0.1, 0.09, -0.72)
  ];
  for (let index = 0; index < bodyRings.length - 1; index += 1) addBand(frame, bodyRings[index], bodyRings[index + 1]);
  addXCap(frame, bodyRings[0], 0.82, true);
  addXCap(frame, bodyRings.at(-1), -0.72, false);

  const arms = part();
  const span = heavy ? 0.9 : 0.76;
  addExtrudedPolygonXZ(arms, [[0.34, -0.14], [-0.05, -span], [-0.52, -span * 0.72], [-0.3, -0.12]], -0.035, 0.035);
  addExtrudedPolygonXZ(arms, [[0.34, 0.14], [-0.3, 0.12], [-0.52, span * 0.72], [-0.05, span]], -0.035, 0.035);

  const rotors = part();
  addBox(rotors, -0.5, 0.2, -0.42, 0.2, 0.2, 0.035);
  addBox(rotors, -0.5, 0.2, 0.42, 0.2, 0.2, 0.035);

  const eye = part();
  addBox(eye, 0.78, -0.01, 0, 0.045, 0.065, 0.09);

  return [
    {
      name: "frame",
      part: frame,
      color: heavy ? [0.34, 0.08, 0.1, 1] : [0.16, 0.1, 0.35, 1],
      roughness: 0.45,
      metallic: 0.55
    },
    { name: "arms", part: arms, color: heavy ? [0.82, 0.12, 0.16, 1] : [0.45, 0.2, 0.8, 1], roughness: 0.42, metallic: 0.5 },
    { name: "rotors", part: rotors, color: [0.12, 0.14, 0.2, 1], roughness: 0.3, metallic: 0.7 },
    {
      name: "eye",
      part: eye,
      color: heavy ? [1.0, 0.55, 0.15, 1] : [0.2, 0.9, 1.0, 1],
      roughness: 0.2
    }
  ];
}

// ---- landing pad beacon ------------------------------------------------------
/**
 * Cliff pad: a 4.4 m octagonal deck (ringZ disc lying flat by construction in
 * the XY plane, so it is rotated 90 deg around X at placement) is NOT used —
 * instead the pad is authored flat in the XZ plane: deck slab, emissive light
 * ring standing 0.06 m proud, and four corner beacons.
 */
function buildPadBeacon() {
  const deck = part();
  addBox(deck, 0, -0.09, 0, 2.2, 0.09, 2.2);
  addBox(deck, 0, 0.005, 0, 1.55, 0.005, 1.55);

  const ring = part();
  // Light ring: thin flat octagon band on the deck surface.
  const inner = [];
  const outer = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    inner.push([Math.cos(angle) * 1.5, 0.055, Math.sin(angle) * 1.5]);
    outer.push([Math.cos(angle) * 1.72, 0.055, Math.sin(angle) * 1.72]);
  }
  for (let i = 0; i < 8; i += 1) {
    const j = (i + 1) % 8;
    addQuad(ring, inner[i], inner[j], outer[j], outer[i]);
  }

  const beacons = part();
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    addBox(beacons, sx * 1.9, 0.18, sz * 1.9, 0.08, 0.18, 0.08);
  }

  return [
    { name: "deck", part: deck, color: [0.24, 0.27, 0.3, 1], roughness: 0.75, metallic: 0.2 },
    { name: "ring", part: ring, color: [0.1, 0.5, 0.45, 1], roughness: 0.3 },
    { name: "beacons", part: beacons, color: [1.0, 0.75, 0.25, 1], roughness: 0.25 }
  ];
}

// ---- GLB writer --------------------------------------------------------------
function writeGlb(path, parts) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materials = parts.map((entry) => ({
    name: entry.name + "-material",
    pbrMetallicRoughness: {
      baseColorFactor: entry.color,
      metallicFactor: entry.metallic ?? 0.05,
      roughnessFactor: entry.roughness
    }
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
    if (positionCount === 0 || entry.part.indices.length === 0) {
      throw new Error("part " + entry.name + " has no triangles.");
    }
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
    nodes.push({ name: entry.name, mesh: partIndex });
  });

  const body = Buffer.concat(chunks);
  const document = {
    asset: { version: "2.0", generator: "aura3d showcase-patrol-wing build-models (original CC0)" },
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
  output.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  jsonData.copy(output, 20);
  const binHead = 20 + jsonData.length;
  output.writeUInt32LE(binData.length, binHead);
  output.writeUInt32LE(0x004e4942, binHead + 4); // "BIN\0"
  binData.copy(output, binHead + 8);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, output);
  return total;
}

mkdirSync(OUT_DIR, { recursive: true });

const planeParts = buildPlane();
const planeBytes = writeGlb(resolve(OUT_DIR, "patrolWingPlane.glb"), planeParts);
console.log("wrote", resolve(OUT_DIR, "patrolWingPlane.glb"), "(" + planeBytes + " bytes)");

const droneAParts = buildDrone("A");
const droneABytes = writeGlb(resolve(OUT_DIR, "patrolWingDroneA.glb"), droneAParts);
console.log("wrote", resolve(OUT_DIR, "patrolWingDroneA.glb"), "(" + droneABytes + " bytes)");

const droneBParts = buildDrone("B");
const droneBBytes = writeGlb(resolve(OUT_DIR, "patrolWingDroneB.glb"), droneBParts);
console.log("wrote", resolve(OUT_DIR, "patrolWingDroneB.glb"), "(" + droneBBytes + " bytes)");

const padParts = buildPadBeacon();
const padBytes = writeGlb(resolve(OUT_DIR, "patrolWingPadBeacon.glb"), padParts);
console.log("wrote", resolve(OUT_DIR, "patrolWingPadBeacon.glb"), "(" + padBytes + " bytes)");
