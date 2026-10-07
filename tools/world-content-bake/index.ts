/**
 * PRD-10 §6.6 / T5.7 — `tools/world-content-bake`: deterministic content bake
 * for the shipped world assets that can be produced procedurally in-repo.
 *
 * Bakes (all deterministic — mulberry32 seeds + closed-form noise, no fs time):
 *   - kit GLBs        packages/engine/assets/world/kits/<kit>/<piece>.glb
 *   - water normals   assets/world/water/water-normal-{0,1}-512.rgba
 *   - foam            assets/world/water/water-foam-512.rgba
 *   - caustics atlas  assets/world/water/water-caustics-4x4-1024.rgba (16×256²)
 *   - noise           assets/world/noise/macro-variation-512.rgba
 *                     assets/world/noise/blue-noise-64.rgba
 *
 * Determinism gate: `bakeAll` returns every output's sha256 — the manifest
 * entries record those hashes and the contracts test recomputes them from the
 * files on disk (drift = tampered or non-deterministic bake).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------- utilities ---

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const sha256 = (data: Uint8Array): string => `sha256:${createHash("sha256").update(data).digest("hex")}`;

/** Value-noise lattice (hash-based, deterministic). */
const lattice = (x: number, y: number, seed: number): number => {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h ^= h >>> 16;
  return (h & 0xffff) / 65535;
};
const smooth = (t: number): number => t * t * (3 - 2 * t);
const valueNoise = (x: number, y: number, seed: number): number => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = lattice(xi, yi, seed), b = lattice(xi + 1, yi, seed);
  const c = lattice(xi, yi + 1, seed), d = lattice(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x: number, y: number, seed: number, octaves: number): number => {
  let sum = 0, amp = 0.5, freq = 1;
  for (let o = 0; o < octaves; o += 1) {
    sum += valueNoise(x * freq, y * freq, seed + o * 131) * amp;
    amp *= 0.5; freq *= 2;
  }
  return sum;
};
/** Periodic value noise on a tiles×tiles wrap lattice (seamless textures). */
const tileNoise = (u: number, v: number, cells: number, seed: number, octaves: number): number => {
  let sum = 0, amp = 0.5, freq = 1;
  for (let o = 0; o < octaves; o += 1) {
    const n = cells * freq;
    const x = u * n, y = v * n;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const at = (ax: number, ay: number) => lattice(((ax % n) + n) % n, ((ay % n) + n) % n, seed + o * 733);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    sum += (a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf) * amp;
    amp *= 0.5; freq *= 2;
  }
  return sum;
};

// ---------------------------------------------------------------- GLB ------

interface MeshData {
  positions: number[];
  normals: number[];
  indices: number[];
}

const meshBox = (w: number, h: number, d: number, cx = 0, cy = 0, cz = 0): MeshData => {
  const x = w / 2, y = h, z = d / 2; // sits on y=0
  const p: number[] = [], n: number[] = [], idx: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d2: number[], normal: number[]) => {
    const base = p.length / 3;
    p.push(
      a[0] + cx, a[1] + cy, a[2] + cz, b[0] + cx, b[1] + cy, b[2] + cz,
      c[0] + cx, c[1] + cy, c[2] + cz, d2[0] + cx, d2[1] + cy, d2[2] + cz
    );
    for (let i = 0; i < 4; i += 1) n.push(...normal);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  quad([-x, 0, z], [x, 0, z], [x, y, z], [-x, y, z], [0, 0, 1]);              // +z
  quad([x, 0, -z], [-x, 0, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]);         // -z
  quad([x, 0, z], [x, 0, -z], [x, y, -z], [x, y, z], [1, 0, 0]);              // +x
  quad([-x, 0, -z], [-x, 0, z], [-x, y, z], [-x, y, -z], [-1, 0, 0]);         // -x
  quad([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, 1, 0]);            // top
  quad([-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [0, -1, 0]);           // bottom
  return { positions: p, normals: n, indices: idx };
};

const meshCylinder = (r0: number, r1: number, h: number, segs: number, cx = 0, cy = 0, cz = 0): MeshData => {
  const p: number[] = [], n: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    p.push(nx * r0 + cx, cy, nz * r0 + cz);
    p.push(nx * r1 + cx, cy + h, nz * r1 + cz);
    n.push(nx, 0, nz, nx, 0, nz);
  }
  for (let i = 0; i < segs; i += 1) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  // caps
  const cap = (r: number, y: number, ny: number) => {
    const base = p.length / 3;
    p.push(cx, cy + y, cz);
    n.push(0, ny, 0);
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      p.push(Math.cos(a) * r + cx, cy + y, Math.sin(a) * r + cz);
      n.push(0, ny, 0);
    }
    for (let i = 0; i < segs; i += 1) {
      if (ny > 0) idx.push(base, base + i + 1, base + i + 2);
      else idx.push(base, base + i + 2, base + i + 1);
    }
  };
  cap(r1, h, 1);
  cap(r0, 0, -1);
  return { positions: p, normals: n, indices: idx };
};

