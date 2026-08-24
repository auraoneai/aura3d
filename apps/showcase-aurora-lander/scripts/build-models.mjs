/**
 * Aurora Lander model synth — generates original CC0 GLB props entirely in-repo.
 *
 * Two authored low-poly props, flat-shaded and indexed, written as minimal glTF 2.0
 * GLB containers with no dependencies:
 *   - auroraLanderProbe.glb : the expedition lander (primary typed hero asset)
 *   - auroraPadBeacon.glb   : landing-pad approach beacon prop
 *
 * Run from the repo root:  node apps/showcase-aurora-lander/scripts/build-models.mjs
 * Output: apps/showcase-aurora-lander/assets/models/*.glb
 *
 * After generation register each model with the CLI so it lands in the typed root
 * asset map the route imports (`../../../src/aura-assets`), e.g.:
 * Re-register both generated models through `aura3d assets add` with the durable
 * GitHub source/download URLs, CC0 URL, role/suitability, and the current
 * hash-bound files in tests/reports/showcase-release-asset-probes/. See the
 * exact current metadata in aura.assets.json; never hand-edit that manifest.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/models");

// ---- geometry helpers -------------------------------------------------------
/**
 * A part accumulates flat-shaded triangles: every triangle carries its own three
 * vertices and face normal, which reads cleanly at low polygon counts.
 */
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

/** Quad split into two triangles, wound outward in the provided corner order. */
function addQuad(p, a, b, c, d) {
  addTriangle(p, a, b, c);
  addTriangle(p, a, c, d);
}

/** Ring of points around the Y axis at height y with radius r. */
function ring(n, r, y) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    pts.push([Math.cos(angle) * r, y, Math.sin(angle) * r]);
  }
  return pts;
}

/** Tapered tube between two rings. */
function addBand(p, lower, upper) {
  const n = Math.min(lower.length, upper.length);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    addQuad(p, lower[i], lower[j], upper[j], upper[i]);
  }
}

/** Inverted tube between two rings (nozzle skirt). */
function addBandInverted(p, lower, upper) {
  const n = Math.min(lower.length, upper.length);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    addQuad(p, upper[j], upper[i], lower[i], lower[j]);
  }
}

/** Cap a ring with an n-gon fan around an offset center. */
function addCap(p, pts, y, up, cx = 0, cz = 0) {
  const center = [cx, y, cz];
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    if (up) addTriangle(p, center, pts[i], pts[j]);
    else addTriangle(p, center, pts[j], pts[i]);
  }
}

/** Axis-aligned box from center + half extents. */
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

/** Box rotated yaw around Y (angled struts). */
function addOrientedBox(p, cx, cy, cz, hx, hy, hz, yaw) {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const rot = ([x, y, z]) => [cx + x * cos - z * sin, cy + y, cz + x * sin + z * cos];
  const local = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz],
    [-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]
  ].map(rot);
  addQuad(p, local[0], local[3], local[2], local[1]);
  addQuad(p, local[4], local[5], local[6], local[7]);
  addQuad(p, local[1], local[2], local[6], local[5]);
  addQuad(p, local[3], local[0], local[4], local[7]);
  addQuad(p, local[0], local[1], local[5], local[4]);
  addQuad(p, local[2], local[3], local[7], local[6]);
}

// ---- lander probe -----------------------------------------------------------
const SEGMENTS = 8;

