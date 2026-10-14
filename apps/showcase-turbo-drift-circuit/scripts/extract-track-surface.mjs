// Extracts the drivable surface of the shipped track GLB into
// src/track-surface.ts: a world-space height grid raycast from the real
// triangles (full node hierarchy, baked with the exact placement
// src/main.ts gives the track model node), plus the measured car-model
// size/min-Y the chassis spec derives from. Re-run after any asset or
// placement change:  node scripts/extract-track-surface.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
// Keep in sync with src/main.ts (ROUTE_BOUNDS / TRACK_Y): the grid is baked
// in rendered world space, so a placement change without re-extraction
// would ground the car on a surface that is no longer where the mesh is.
const TRACK_PLACEMENT = { x: 9.0125, y: -1.0, z: 5.25 };
const GRID = 192;
const PAD = 1.0;

function parseGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  let off = 12;
  let json;
  let bin;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  return { json, bin };
}

const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const COMP = { 5120: [1, (b, o) => b.readInt8(o)], 5121: [1, (b, o) => b.readUInt8(o)], 5122: [2, (b, o) => b.readInt16LE(o)], 5123: [2, (b, o) => b.readUInt16LE(o)], 5125: [4, (b, o) => b.readUInt32LE(o)], 5126: [4, (b, o) => b.readFloatLE(o)] };

function readAccessor(glb, index) {
  const acc = glb.json.accessors[index];
  const view = glb.json.bufferViews[acc.bufferView];
  const [compSize, read] = COMP[acc.componentType];
  const n = TYPE_SIZE[acc.type];
  const stride = view.byteStride ?? compSize * n;
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out = new Float64Array(acc.count * n);
  for (let i = 0; i < acc.count; i += 1) {
    for (let c = 0; c < n; c += 1) out[i * n + c] = read(glb.bin, base + i * stride + c * compSize);
  }
  return out;
}

function matMul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    let s = 0;
    for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1
  ];
}

/** World-space triangles ([x,y,z] x 3 per tri) + bounds for a GLB. */
function worldTriangles(glb) {
  const tris = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visit = (nodeIndex, parent) => {
    const node = glb.json.nodes[nodeIndex];
    const world = matMul(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of glb.json.meshes[node.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) continue;
        const pos = readAccessor(glb, prim.attributes.POSITION);
        const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices) : null;
        const count = idx ? idx.length : pos.length / 3;
        const vert = (i) => {
          const vi = idx ? idx[i] : i;
          const px = pos[vi * 3], py = pos[vi * 3 + 1], pz = pos[vi * 3 + 2];
          return [
            world[0] * px + world[4] * py + world[8] * pz + world[12],
            world[1] * px + world[5] * py + world[9] * pz + world[13],
            world[2] * px + world[6] * py + world[10] * pz + world[14]
          ];
        };
        for (let i = 0; i + 2 < count; i += 3) {
          const tri = [vert(i), vert(i + 1), vert(i + 2)];
          tris.push(tri);
          for (const v of tri) for (let a = 0; a < 3; a += 1) {
            if (v[a] < min[a]) min[a] = v[a];
            if (v[a] > max[a]) max[a] = v[a];
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const root of glb.json.scenes[glb.json.scene ?? 0].nodes) visit(root, identity);
  return { tris, min, max };
}

/** Barycentric height of triangle at (x,z), or null when outside. */
function triHeightAt(tri, x, z) {
  const [a, b, c] = tri;
  const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(d) < 1e-12) return null;
  const w0 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
  const w1 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
  const w2 = 1 - w0 - w1;
  if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) return null;
  return w0 * a[1] + w1 * b[1] + w2 * c[1];
}

const trackGlb = parseGlb(join(appDir, "public/aura-assets/showcaseReadableKartCircuit.5cbb912e.glb"));
const carGlb = parseGlb(join(appDir, "public/aura-assets/showcaseCleanSportsCar.1c69283f.glb"));
const track = worldTriangles(trackGlb);
const car = worldTriangles(carGlb);

// Bake the track node placement (translation only, scale 1 in main.ts).
for (const tri of track.tris) for (const v of tri) {
  v[0] += TRACK_PLACEMENT.x; v[1] += TRACK_PLACEMENT.y; v[2] += TRACK_PLACEMENT.z;
}
for (let a = 0; a < 3; a += 1) {
  track.min[a] += [TRACK_PLACEMENT.x, TRACK_PLACEMENT.y, TRACK_PLACEMENT.z][a];
  track.max[a] += [TRACK_PLACEMENT.x, TRACK_PLACEMENT.y, TRACK_PLACEMENT.z][a];
}

const minX = track.min[0] - PAD, maxX = track.max[0] + PAD;
const minZ = track.min[2] - PAD, maxZ = track.max[2] + PAD;
const cellX = (maxX - minX) / GRID, cellZ = (maxZ - minZ) / GRID;

// Bucket triangles by grid cell so each downward ray tests only its cell.
const buckets = new Map();
track.tris.forEach((tri, ti) => {
  const xs = tri.map((v) => v[0]), zs = tri.map((v) => v[2]);
  const gx0 = Math.max(0, Math.floor((Math.min(...xs) - minX) / cellX));
  const gx1 = Math.min(GRID - 1, Math.floor((Math.max(...xs) - minX) / cellX));
  const gz0 = Math.max(0, Math.floor((Math.min(...zs) - minZ) / cellZ));
  const gz1 = Math.min(GRID - 1, Math.floor((Math.max(...zs) - minZ) / cellZ));
  for (let gz = gz0; gz <= gz1; gz += 1) for (let gx = gx0; gx <= gx1; gx += 1) {
    const key = gz * GRID + gx;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(ti);
  }
});