const mergeMeshes = (meshes: readonly MeshData[]): MeshData => {
  const out: MeshData = { positions: [], normals: [], indices: [] };
  for (const m of meshes) {
    const base = out.positions.length / 3;
    out.positions.push(...m.positions);
    out.normals.push(...m.normals);
    out.indices.push(...m.indices.map((i) => i + base));
  }
  return out;
};

/** Pack a mesh into a minimal deterministic GLB (one mesh, one material). */
export function bakeGlb(mesh: MeshData, baseColor: readonly [number, number, number, number], label: string): Buffer {
  const posBytes = new Float32Array(mesh.positions);
  const normBytes = new Float32Array(mesh.normals);
  const idxBytes = mesh.positions.length / 3 > 65535 ? new Uint32Array(mesh.indices) : new Uint16Array(mesh.indices);
  const idxComponent = idxBytes instanceof Uint32Array ? 5125 : 5123;
  const align4 = (n: number) => (n + 3) & ~3;
  const posViewLen = align4(posBytes.byteLength);
  const normViewLen = align4(normBytes.byteLength);
  const idxViewLen = align4(idxBytes.byteLength);
  const bin = Buffer.alloc(posViewLen + normViewLen + idxViewLen);
  Buffer.from(posBytes.buffer, posBytes.byteOffset, posBytes.byteLength).copy(bin, 0);
  Buffer.from(normBytes.buffer, normBytes.byteOffset, normBytes.byteLength).copy(bin, posViewLen);
  Buffer.from(idxBytes.buffer, idxBytes.byteOffset, idxBytes.byteLength).copy(bin, posViewLen + normViewLen);
  const xs = mesh.positions.filter((_, i) => i % 3 === 0);
  const ys = mesh.positions.filter((_, i) => i % 3 === 1);
  const zs = mesh.positions.filter((_, i) => i % 3 === 2);
  const json = JSON.stringify({
    asset: { version: "2.0", generator: `aura3d-world-content-bake ${label}` },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: label }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: `${label}-mat`, pbrMetallicRoughness: { baseColorFactor: baseColor, metallicFactor: 0, roughnessFactor: 0.85 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: xs.length, type: "VEC3", min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)] },
      { bufferView: 1, componentType: 5126, count: xs.length, type: "VEC3" },
      { bufferView: 2, componentType: idxComponent, count: mesh.indices.length, type: "SCALAR" }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.byteLength },
      { buffer: 0, byteOffset: posViewLen, byteLength: normBytes.byteLength },
      { buffer: 0, byteOffset: posViewLen + normViewLen, byteLength: idxBytes.byteLength }
    ],
    buffers: [{ byteLength: bin.length }]
  });
  const jsonBytes = Buffer.from(json, "utf8");
  const jsonPad = align4(jsonBytes.length) - jsonBytes.length;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
  const header = Buffer.alloc(12);
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // "BIN"
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, bin]);
}

// -------------------------------------------------- kit piece geometry -----

