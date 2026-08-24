/**
 * Bank Shot model synth — generates original CC0 GLB props entirely in-repo.
 *
 * Eighteen authored low-poly props for the billiards hall, flat-shaded and
 * indexed, written as minimal glTF 2.0 GLB containers with no dependencies:
 *   - bankShotTable.glb       : billiards table (felt slab top at y = 0, wooden
 *                               rails, four legs) centered on the origin
 *   - bankShotCue.glb         : tapered cue stick, tip at origin, local +X = tip
 *                               direction, two-tone wood
 *   - bankShotBall00.glb      : unit-normalized white cue ball (radius 0.5, 16x12 UV sphere)
 *   - bankShotBall01..15.glb  : solids 1-7 (yellow/blue/red/purple/orange/green/
 *                               maroon), the black 8, stripes 9-15 (same hues
 *                               with a white equatorial band ~40% of the diameter
 *                               so the stripe reads from the GLB materials — no
 *                               route-side tinting anywhere)
 *
 * The table and cue are authored in metres. Balls are unit-normalized so each
 * release asset remains independently inspectable; the route applies the
 * regulation 0.07 m diameter while synchronizing its public Rapier body.
 *
 * Run from the repo root:  node apps/showcase-bank-shot/scripts/build-models.mjs
 * Output: apps/showcase-bank-shot/assets/models/*.glb
 *
 * After generation register each model with the CLI so it lands in the typed root
 * asset map the route imports (`../../../src/aura-assets`). This script documents
 * the commands but does NOT run them; ids are bankShotBall00..bankShotBall15,
 * bankShotTable, and bankShotCue, e.g.:
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add apps/showcase-bank-shot/assets/models/bankShotTable.glb --name bankShotTable --type model --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-bank-shot/scripts/build-models.mjs"
 *   pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts assets add apps/showcase-bank-shot/assets/models/bankShotCue.glb --name bankShotCue --type model --license CC0-1.0 --author "Aura3D synthesis" --source-page "apps/showcase-bank-shot/scripts/build-models.mjs"
 *   ... and one assets add per ball file bankShotBall00.glb .. bankShotBall15.glb
 *       with --name bankShotBall00 .. bankShotBall15.
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

/** Ring of points around the X axis at x with radius r (cue stick shaft). */
function ringX(n, r, x) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    pts.push([x, Math.cos(angle) * r, Math.sin(angle) * r]);
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

/** Cap a ring around the Y axis with an n-gon fan around an offset center. */
function addCap(p, pts, y, up, cx = 0, cz = 0) {
  const center = [cx, y, cz];
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    if (up) addTriangle(p, center, pts[i], pts[j]);
    else addTriangle(p, center, pts[j], pts[i]);
  }
}

/** Cap a ring around the X axis with an n-gon fan facing +X (tip) or -X (butt). */
function addXCap(p, pts, x, plusX, cx = 0) {
  const center = [cx, 0, 0];
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    if (plusX) addTriangle(p, center, pts[i], pts[j]);
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

/** Horizontal, upward-facing disc for a pocket mouth or ball identity patch. */
function addDisc(p, cx, cy, cz, radius, segments = 20) {
  const center = [cx, cy, cz];
  const edge = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    edge.push([cx + Math.cos(angle) * radius, cy, cz + Math.sin(angle) * radius]);
  }
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    // Reversed x/z winding produces a +Y normal.
    addTriangle(p, center, edge[next], edge[index]);
  }
}

/** Upward-facing top quad used by the seven-segment ball-number marks. */
function addTopQuad(p, x0, z0, x1, z1, y) {
  addQuad(p, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]);
}

// ---- billiards table --------------------------------------------------------
/**
 * Origin is the felt center on the felt surface (y = 0), +X is the long axis
 * (the rack apex end is +X in world space once posed), +Z toward the player.
 * The felt slab is 2.9 x 0.12 x 1.7 with its TOP face exactly at y = 0.
 */
