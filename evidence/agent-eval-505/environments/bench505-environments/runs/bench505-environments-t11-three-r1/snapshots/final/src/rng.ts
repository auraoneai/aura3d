export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of a 3D position, returns 0..1. */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(Math.round(x * 100) | 0, 374761393);
  h = (h + Math.imul(Math.round(y * 100) | 0, 668265263)) | 0;
  h = (h + Math.imul(Math.round(z * 100) | 0, 2147483647 - 11)) | 0;
  h = (h + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
