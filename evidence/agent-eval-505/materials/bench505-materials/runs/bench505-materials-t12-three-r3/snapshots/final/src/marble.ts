import * as THREE from 'three';

function hash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Periodic value noise in [0,1]; tiles with an integer period. */
function noise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const p = Math.max(1, Math.round(period));
  const x0 = ((xi % p) + p) % p;
  const y0 = ((yi % p) + p) % p;
  const x1 = (x0 + 1) % p;
  const y1 = (y0 + 1) % p;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, period: number, oct: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(x * f, y * f, period * f, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function turbulence(x: number, y: number, period: number, oct: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * Math.abs(2 * noise(x * f, y * f, period * f, seed + i * 31) - 1);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Tileable Carrara-style marble: white base with soft clouds and warped grey veins. */
export function makeMarbleTexture(size = 512, seed = 3): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const v = py / size;

      const cloud = fbm(u * 4, v * 4, 4, 5, seed);
      const turb = turbulence(u * 4, v * 4, 4, 5, seed + 5);
      const turb2 = turbulence(u * 3, v * 3, 3, 5, seed + 9);

      const t1 = 2 * u + 1 * v + 1.5 * turb;
      const s1 = 1 - Math.abs(Math.sin(Math.PI * t1));
      const t2 = 3 * u - 2 * v + 2.2 * turb2;
      const s2 = 1 - Math.abs(Math.sin(Math.PI * t2));
      const t3 = 5 * u + 4 * v + 3.0 * turb;
      const s3 = 1 - Math.abs(Math.sin(Math.PI * t3));

      const mask1 = smoothstep(0.3, 0.7, fbm(u * 3, v * 3, 3, 3, seed + 21));
      const mask2 = smoothstep(0.45, 0.75, fbm(u * 5, v * 5, 5, 3, seed + 33));
      const mask3 = smoothstep(0.55, 0.8, fbm(u * 6, v * 6, 6, 3, seed + 45));

      const vein =
        Math.pow(s1, 16) * mask1 * 0.85 +
        Math.pow(s2, 28) * mask2 * 0.65 +
        Math.pow(s3, 40) * mask3 * 0.4;
      const halo = Math.pow(s1, 4) * mask1 * 0.12 + Math.pow(s2, 5) * mask2 * 0.07;
      const m = Math.min(1, vein + halo);

      const base = 0.95 - 0.1 * cloud * cloud - 0.05 * turb;
      const br = base * 1.0;
      const bg = base * 0.985;
      const bb = base * 0.955;
      const vr = 0.36;
      const vg = 0.38;
      const vb = 0.42;
      const i = (py * size + px) * 4;
      data[i] = Math.round(255 * (br * (1 - m) + vr * m));
      data[i + 1] = Math.round(255 * (bg * (1 - m) + vg * m));
      data[i + 2] = Math.round(255 * (bb * (1 - m) + vb * m));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
