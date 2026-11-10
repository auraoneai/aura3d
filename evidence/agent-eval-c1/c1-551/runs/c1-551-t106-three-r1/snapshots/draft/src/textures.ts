import * as THREE from 'three';

function hash(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

/** Plain-weave colour and height textures for the fabric sphere. */
export function makeWeave(): { color: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const size = 256;
  const cells = 8;
  const cell = size / cells;
  const [cc, cctx] = makeCanvas(size, size);
  const [bc, bctx] = makeCanvas(size, size);
  const cimg = cctx.createImageData(size, size);
  const bimg = bctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const fx = ((x % cell) + 0.5) / cell;
      const fy = ((y % cell) + 0.5) / cell;
      const warpOnTop = (cx + cy) % 2 === 0;
      const across = Math.sin(Math.PI * (warpOnTop ? fx : fy));
      const along = 0.72 + 0.28 * Math.sin(Math.PI * (warpOnTop ? fy : fx));
      const streak = 0.82 + 0.36 * hash(warpOnTop ? x : y + 4096, warpOnTop ? cx : cy);
      const fuzz = 0.88 + 0.24 * hash(x, y);
      const h = Math.pow(across, 0.8) * along;
      const v = (0.22 + 0.9 * h) * streak * fuzz;
      const i = (y * size + x) * 4;
      cimg.data[i] = Math.min(255, 120 * v * 1.5);
      cimg.data[i + 1] = Math.min(255, 14 * v * 1.5);
      cimg.data[i + 2] = Math.min(255, 30 * v * 1.5);
      cimg.data[i + 3] = 255;
      const g = Math.min(255, h * streak * 255);
      bimg.data[i] = g;
      bimg.data[i + 1] = g;
      bimg.data[i + 2] = g;
      bimg.data[i + 3] = 255;
    }
  }
  cctx.putImageData(cimg, 0, 0);
  bctx.putImageData(bimg, 0, 0);

  const make = (c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 3);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { color: make(cc, true), bump: make(bc, false) };
}

/** Horizontal brushing streaks used as roughness and bump map. */
export function makeBrushed(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const rows = new Float32Array(h);
  for (let y = 0; y < h; y++) rows[y] = hash(y, 17);
  for (let y = 0; y < h; y++) {
    const r = 0.5 * rows[y] + 0.3 * rows[(y + 1) % h] + 0.2 * rows[(y + h - 1) % h];
    const base = 0.5 + 0.5 * Math.pow(r, 1.3);
    for (let x = 0; x < w; x++) {
      const slow = 0.92 + 0.16 * hash(x >> 5, y >> 1);
      const n = 0.94 + 0.12 * hash(x, y);
      const v = Math.min(1, base * slow * n);
      const g = v * 255;
      const i = (y * w + x) * 4;
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Baked soft contact shadows for the floor. Covers x in [-8,8], z in [-8,10]. */
export function makeContactShadows(
  spheres: { x: number; strength: number }[],
): THREE.CanvasTexture {
  const w = 1024;
  const h = 1152;
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const sx = w / 16;
  const sz = h / 18;
  for (const s of spheres) {
    const px = (s.x + 8) * sx;
    const py = (0 + 8) * sz;
    const layers: [number, number][] = [
      [2.4, 0.3],
      [1.45, 0.45],
      [1.05, 0.7],
    ];
    for (const [radius, alpha] of layers) {
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(sx, sz);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      const a = alpha * s.strength;
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.5, `rgba(0,0,0,${a * 0.4})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}
