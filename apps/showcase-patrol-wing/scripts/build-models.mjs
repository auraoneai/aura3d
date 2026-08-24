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
  // Tapered fuselage: nose at x = +0.95, tail at x = -1.05.
  addBox(fuselage, 0.78, 0, 0, 0.17, 0.13, 0.11);   // cowl
  addBox(fuselage, 0.45, -0.01, 0, 0.2, 0.14, 0.13); // forward hull
  addBox(fuselage, 0.05, -0.02, 0, 0.24, 0.15, 0.14); // cockpit hull
  addBox(fuselage, -0.4, -0.03, 0, 0.22, 0.12, 0.11); // aft hull
  addBox(fuselage, -0.92, -0.05, 0, 0.24, 0.09, 0.06); // tail boom

  const canopy = part();
  addBox(canopy, 0.18, 0.15, 0, 0.14, 0.07, 0.09);

  const wing = part();
  addBox(wing, 0.1, 0.03, 0, 0.2, 0.03, 1.0);      // main wing, 2.0 m span
  addBox(wing, 0.1, 0.09, 0.72, 0.18, 0.045, 0.24); // right wingtip strake
  addBox(wing, 0.1, 0.09, -0.72, 0.18, 0.045, 0.24); // left wingtip strake

  const tail = part();
  addBox(tail, -1.02, 0.0, 0, 0.13, 0.02, 0.38);   // tailplane
  addBox(tail, -1.06, 0.2, 0, 0.14, 0.18, 0.02);   // fin

  const spinner = part();
  addBox(spinner, 0.99, 0, 0, 0.05, 0.05, 0.05);   // prop hub
  addBox(spinner, 1.02, 0, 0, 0.012, 0.34, 0.05);  // vertical prop blade
  addBox(spinner, 1.02, 0, 0, 0.012, 0.05, 0.34);  // horizontal prop blade

  return [
    { name: "fuselage", part: fuselage, color: [0.93, 0.89, 0.78, 1], roughness: 0.55 },
    { name: "canopy", part: canopy, color: [0.2, 0.32, 0.45, 1], roughness: 0.15, metallic: 0.4 },
    { name: "wing", part: wing, color: [0.85, 0.22, 0.2, 1], roughness: 0.5 },
    { name: "tail", part: tail, color: [0.85, 0.22, 0.2, 1], roughness: 0.5 },
    { name: "spinner", part: spinner, color: [0.15, 0.15, 0.18, 1], roughness: 0.35, metallic: 0.6 }
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
  addBox(frame, 0, 0, 0, heavy ? 0.3 : 0.26, 0.12, heavy ? 0.3 : 0.26);
  addBox(frame, 0.3, -0.02, 0, 0.16, 0.07, 0.16);   // nose sensor pod

  const arms = part();
  const armR0 = 0.2;
  const armR1 = heavy ? 0.62 : 0.54;
  for (const angle of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    addArm(arms, 0.08, angle, armR0, armR1, 0.035);
  }

  const rotors = part();
  const rotorR = heavy ? 0.26 : 0.22;
  for (const angle of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const c = Math.cos(angle), s = Math.sin(angle);
    addRotorAt(rotors, 0.16, c * armR1, s * armR1, rotorR);
  }

  const eye = part();
  addBox(eye, 0.46, -0.02, 0, 0.05, 0.05, 0.05);

  return [
    {
      name: "frame",
      part: frame,
      color: heavy ? [0.16, 0.18, 0.22, 1] : [0.2, 0.16, 0.24, 1],
      roughness: 0.45,
      metallic: 0.55
    },
    { name: "arms", part: arms, color: [0.1, 0.11, 0.14, 1], roughness: 0.5, metallic: 0.5 },
    { name: "rotors", part: rotors, color: [0.55, 0.58, 0.62, 1], roughness: 0.3, metallic: 0.7 },
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
