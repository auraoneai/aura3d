/**
 * Meadow terrain: the original's analytic height field (two hills over a gentle swell). The
 * original also carves a stream and a path into it; the port keeps the base field, a worn
 * path, a beach and a cliff edge, and raises distant ridges so the meadow sits in a bowl.
 * Height never affects the x/z simulation, so all of this is a visual approximation.
 */

export function groundHeight(x: number, z: number): number {
  return (
    0.3 +
    0.58 * Math.sin(0.06 * x) +
    0.32 * Math.cos(0.17 * z + 0.04 * x) +
    1.45 * Math.exp(-((x - 39) ** 2 / 240 + (z - 3) ** 2 / 160)) +
    1.15 * Math.exp(-((x + 27) ** 2 / 190 + (z - 1) ** 2 / 120))
  );
}

/** Centre line of the painted path (the original's `js`). */
export function pathZ(x: number): number {
  return 3.5 + 1.7 * Math.sin(0.082 * x);
}

/** Small deterministic generator for foliage placement (the original's placement used Math.random-free scatter). */
export function lehmer(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const SEA_LEVEL = -0.55;

/** The meadow stream: from the lake behind the windmill, across the meadow and back to the water in the west. */
export const STREAM_POINTS: readonly (readonly [number, number])[] = [
  [24, -12.6], [21.5, -9.6], [16, -6.2], [9, -4.9], [2, -6.2], [-5, -6.6], [-12, -8.4], [-20, -9.6], [-29, -8.4], [-38, -9.6], [-46, -12.4], [-52, -15.5]
];

/** Distance from (x, z) to the stream centre line and the length along it. */
export function streamInfo(x: number, z: number): { dist: number; along: number; t: number } {
  let best = Infinity, along = 0, run = 0, bt = 0;
  for (let i = 0; i < STREAM_POINTS.length - 1; i++) {
    const [ax, az] = STREAM_POINTS[i]!, [bx, bz] = STREAM_POINTS[i + 1]!;
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz, len = Math.sqrt(len2);
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    const d = Math.hypot(x - (ax + dx * u), z - (az + dz * u));
    if (d < best) { best = d; along = run + u * len; bt = i + u; }
    run += len;
  }
  return { dist: best, along, t: bt };
}

/** Shoreline z for a given x: a soft beach in the west, a short cliff east of x = 12 (the sim's cliff line is z = -13). */
export const shoreStart = (x: number): number => -13.2 - 1.2 * (1 - smooth(8, 16, x));
const shoreLength = (x: number): number => 2.6 + 9 * (1 - smooth(8, 16, x));

/** Visual ground height: the analytic field with the beach, cliff drop and distant ridges applied. */
export function terrainHeight(x: number, z: number): number {
  let h = groundHeight(x, z);
  const drop = smooth(shoreStart(x), shoreStart(x) - shoreLength(x), z);
  h -= drop * (h - SEA_LEVEL + 1.6);
  // ridges framing the valley (outside the walkable box)
  const side = Math.max(smooth(54, 84, Math.abs(x - 2)), 0);
  const back = smooth(23, 44, z);
  const ridge = 7.5 * side * (0.7 + 0.3 * Math.sin(0.23 * z + 0.4)) + 8.5 * back * (0.75 + 0.25 * Math.sin(0.19 * x));
  h += ridge * (1 - drop);
  // carve the stream bed with soft banks
  if (h > SEA_LEVEL + 0.3) {
    const s = streamInfo(x, z).dist;
    if (s < 5) h -= 0.62 * Math.exp(-(s * s) / (2 * 1.15 * 1.15));
  }
  return h;
}

export interface TerrainMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  tint: Float32Array;
}

export interface ShadowBlob {
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** 0..1 darkening at the centre */
  strength: number;
}

const mix = (a: readonly number[], b: readonly number[], t: number): number[] => a.map((v, i) => v * (1 - t) + b[i]! * t);
const lin = (hex: string): number[] => {
  const c = (i: number): number => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [c(0), c(1), c(2)];
};