const kitPieceMesh = (pieceId: string): { mesh: MeshData; color: readonly [number, number, number, number] } => {
  switch (pieceId) {
    case "tower-8x8": return { mesh: mergeMeshes([meshBox(8, 24, 8), meshBox(7, 0.4, 7, 0, 24, 0)]), color: [0.62, 0.66, 0.7, 1] };
    case "wall-slab-4x3": return { mesh: meshBox(4, 3, 0.3), color: [0.55, 0.53, 0.5, 1] };
    case "street-lamp": return { mesh: mergeMeshes([meshCylinder(0.09, 0.06, 4.6, 8), meshBox(1.6, 0.12, 0.12, 0.6, 4.6, 0), meshBox(0.5, 0.14, 0.22, 1.3, 4.5, 0)]), color: [0.18, 0.19, 0.22, 1] };
    case "planter-2x1": return { mesh: mergeMeshes([meshBox(2, 0.6, 1), meshBox(1.7, 0.25, 0.7, 0, 0.6, 0)]), color: [0.4, 0.32, 0.25, 1] };
    case "roof-unit-2x2": return { mesh: mergeMeshes([meshBox(2, 1.5, 2), meshCylinder(0.5, 0.5, 0.3, 10, 0, 1.5, 0)]), color: [0.62, 0.63, 0.65, 1] };
    case "barrier-2x1": return { mesh: meshBox(2, 1, 0.5), color: [0.85, 0.55, 0.15, 1] };
    case "wall-seg-4x3": return { mesh: meshBox(4, 3, 0.2), color: [0.78, 0.75, 0.7, 1] };
    case "floor-tile-4x4": return { mesh: meshBox(4, 0.1, 4), color: [0.45, 0.4, 0.35, 1] };
    case "door-1x2": return { mesh: mergeMeshes([meshBox(0.9, 2.1, 0.08), meshBox(0.1, 0.3, 0.16, 0.32, 0.9, 0)]), color: [0.35, 0.28, 0.2, 1] };
    case "ceiling-lamp": return { mesh: mergeMeshes([meshCylinder(0.05, 0.05, 0.12, 8, 0, 0.15, 0), meshCylinder(0.28, 0.34, 0.14, 12, 0, 0, 0)]), color: [0.95, 0.92, 0.85, 1] };
    case "crate-1x1": return { mesh: meshBox(1, 1, 1), color: [0.5, 0.4, 0.28, 1] };
    case "table-2x1": return { mesh: mergeMeshes([meshBox(2, 0.08, 1, 0, 0.72, 0), meshBox(0.08, 0.72, 0.9, -0.9, 0, 0), meshBox(0.08, 0.72, 0.9, 0.9, 0, 0)]), color: [0.45, 0.36, 0.26, 1] };
    case "barrier-4x1": return { mesh: mergeMeshes([meshBox(4, 0.9, 0.4), meshBox(0.3, 0.5, 0.8, -1.8, 0, 0), meshBox(0.3, 0.5, 0.8, 1.8, 0, 0)]), color: [0.8, 0.8, 0.82, 1] };
    case "fence-seg-4x2": return { mesh: mergeMeshes([meshBox(4, 0.08, 0.05, 0, 1.9, 0), meshBox(4, 0.08, 0.05, 0, 0.9, 0), meshBox(0.08, 2, 0.08, -1.9, 0, 0), meshBox(0.08, 2, 0.08, 1.9, 0, 0)]), color: [0.5, 0.52, 0.55, 1] };
    case "gantry-16x6": return { mesh: mergeMeshes([meshBox(0.5, 6, 0.5, -7.7, 0, 0), meshBox(0.5, 6, 0.5, 7.7, 0, 0), meshBox(16, 0.6, 1.2, 0, 5.4, 0)]), color: [0.6, 0.62, 0.65, 1] };
    case "marshal-post-2x3": return { mesh: mergeMeshes([meshBox(2, 2.4, 2), meshBox(2.4, 0.3, 2.4, 0, 2.4, 0)]), color: [0.7, 0.45, 0.2, 1] };
    case "cone": return { mesh: mergeMeshes([meshCylinder(0.22, 0.06, 0.7, 10), meshBox(0.5, 0.04, 0.5)]), color: [0.9, 0.35, 0.05, 1] };
    case "sign-3x2": return { mesh: mergeMeshes([meshBox(3, 2, 0.15, 0, 2.4, 0), meshCylinder(0.08, 0.08, 2.4, 8)]), color: [0.2, 0.5, 0.8, 1] };
    case "module-hub": return { mesh: mergeMeshes([meshBox(4, 4, 4), meshCylinder(0.9, 0.9, 0.6, 12, 0, 4, 0)]), color: [0.8, 0.82, 0.85, 1] };
    case "module-tube-6": return { mesh: meshCylinder(1.25, 1.25, 6, 12, 0, 0, 0), color: [0.75, 0.78, 0.82, 1] };
    case "panel-8x3": return { mesh: meshBox(8, 3, 0.3), color: [0.15, 0.35, 0.6, 1] };
    case "antenna": return { mesh: mergeMeshes([meshCylinder(0.05, 0.03, 4, 8), meshBox(0.4, 0.4, 0.4, 0, 4, 0)]), color: [0.85, 0.85, 0.9, 1] };
    case "truss-6": return { mesh: mergeMeshes([meshBox(6, 0.3, 0.3), meshBox(6, 0.3, 0.3, 0, 0.7, 0), meshBox(0.1, 1, 0.1, -2.5, 0, 0), meshBox(0.1, 1, 0.1, 0, 0, 0), meshBox(0.1, 1, 0.1, 2.5, 0, 0)]), color: [0.65, 0.67, 0.7, 1] };
    case "airlock-2x2": return { mesh: meshBox(2, 2.5, 0.5), color: [0.7, 0.72, 0.75, 1] };
    default: throw new Error(`world-content-bake: no mesh recipe for kit piece "${pieceId}"`);
  }
};