function buildTable() {
  const felt = part();
  // Felt slab: top face at y = 0.
  addBox(felt, 0, -0.06, 0, 1.45, 0.06, 0.85);

  const rails = part();
  // Wooden rails ~0.12 tall above the felt, bordering the 2.6 x 1.4 playfield.
  addBox(rails, 0, 0.06, -0.85, 1.63, 0.06, 0.13); // far long rail
  addBox(rails, 0, 0.06, 0.85, 1.63, 0.06, 0.13); // near long rail
  addBox(rails, -1.45, 0.06, 0, 0.13, 0.06, 0.72); // left short rail
  addBox(rails, 1.45, 0.06, 0, 0.13, 0.06, 0.72); // right short rail

  const legs = part();
  // Four square legs dropping from the slab to the floor at y = -0.78.
  addBox(legs, -1.25, -0.45, -0.65, 0.08, 0.33, 0.08);
  addBox(legs, 1.25, -0.45, -0.65, 0.08, 0.33, 0.08);
  addBox(legs, -1.25, -0.45, 0.65, 0.08, 0.33, 0.08);
  addBox(legs, 1.25, -0.45, 0.65, 0.08, 0.33, 0.08);

  // Six zero-thickness dark mouth planes live in the typed table asset. They
  // remain clean circles at a grazing camera angle and cannot cast the detached
  // crescent shadows produced by route-side flattened volume primitives.
  const pockets = part();
  for (const [x, z, radius] of [
    [-1.3, -0.7, 0.115], [1.3, -0.7, 0.115],
    [-1.3, 0.7, 0.115], [1.3, 0.7, 0.115],
    [0, -0.7, 0.095], [0, 0.7, 0.095]
  ]) addDisc(pockets, x, 0.004, z, radius, 24);

  return [
    { name: "felt", part: felt, color: [0.07, 0.34, 0.16, 1], roughness: 0.9 },
    { name: "rails", part: rails, color: [0.21, 0.11, 0.05, 1], roughness: 0.45 },
    { name: "legs", part: legs, color: [0.15, 0.08, 0.04, 1], roughness: 0.6 },
    { name: "pocket-mouths", part: pockets, color: [0.008, 0.01, 0.014, 1], roughness: 0.96, metallic: 0 }
  ];
}

// ---- cue stick --------------------------------------------------------------
/**
 * Tapered cue, tip at the origin, local +X = tip direction, butt at x = -1.45.
 * Light maple shaft with a dark wrap butt and a small leather tip cap.
 */
function buildCue() {
  const shaft = part();
  const tip = part();
  const butt = part();
  const segments = 10;
  // Leather tip: x = -0.012 .. 0, radius ~0.006.
  addBand(tip, ringX(segments, 0.006, -0.012), ringX(segments, 0.0045, 0));
  addXCap(tip, ringX(segments, 0.006, -0.012), -0.012, false, -0.012);
  addXCap(tip, ringX(segments, 0.0045, 0), 0, true, 0);
  // Maple shaft: x = -0.62 .. -0.012, radius 0.0065 -> 0.0085.
  const shaftRings = [-0.012, -0.22, -0.42, -0.62].map((x, i, xs) => {
    const t = i / (xs.length - 1);
    return ringX(segments, 0.0065 + t * 0.002, x);
  });
  for (let i = 0; i < shaftRings.length - 1; i += 1) addBand(shaft, shaftRings[i], shaftRings[i + 1]);
  // Dark butt: x = -1.45 .. -0.62, radius 0.0085 -> 0.0145.
  const buttRings = [-0.62, -0.9, -1.2, -1.45].map((x, i, xs) => {
    const t = i / (xs.length - 1);
    return ringX(segments, 0.0085 + t * 0.006, x);
  });
  for (let i = 0; i < buttRings.length - 1; i += 1) addBand(butt, buttRings[i], buttRings[i + 1]);
  addXCap(butt, buttRings[buttRings.length - 1], -1.45, false, -1.45);

  return [
    { name: "tip", part: tip, color: [0.35, 0.25, 0.2, 1], roughness: 0.8 },
    { name: "shaft", part: shaft, color: [0.87, 0.72, 0.45, 1], roughness: 0.4 },
    { name: "butt", part: butt, color: [0.24, 0.12, 0.06, 1], roughness: 0.5 }
  ];
}

// ---- ball set ---------------------------------------------------------------
const BALL_RADIUS = 0.5;
const BALL_GEOMETRY_SCALE = BALL_RADIUS / 0.035;
const LONGITUDE_SEGMENTS = 16;
const LATITUDE_BANDS = 12;

/** Classic 8-ball hues: balls 1-7 solids, 8 black, 9-15 stripes of the same hues. */
const BALL_HUES = {
  1: [0.99, 0.82, 0.09],
  2: [0.10, 0.28, 0.75],
  3: [0.85, 0.12, 0.10],
  4: [0.45, 0.12, 0.55],
  5: [0.95, 0.45, 0.05],
  6: [0.05, 0.55, 0.20],
  7: [0.55, 0.10, 0.15]
};
const BALL_WHITE = [0.93, 0.93, 0.9, 1];
const BALL_BLACK = [0.05, 0.05, 0.06, 1];
const BALL_SHININESS = { roughness: 0.18, metallic: 0.05 };