function buildLander() {
  const hull = part();
  // Descent hull: wide skirt tapering to a cabin drum, then a sensor dome.
  const skirtBottom = ring(SEGMENTS, 0.46, 0.16);
  const skirtTop = ring(SEGMENTS, 0.34, 0.44);
  addCap(hull, skirtBottom, 0.16, false);
  addBand(hull, skirtBottom, skirtTop);
  const cabinTop = ring(SEGMENTS, 0.30, 0.66);
  addBand(hull, skirtTop, cabinTop);
  addCap(hull, cabinTop, 0.66, true);
  const domeA = ring(SEGMENTS, 0.26, 0.72);
  const domeB = ring(SEGMENTS, 0.17, 0.80);
  const domeC = ring(SEGMENTS, 0.07, 0.85);
  addBand(hull, cabinTop.map(([x, , z]) => [x * 0.87, 0.70, z * 0.87]), domeA);
  addBand(hull, domeA, domeB);
  addBand(hull, domeB, domeC);

  const nozzle = part();
  const throat = ring(SEGMENTS, 0.13, 0.14);
  const exit = ring(SEGMENTS, 0.24, 0.02);
  addCap(nozzle, throat, 0.14, true);
  addBandInverted(nozzle, exit, throat);
  addCap(nozzle, exit, 0.02, false);

  const legs = part();
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const topX = dirX * 0.30, topZ = dirZ * 0.30;
    const footX = dirX * 0.62, footZ = dirZ * 0.62;
    // Strut approximated by four short yaw-oriented boxes stepping outward.
    const half = 0.035;
    for (let step = 0; step < 4; step += 1) {
      const t0 = step / 4, t1 = (step + 1) / 4;
      const ax = topX + (footX - topX) * t0;
      const az = topZ + (footZ - topZ) * t0;
      const bx = topX + (footX - topX) * t1;
      const bz = topZ + (footZ - topZ) * t1;
      const ay0 = 0.40 - t0 * 0.36;
      const ay1 = 0.40 - t1 * 0.36;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (ay0 + ay1) / 2;
      const segLen = Math.hypot(bx - ax, ay1 - ay0, bz - az) / 2 + half;
      const yaw = Math.atan2(bz - az, bx - ax);
      addOrientedBox(legs, mx, my, mz, segLen, half, half, yaw);
    }
    // Foot pad: short prism with caps.
    const footBottom = [];
    const footTop = [];
    for (let k = 0; k < 8; k += 1) {
      const footAngle = (k / 8) * Math.PI * 2;
      footBottom.push([footX + Math.cos(footAngle) * 0.12, 0.02, footZ + Math.sin(footAngle) * 0.12]);
      footTop.push([footX + Math.cos(footAngle) * 0.12, 0.08, footZ + Math.sin(footAngle) * 0.12]);
    }
    addBand(legs, footBottom, footTop);
    addCap(legs, footTop, 0.08, true, footX, footZ);
    addCap(legs, footBottom, 0.02, false, footX, footZ);
  }

  const gear = part();
  // Antenna mast + dish on the dome; RCS pods on the cabin shoulders.
  addBox(gear, 0, 0.94, 0, 0.02, 0.08, 0.02);
  const dishRim = [];
  const dishBase = [];
  for (let k = 0; k < 8; k += 1) {
    const dishAngle = (k / 8) * Math.PI * 2;
    dishBase.push([Math.cos(dishAngle) * 0.062, 1.03, Math.sin(dishAngle) * 0.062]);
    dishRim.push([Math.cos(dishAngle) * 0.115, 1.06, Math.sin(dishAngle) * 0.115]);
  }
  addBand(gear, dishBase, dishRim);
  addCap(gear, dishRim, 1.06, false);
  addCap(gear, dishBase, 1.03, true);
  for (let i = 0; i < 4; i += 1) {
    const podAngle = (i / 4) * Math.PI * 2;
    addBox(gear, Math.cos(podAngle) * 0.31, 0.55, Math.sin(podAngle) * 0.31, 0.045, 0.045, 0.045);
  }

  return [
    { name: "hull", part: hull, color: [0.62, 0.72, 0.66, 1], roughness: 0.55 },
    { name: "nozzle", part: nozzle, color: [0.22, 0.25, 0.28, 1], roughness: 0.7 },
    { name: "legs", part: legs, color: [0.24, 0.27, 0.30, 1], roughness: 0.65 },
    { name: "gear", part: gear, color: [0.36, 0.92, 0.82, 1], roughness: 0.4 }
  ];
}

// ---- pad beacon -------------------------------------------------------------
function buildBeacon() {
  const base = part();
  const baseBottom = ring(6, 0.30, 0.0);
  const baseTop = ring(6, 0.24, 0.10);
  addCap(base, baseBottom, 0.0, false);
  addBand(base, baseBottom, baseTop);
  addCap(base, baseTop, 0.10, true);

  const pylon = part();
  const pyBottom = ring(6, 0.075, 0.10);
  const pyTop = ring(6, 0.06, 0.86);
  addBand(pylon, pyBottom, pyTop);
  addCap(pylon, pyTop, 0.86, true);

  const lamp = part();
  const lampBase = ring(6, 0.062, 0.88);
  const lampRing = ring(6, 0.115, 0.98);
  addBand(lamp, lampBase, lampRing);
  addCap(lamp, lampRing, 0.98, true);
  addCap(lamp, lampBase, 0.88, false);

  return [
    { name: "base", part: base, color: [0.20, 0.23, 0.26, 1], roughness: 0.8 },
    { name: "pylon", part: pylon, color: [0.58, 0.63, 0.68, 1], roughness: 0.45 },
    { name: "lamp", part: lamp, color: [0.35, 0.95, 0.85, 1], roughness: 0.3 }
  ];
}

// ---- GLB writer -------------------------------------------------------------
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
      metallicFactor: 0.05,
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
    asset: { version: "2.0", generator: "aura3d showcase-aurora-lander build-models (original CC0)" },
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

const landerParts = buildLander();
const landerBytes = writeGlb(resolve(OUT_DIR, "auroraLanderProbe.glb"), landerParts);
console.log("wrote", resolve(OUT_DIR, "auroraLanderProbe.glb"), "(" + landerBytes + " bytes)");

const beaconParts = buildBeacon();
const beaconBytes = writeGlb(resolve(OUT_DIR, "auroraPadBeacon.glb"), beaconParts);
console.log("wrote", resolve(OUT_DIR, "auroraPadBeacon.glb"), "(" + beaconBytes + " bytes)");
