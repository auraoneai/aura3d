/* Deterministic tileable value-noise canvas used as the scene-5 texture by both libraries (not counted as scene source). */
export function paintNoise(size = 256): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const hash = (x: number, y: number, seed: number): number => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (u: number, v: number, period: number, seed: number): number => {
    const x = u * period, y = v * period, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const p = (i: number, j: number): number => hash(((i % period) + period) % period, ((j % period) + period) % period, seed);
    const a = p(xi, yi), b = p(xi + 1, yi), c = p(xi, yi + 1), d = p(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = (y * size + x) * 4;
    img.data[i] = 255 * (noise(u, v, 8, 1) * 0.6 + noise(u, v, 16, 2) * 0.4);
    img.data[i + 1] = 255 * (noise(u, v, 8, 3) * 0.6 + noise(u, v, 32, 4) * 0.4);
    img.data[i + 2] = 255 * noise(u, v, 4, 5);
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