const KIT_FILES: { readonly file: string; readonly piece: string }[] = [
  { file: "kits/city/tower-8x8.glb", piece: "tower-8x8" },
  { file: "kits/city/wall-slab-4x3.glb", piece: "wall-slab-4x3" },
  { file: "kits/city/street-lamp.glb", piece: "street-lamp" },
  { file: "kits/city/planter-2x1.glb", piece: "planter-2x1" },
  { file: "kits/city/roof-unit-2x2.glb", piece: "roof-unit-2x2" },
  { file: "kits/city/barrier-2x1.glb", piece: "barrier-2x1" },
  { file: "kits/interior/wall-seg-4x3.glb", piece: "wall-seg-4x3" },
  { file: "kits/interior/floor-tile-4x4.glb", piece: "floor-tile-4x4" },
  { file: "kits/interior/door-1x2.glb", piece: "door-1x2" },
  { file: "kits/interior/ceiling-lamp.glb", piece: "ceiling-lamp" },
  { file: "kits/interior/crate-1x1.glb", piece: "crate-1x1" },
  { file: "kits/interior/table-2x1.glb", piece: "table-2x1" },
  { file: "kits/trackside/barrier-4x1.glb", piece: "barrier-4x1" },
  { file: "kits/trackside/fence-seg-4x2.glb", piece: "fence-seg-4x2" },
  { file: "kits/trackside/gantry-16x6.glb", piece: "gantry-16x6" },
  { file: "kits/trackside/marshal-post-2x3.glb", piece: "marshal-post-2x3" },
  { file: "kits/trackside/cone.glb", piece: "cone" },
  { file: "kits/trackside/sign-3x2.glb", piece: "sign-3x2" },
  { file: "kits/space/module-hub.glb", piece: "module-hub" },
  { file: "kits/space/module-tube-6.glb", piece: "module-tube-6" },
  { file: "kits/space/panel-8x3.glb", piece: "panel-8x3" },
  { file: "kits/space/antenna.glb", piece: "antenna" },
  { file: "kits/space/truss-6.glb", piece: "truss-6" },
  { file: "kits/space/airlock-2x2.glb", piece: "airlock-2x2" }
];