const PALETTE = {
  grassDeep: lin("#4a8a30"),
  grass: lin("#76ae3c"),
  grassLight: lin("#9fcb4a"),
  dry: lin("#c2be5c"),
  hill: lin("#9db853"),
  forest: lin("#4a7a3a"),
  path: lin("#cdb98a"),
  sand: lin("#ead9a6"),
  wet: lin("#b7a678"),
  rock: lin("#9a9684")
};

export function buildTerrain(step = 0.8, blobs: readonly ShadowBlob[] = []): TerrainMesh {
  const x0 = -96, x1 = 98, z0 = -52, z1 = 60;
  const nx = Math.round((x1 - x0) / step) + 1;
  const nz = Math.round((z1 - z0) / step) + 1;
  const positions = new Float32Array(nx * nz * 3);
  const normals = new Float32Array(nx * nz * 3);
  const tint = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step, z = z0 + j * step, k = (j * nx + i) * 3;
      const y = terrainHeight(x, z);
      positions[k] = x; positions[k + 1] = y; positions[k + 2] = z;
      const e = 0.35;
      const nxv = terrainHeight(x - e, z) - terrainHeight(x + e, z);
      const nzv = terrainHeight(x, z - e) - terrainHeight(x, z + e);
      const len = Math.hypot(nxv, 2 * e, nzv);
      normals[k] = nxv / len; normals[k + 1] = (2 * e) / len; normals[k + 2] = nzv / len;

      const patch = 0.5 + 0.5 * Math.sin(0.21 * x + 0.13 * z) * Math.cos(0.17 * z - 0.09 * x);
      let c = mix(PALETTE.grassDeep, PALETTE.grass, Math.max(0, Math.min(1, 0.25 + patch * 0.9)));
      c = mix(c, PALETTE.grassLight, smooth(0.55, 1, 0.5 + 0.5 * Math.sin(0.43 * x - 0.31 * z)) * 0.55);
      c = mix(c, PALETTE.dry, smooth(0.62, 0.95, 0.5 + 0.5 * Math.sin(0.11 * x + 0.37 * z + 1.3)) * 0.5);
      c = mix(c, PALETTE.hill, smooth(0.9, 2.4, y) * 0.5);
      const outside = Math.max(smooth(52, 70, Math.abs(x - 2)), smooth(22, 36, z));
      c = mix(c, PALETTE.forest, outside * 0.75);
      c = mix(c, PALETTE.rock, smooth(5, 9, y) * 0.45);
      const si = streamInfo(x, z).dist;
      c = mix(c, lin("#6e8a48"), Math.exp(-(si * si) / 5.5) * 0.6);
      c = mix(c, lin("#9c8c62"), Math.exp(-(si * si) / 2.2) * 0.55);
      const along = x > -52 && x < 58 ? 1 : 0;
      const pathBlend = Math.exp(-((z - pathZ(x)) ** 2) / 0.8) * along;
      c = mix(c, PALETTE.path, pathBlend * 0.85);
      const beach = smooth(-11.5, -13.8, z + (x > 12 ? 0 : 0.8 * (12 - x) / 12));
      const wet = smooth(SEA_LEVEL + 0.55, SEA_LEVEL - 0.1, y);
      c = mix(c, PALETTE.sand, beach * (x > 12 ? 0.35 : 0.9));
      c = mix(c, PALETTE.wet, wet * 0.8);
      // painted blob shadows cast by trees and buildings (sun is behind the camera, to the left)
      let occ = 1;
      for (const b of blobs) {
        const dx = (x - b.x) / b.rx, dz = (z - b.z) / b.rz;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1) occ *= 1 - b.strength * (1 - d2) * (1 - d2 * 0.4);
      }
      tint[k] = c[0]! * occ; tint[k + 1] = c[1]! * occ; tint[k + 2] = c[2]! * (occ * 0.5 + 0.5 * Math.sqrt(occ));
    }
  }
  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      indices[q++] = a; indices[q++] = c; indices[q++] = b;
      indices[q++] = b; indices[q++] = c; indices[q++] = d;
    }
  }
  return { positions, normals, indices, tint };
}
