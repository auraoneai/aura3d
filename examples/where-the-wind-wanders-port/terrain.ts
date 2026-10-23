/**
 * Meadow terrain: the original's analytic height field (two hills over a gentle swell). The
 * original also carves a stream and a path into it; the port keeps the base field and a
 * painted path stripe only (documented in PORTING-NOTES.md). Height never affects the x/z
 * simulation, so this is a visual approximation.
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

export interface TerrainMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  tint: Float32Array;
}

const mix = (a: readonly number[], b: readonly number[], t: number): number[] => a.map((v, i) => v * (1 - t) + b[i]! * t);

export function buildTerrain(step = 1.5): TerrainMesh {
  const x0 = -78, x1 = 80, z0 = -48, z1 = 48;
  const nx = Math.round((x1 - x0) / step) + 1;
  const nz = Math.round((z1 - z0) / step) + 1;
  const positions = new Float32Array(nx * nz * 3);
  const normals = new Float32Array(nx * nz * 3);
  const tint = new Float32Array(nx * nz * 3);
  const grass = [0.36, 0.52, 0.22];
  const meadow = [0.52, 0.62, 0.28];
  const hill = [0.62, 0.62, 0.36];
  const path = [0.74, 0.66, 0.46];
  const shore = [0.78, 0.74, 0.56];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step, z = z0 + j * step, k = (j * nx + i) * 3;
      const y = groundHeight(x, z);
      positions[k] = x; positions[k + 1] = y; positions[k + 2] = z;
      const e = 0.4;
      const nxv = groundHeight(x - e, z) - groundHeight(x + e, z);
      const nzv = groundHeight(x, z - e) - groundHeight(x, z + e);
      const len = Math.hypot(nxv, 2 * e, nzv);
      normals[k] = nxv / len; normals[k + 1] = (2 * e) / len; normals[k + 2] = nzv / len;
      let c = mix(grass, meadow, 0.5 + 0.5 * Math.sin(0.21 * x + 0.13 * z));
      c = mix(c, hill, Math.max(0, Math.min(1, (y - 0.9) / 1.6)));
      const pathBlend = Math.exp(-((z - pathZ(x)) ** 2) / 0.9) * (x > -50 && x < 56 ? 1 : 0);
      c = mix(c, path, pathBlend * 0.85);
      c = mix(c, shore, Math.max(0, Math.min(1, (-11 - z) / 6)));
      tint.set(c, k);
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