// ------------------------------------------------------- texture bakes -----

/** Tiling water normal field (sum of directional gradient waves) → RGBA8. */
export function bakeWaterNormal(seed: number, size = 512): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const dirs = [[1, 0.2], [0.6, 0.8], [-0.3, 0.9], [0.9, -0.5], [-0.8, -0.6], [0.2, -0.97]];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size, v = y / size;
      let dx = 0, dz = 0;
      for (let i = 0; i < dirs.length; i += 1) {
        const [cx, cz] = dirs[i]!;
        const freq = 6 + i * 3;
        const phase = seed * 17.31 + i * 2.39;
        const w = 0.5 / (1 + i * 0.5);
        dx += Math.cos((u * cx + v * cz) * freq * Math.PI * 2 + phase) * cx * w;
        dz += Math.cos((u * cx + v * cz) * freq * Math.PI * 2 + phase) * cz * w;
      }
      // small-scale value-noise ripple on top (tiling)
      dx += (tileNoise(u, v, 16, seed * 91 + 5, 3) - 0.5) * 0.6;
      dz += (tileNoise(u, v, 16, seed * 91 + 6, 3) - 0.5) * 0.6;
      const l = Math.hypot(dx, dz, 1.6);
      const o = (y * size + x) * 4;
      out[o] = Math.round((dx / l * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((dz / l * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((1.6 / l * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Foam noise: worley cells + speckle, packed RGBA (r = coverage). */
export function bakeFoam(seed: number, size = 512): Uint8Array {
  const rng = mulberry32(seed);
  const points = 96;
  const px = new Float32Array(points), py = new Float32Array(points);
  for (let i = 0; i < points; i += 1) { px[i] = rng(); py[i] = rng(); }
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size, v = y / size;
      let f1 = 2, f2 = 2;
      for (let i = 0; i < points; i += 1) {
        // wrapped distance for seamless tiling
        let dx = Math.abs(u - px[i]!); if (dx > 0.5) dx = 1 - dx;
        let dz = Math.abs(v - py[i]!); if (dz > 0.5) dz = 1 - dz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const cells = Math.max(0, Math.min(1, (f2 - f1) * 6));
      const speck = tileNoise(u, v, 96, seed + 31, 2);
      const coverage = Math.max(0, Math.min(1, cells * 0.75 + (speck - 0.5) * 0.6));
      const o = (y * size + x) * 4;
      const g = Math.round(coverage * 255);
      out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255;
    }
  }
  return out;
}

/** Caustics: 4×4 frames × 256² packed into 1024² RGBA (sharp 2F1−F2). */
export function bakeCausticsAtlas(seed: number, frameSize = 256): Uint8Array {
  const ATLAS = frameSize * 4;
  const out = new Uint8Array(ATLAS * ATLAS * 4);
  const points = 64;
  for (let frame = 0; frame < 16; frame += 1) {
    const rng = mulberry32(seed + frame * 977);
    const px = new Float32Array(points), py = new Float32Array(points);
    for (let i = 0; i < points; i += 1) { px[i] = rng(); py[i] = rng(); }
    const ox = (frame % 4) * frameSize, oy = Math.floor(frame / 4) * frameSize;
    for (let y = 0; y < frameSize; y += 1) {
      for (let x = 0; x < frameSize; x += 1) {
        const u = x / frameSize, v = y / frameSize;
        let f1 = 2, f2 = 2;
        for (let i = 0; i < points; i += 1) {
          let dx = Math.abs(u - px[i]!); if (dx > 0.5) dx = 1 - dx;
          let dz = Math.abs(v - py[i]!); if (dz > 0.5) dz = 1 - dz;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
        const c = Math.max(0, Math.min(1, (f2 - f1) * 5));
        const g = Math.round(Math.pow(c, 2.2) * 255);
        const o = ((oy + y) * ATLAS + ox + x) * 4;
        out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255;
      }
    }
  }
  return out;
}

/** Low-frequency macro variation (breaks tiling), single channel in RGBA. */
export function bakeMacroVariation(seed: number, size = 512): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = tileNoise(x / size, y / size, 8, seed, 4);
      const g = Math.round(Math.max(0, Math.min(1, v)) * 255);
      const o = (y * size + x) * 4;
      out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255;
    }
  }
  return out;
}

/** Blue-noise approximation: white noise minus its blurred self (high-pass). */
export function bakeBlueNoise(seed: number, size = 64): Uint8Array {
  const base = new Float32Array(size * size);
  const rng = mulberry32(seed);
  for (let i = 0; i < base.length; i += 1) base[i] = rng();
  const blurred = new Float32Array(size * size);
  const R = 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0, n = 0;
      for (let dy = -R; dy <= R; dy += 1) {
        for (let dx = -R; dx <= R; dx += 1) {
          sum += base[(((y + dy) % size) + size) % size * size + (((x + dx) % size) + size) % size]!;
          n += 1;
        }
      }
      blurred[y * size + x] = sum / n;
    }
  }
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < base.length; i += 1) {
    const g = Math.round(Math.max(0, Math.min(1, 0.5 + (base[i]! - blurred[i]!) * 2.2)) * 255);
    out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = g; out[i * 4 + 3] = 255;
  }
  return out;
}