/** Latitude rings (around Y) for a full sphere split into LATITUDE_BANDS bands. */
function fullSphereRings() {
  const rings = [];
  for (let i = 1; i < LATITUDE_BANDS; i += 1) {
    const phi = (-0.5 + i / LATITUDE_BANDS) * Math.PI;
    rings.push(ring(LONGITUDE_SEGMENTS, Math.cos(phi) * BALL_RADIUS, Math.sin(phi) * BALL_RADIUS));
  }
  return rings;
}

/** White equatorial band ~40% of the diameter: |y| <= 0.2 * radius. */
const BAND_LIMIT = Math.asin(0.2);

/** Colored cap rings from `fromRad` to the `pole` (+/- PI/2), inclusive edges. */
function capRings(fromRad, pole) {
  const rings = [];
  const steps = 5;
  for (let i = 0; i <= steps; i += 1) {
    const phi = fromRad + (pole - fromRad) * (i / steps);
    rings.push(ring(LONGITUDE_SEGMENTS, Math.cos(phi) * BALL_RADIUS, Math.sin(phi) * BALL_RADIUS));
  }
  return rings;
}

/** Solid-color ball: one part, one colored material. */
function buildSolidBall(color) {
  const sphere = part();
  const rings = fullSphereRings();
  for (let i = 0; i < rings.length - 1; i += 1) addBand(sphere, rings[i], rings[i + 1]);
  addCap(sphere, rings[0], -BALL_RADIUS, false);
  addCap(sphere, rings[rings.length - 1], BALL_RADIUS, true);
  return [
    { name: "ball", part: sphere, color: [...color, 1], ...BALL_SHININESS }
  ];
}

/** Stripe ball: colored top+bottom caps and a white equatorial band as separate
 *  parts, each carrying its own GLB material so the stripe reads with zero
 *  route-side tinting. */
function buildStripeBall(color) {
  const caps = part();
  const band = part();
  // Colored caps: -90deg..-band and +band..+90deg.
  const lowerCap = capRings(-Math.PI / 2, -BAND_LIMIT);
  for (let i = 0; i < lowerCap.length - 1; i += 1) addBand(caps, lowerCap[i], lowerCap[i + 1]);
  addCap(caps, lowerCap[0], -BALL_RADIUS, false);
  const upperCap = capRings(BAND_LIMIT, Math.PI / 2);
  for (let i = 0; i < upperCap.length - 1; i += 1) addBand(caps, upperCap[i], upperCap[i + 1]);
  addCap(caps, upperCap[upperCap.length - 1], BALL_RADIUS, true);
  // White band: three rings at -band, 0, +band.
  const bandRings = [
    ring(LONGITUDE_SEGMENTS, Math.cos(-BAND_LIMIT) * BALL_RADIUS, Math.sin(-BAND_LIMIT) * BALL_RADIUS),
    ring(LONGITUDE_SEGMENTS, BALL_RADIUS, 0),
    ring(LONGITUDE_SEGMENTS, Math.cos(BAND_LIMIT) * BALL_RADIUS, Math.sin(BAND_LIMIT) * BALL_RADIUS)
  ];
  for (let i = 0; i < bandRings.length - 1; i += 1) addBand(band, bandRings[i], bandRings[i + 1]);
  return [
    { name: "caps", part: caps, color: [...color, 1], ...BALL_SHININESS },
    { name: "band", part: band, color: BALL_WHITE, ...BALL_SHININESS }
  ];
}

const DIGIT_SEGMENTS = {
  0: ["a", "b", "c", "d", "e", "f"],
  1: ["b", "c"],
  2: ["a", "b", "g", "e", "d"],
  3: ["a", "b", "c", "d", "g"],
  4: ["f", "g", "b", "c"],
  5: ["a", "f", "g", "c", "d"],
  6: ["a", "f", "g", "e", "c", "d"],
  7: ["a", "b", "c"],
  8: ["a", "b", "c", "d", "e", "f", "g"],
  9: ["a", "b", "c", "d", "f", "g"]
};