// Drivable height at a point: the highest triangle hit within 1.5 m of the
// lowest hit, so a start banner or gantry over the road cannot become the
// surface the wheels sit on.
function drivableHeightAt(x, z) {
  const gx = Math.min(GRID - 1, Math.max(0, Math.floor((x - minX) / cellX)));
  const gz = Math.min(GRID - 1, Math.max(0, Math.floor((z - minZ) / cellZ)));
  const hits = [];
  for (const ti of buckets.get(gz * GRID + gx) ?? []) {
    const h = triHeightAt(track.tris[ti], x, z);
    if (h !== null) hits.push(h);
  }
  if (hits.length === 0) return null;
  const low = Math.min(...hits);
  return Math.max(...hits.filter((h) => h <= low + 1.5));
}

const MISS = -32768;
const heights = new Int16Array(GRID * GRID);
let hitCells = 0;
for (let gz = 0; gz < GRID; gz += 1) for (let gx = 0; gx < GRID; gx += 1) {
  const h = drivableHeightAt(minX + (gx + 0.5) * cellX, minZ + (gz + 0.5) * cellZ);
  if (h === null) heights[gz * GRID + gx] = MISS;
  else { heights[gz * GRID + gx] = Math.round(h * 1000); hitCells += 1; }
}
const b64 = Buffer.from(heights.buffer).toString("base64");
const carSize = [0, 1, 2].map((a) => car.max[a] - car.min[a]);
const fmt = (n) => Number(n.toFixed(6));

const out = `// GENERATED by scripts/extract-track-surface.mjs from the shipped track
// and car GLBs — do not edit by hand. The grid is the real kart-circuit
// mesh (full node hierarchy, ${track.tris.length} triangles) baked with the
// placement src/main.ts gives the track model node, sampled by downward
// rays on a ${GRID}x${GRID} grid (${hitCells} hit cells). Heights are Int16
// millimetres, ${MISS} = no triangle under the cell. At runtime the grid
// rebuilds a triangle surface and every ground sample is a BVH raycast
// against it (createMeshSurfaceQuery) — the same GLB renders and grounds.
import { createMeshSurfaceQuery, type MeshSurfaceQuery } from "@aura3d/engine";

export const TRACK_GRID = {
  size: ${GRID},
  minX: ${fmt(minX)},
  maxX: ${fmt(maxX)},
  minZ: ${fmt(minZ)},
  maxZ: ${fmt(maxZ)},
  miss: ${MISS},
  heightsB64:
    "${b64}"
} as const;

/** Measured car GLB extents (m) and lowest point relative to its origin. */
export const CAR_MODEL_SIZE: readonly [number, number, number] = [${carSize.map(fmt).join(", ")}];
export const CAR_MODEL_MIN_Y = ${fmt(car.min[1])};

function decodeHeights(): Int16Array {
  const binary = atob(TRACK_GRID.heightsB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** Triangle surface rebuilt from the extracted grid (hit cells only). */
function gridGeometry(): { positions: Float32Array; indices: Uint32Array } {
  const { size, minX, maxX, minZ, maxZ, miss } = TRACK_GRID;
  const heights = decodeHeights();
  const positions = new Float32Array(size * size * 3);
  for (let gz = 0; gz < size; gz += 1) {
    for (let gx = 0; gx < size; gx += 1) {
      const i = gz * size + gx;
      const raw = heights[i]!;
      positions[i * 3] = minX + ((gx + 0.5) / size) * (maxX - minX);
      positions[i * 3 + 1] = raw === miss ? 0 : raw / 1000;
      positions[i * 3 + 2] = minZ + ((gz + 0.5) / size) * (maxZ - minZ);
    }
  }
  const indices: number[] = [];
  const hit = (gx: number, gz: number) => heights[gz * size + gx] !== miss;
  for (let gz = 0; gz < size - 1; gz += 1) {
    for (let gx = 0; gx < size - 1; gx += 1) {
      if (!(hit(gx, gz) && hit(gx + 1, gz) && hit(gx, gz + 1) && hit(gx + 1, gz + 1))) continue;
      const a = gz * size + gx;
      const b = a + 1;
      const c = a + size;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, indices: new Uint32Array(indices) };
}

/** The one mesh surface query every vehicle Y in this route derives from. */
export const trackMeshQuery: MeshSurfaceQuery = createMeshSurfaceQuery(gridGeometry());

export interface TrackSample {
  readonly height: number;
  readonly hit: boolean;
}

/** Ground sample at a world point: a downward raycast over the track mesh. */
export function sampleTrackAt(x: number, z: number): TrackSample {
  const s = trackMeshQuery.sample(x, z);
  return { height: s.height, hit: s.hit };
}
`;
writeFileSync(join(appDir, "src/track-surface.ts"), out);
console.log(`track tris=${track.tris.length} grid hitCells=${hitCells}/${GRID * GRID} carSize=${carSize.map((v) => v.toFixed(3))} carMinY=${car.min[1].toFixed(3)} trackYRange=[${track.min[1].toFixed(3)}, ${track.max[1].toFixed(3)}]`);