// -------------------------------------------------------------------- all --

export interface BakeOutput {
  readonly file: string;       // path relative to assets/world/
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly generated: string;
}

const WORLD_ASSETS_DIR = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "packages", "engine", "assets", "world");
};

/** Bake every output; writes files under assets/world/ and returns records. */
export function bakeAll(outDir = WORLD_ASSETS_DIR()): readonly BakeOutput[] {
  const outputs: BakeOutput[] = [];
  const put = (file: string, data: Uint8Array, format: string, width: number, height: number, generated: string) => {
    const full = join(outDir, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, data);
    outputs.push({ file, format, width, height, sha256: sha256(data), generated });
  };
  for (const { file, piece } of KIT_FILES) {
    const { mesh, color } = kitPieceMesh(piece);
    put(file, new Uint8Array(bakeGlb(mesh, color, piece)), "glb", 0, 0, `procedural kit mesh — ${piece}`);
  }
  put("water/water-normal-0-512.rgba", bakeWaterNormal(11), "rgba8", 512, 512, "gradient-wave normal field, seed 11");
  put("water/water-normal-1-512.rgba", bakeWaterNormal(43), "rgba8", 512, 512, "gradient-wave normal field, seed 43");
  put("water/water-foam-512.rgba", bakeFoam(7), "rgba8", 512, 512, "worley foam coverage, seed 7");
  put("water/water-caustics-4x4-1024.rgba", bakeCausticsAtlas(19), "rgba8", 1024, 1024, "16-frame worley caustics atlas, seed 19");
  put("noise/macro-variation-512.rgba", bakeMacroVariation(23), "rgba8", 512, 512, "4-octave tiling value noise, seed 23");
  put("noise/blue-noise-64.rgba", bakeBlueNoise(37), "rgba8", 64, 64, "high-pass (blue-noise approx), seed 37");
  return outputs;
}

/** Merge bake outputs into the world asset manifest (idempotent). */
export function updateManifest(outputs: readonly BakeOutput[], manifestPath = join(WORLD_ASSETS_DIR(), "manifest.json")): void {
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { version: "1.1", assets: {} };
  for (const out of outputs) {
    const id = `world/${out.file.replace(/\.[^.]+$/, "")}`;
    manifest.assets[id] = {
      file: out.file,
      format: out.format,
      width: out.width,
      height: out.height,
      hash: out.sha256,
      license: "CC0",
      generated: out.generated
    };
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const outputs = bakeAll();
  updateManifest(outputs);
  for (const o of outputs) console.log(`${o.sha256.slice(7, 19)}  ${o.file}`);
  console.log(`world-content-bake: wrote ${outputs.length} assets + manifest entries`);
}