function addDigit(mark, digit, cx, y, scale = 1) {
  const halfW = 0.0032 * BALL_GEOMETRY_SCALE * scale;
  const halfH = 0.0052 * BALL_GEOMETRY_SCALE * scale;
  const thickness = 0.00105 * BALL_GEOMETRY_SCALE * scale;
  const horizontal = (z) => addTopQuad(mark, cx - halfW, z - thickness / 2, cx + halfW, z + thickness / 2, y);
  const vertical = (x, z) => addTopQuad(mark, x - thickness / 2, z - 0.00235 * BALL_GEOMETRY_SCALE * scale, x + thickness / 2, z + 0.00235 * BALL_GEOMETRY_SCALE * scale, y);
  for (const segment of DIGIT_SEGMENTS[digit]) {
    if (segment === "a") horizontal(-halfH);
    else if (segment === "g") horizontal(0);
    else if (segment === "d") horizontal(halfH);
    else if (segment === "f") vertical(cx - halfW, -halfH / 2);
    else if (segment === "b") vertical(cx + halfW, -halfH / 2);
    else if (segment === "e") vertical(cx - halfW, halfH / 2);
    else if (segment === "c") vertical(cx + halfW, halfH / 2);
  }
}

/** Add a high-contrast renderer-owned top patch and number, never DOM text. */
function addBallIdentity(parts, number) {
  if (number === 0) return parts;
  const patch = part();
  const mark = part();
  addDisc(patch, 0, BALL_RADIUS + 0.00035 * BALL_GEOMETRY_SCALE, 0, 0.0155 * BALL_GEOMETRY_SCALE, 24);
  const digits = String(number).split("").map(Number);
  if (digits.length === 1) addDigit(mark, digits[0], 0, BALL_RADIUS + 0.0007 * BALL_GEOMETRY_SCALE, 1);
  else {
    addDigit(mark, digits[0], -0.0045 * BALL_GEOMETRY_SCALE, BALL_RADIUS + 0.0007 * BALL_GEOMETRY_SCALE, 0.72);
    addDigit(mark, digits[1], 0.0045 * BALL_GEOMETRY_SCALE, BALL_RADIUS + 0.0007 * BALL_GEOMETRY_SCALE, 0.72);
  }
  return [
    ...parts,
    { name: "identity-patch", part: patch, color: BALL_WHITE, ...BALL_SHININESS },
    { name: `number-${number}`, part: mark, color: BALL_BLACK, roughness: 0.45, metallic: 0 }
  ];
}

// ---- GLB writer -------------------------------------------------------------
function writeGlb(path, parts, orientation = { forwardAxis: "+X", upAxis: "+Y" }) {
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
    asset: {
      version: "2.0",
      generator: "aura3d showcase-bank-shot build-models (original CC0)",
      extras: { aura3d: { orientation } }
    },
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

const tableParts = buildTable();
const tableBytes = writeGlb(resolve(OUT_DIR, "bankShotTable.glb"), tableParts);
console.log("wrote", resolve(OUT_DIR, "bankShotTable.glb"), "(" + tableBytes + " bytes)");

const cueParts = buildCue();
const cueBytes = writeGlb(resolve(OUT_DIR, "bankShotCue.glb"), cueParts);
console.log("wrote", resolve(OUT_DIR, "bankShotCue.glb"), "(" + cueBytes + " bytes)");

for (let number = 0; number <= 15; number += 1) {
  const id = "bankShotBall" + String(number).padStart(2, "0");
  let parts;
  if (number === 0) parts = buildSolidBall(BALL_WHITE.slice(0, 3));
  else if (number === 8) parts = buildSolidBall(BALL_BLACK.slice(0, 3));
  else if (number <= 7) parts = buildSolidBall(BALL_HUES[number]);
  else parts = buildStripeBall(BALL_HUES[number - 8]);
  parts = addBallIdentity(parts, number);
  const bytes = writeGlb(resolve(OUT_DIR, id + ".glb"), parts, { forwardAxis: "+Z", upAxis: "+Y" });
  console.log("wrote", resolve(OUT_DIR, id + ".glb"), "(" + bytes + " bytes)");
}

// Verify every emitted file starts with the glTF magic before registration.
import { readFileSync } from "node:fs";
for (const file of ["bankShotTable.glb", "bankShotCue.glb",
  ...Array.from({ length: 16 }, (_, i) => "bankShotBall" + String(i).padStart(2, "0") + ".glb")]) {
  const magic = readFileSync(resolve(OUT_DIR, file)).subarray(0, 4).toString("ascii");
  if (magic !== "glTF") throw new Error(file + " is missing the glTF magic bytes.");
}
console.log("verified glTF magic bytes for all 18 models in", OUT_DIR);
