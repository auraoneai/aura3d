import * as THREE from 'three';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic 2D value noise, so generated textures tile seamlessly. */
function makeNoise(seed: number) {
  const rnd = mulberry32(seed);
  const size = 256;
  const table = new Float32Array(size * size);
  for (let i = 0; i < table.length; i++) table[i] = rnd();
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const at = (ix: number, iy: number, p: number) => {
    const x = ((ix % p) + p) % p;
    const y = ((iy % p) + p) % p;
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return table[(h >>> 0) & (size * size - 1)] as number;
  };
  /** u, v in [0,1), period p (integer lattice cells across the tile). */
  const noise = (u: number, v: number, p: number) => {
    const x = u * p;
    const y = v * p;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = fade(x - x0);
    const fy = fade(y - y0);
    const a = at(x0, y0, p);
    const b = at(x0 + 1, y0, p);
    const c = at(x0, y0 + 1, p);
    const d = at(x0 + 1, y0 + 1, p);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const fbm = (u: number, v: number, p: number, octaves: number) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(u, v, p * f);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };
  return { noise, fbm };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Carrara-style white marble with grey, turbulence-warped veins (tileable). */
export function makeMarbleCanvas(size = 1024): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const { fbm } = makeNoise(1337);
  const { fbm: fbm2 } = makeNoise(7331);
  const { fbm: fbm3 } = makeNoise(4242);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const warp1 = fbm(u, v, 3, 6) - 0.5;
      const warp2 = fbm2(u, v, 4, 5) - 0.5;
      const cloud = fbm3(u, v, 2, 4);

      // primary veins: warped stripes
      const t1 = Math.PI * (2 * u + v) + warp1 * 14;
      const s1 = 1 - Math.abs(Math.sin(t1));
      const fade1 = smoothstep(0.25, 0.7, fbm2(u + 0.3, v + 0.1, 2, 3));
      const vein1 = Math.pow(s1, 22) * (0.35 + 0.65 * fade1);

      // secondary, finer veins crossing the first
      const t2 = Math.PI * (-u + 3 * v) + warp2 * 18 + warp1 * 6;
      const s2 = 1 - Math.abs(Math.sin(t2));
      const fade2 = smoothstep(0.3, 0.75, fbm(u + 0.6, v + 0.4, 3, 3));
      const vein2 = Math.pow(s2, 40) * fade2;

      // ridged turbulence: branching hairline cracks
      const r = 1 - Math.abs(2 * fbm3(u + 0.2, v + 0.8, 5, 5) - 1);
      const vein3 = Math.pow(r, 14) * 0.55 * smoothstep(0.35, 0.65, warp1 + 0.5);

      // soft grey haze around the main veins
      const haze = Math.pow(s1, 4) * 0.22 * fade1;

      const vein = Math.min(1, vein1 * 0.9 + vein2 * 0.6 + vein3);
      const grey = Math.min(1, vein + haze);

      const base = 244 - cloud * 14;
      const vr = 108 + warp2 * 30;
      const vg = 110 + warp2 * 30;
      const vb = 118 + warp2 * 30;
      const i = (y * size + x) * 4;
      img.data[i] = base + (vr - base) * grey;
      img.data[i + 1] = base - 1 + (vg - base + 1) * grey;
      img.data[i + 2] = base - 3 + (vb - base + 3) * grey;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Engraved-looking band: diamond / line pattern in dark gold on mid gold. */
export function makeBandCanvas(): HTMLCanvasElement {
  const w = 2048;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c99a3a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#4a2f0a';
  ctx.fillStyle = '#4a2f0a';
  ctx.lineWidth = 4;
  ctx.fillRect(0, 10, w, 5);
  ctx.fillRect(0, h - 15, w, 5);
  const n = 32;
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const cx = i * step + step / 2;
    ctx.beginPath();
    ctx.moveTo(cx, 26);
    ctx.lineTo(cx + step * 0.38, h / 2);
    ctx.lineTo(cx, h - 26);
    ctx.lineTo(cx - step * 0.38, h / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, h / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + step * 0.5, 26);
    ctx.lineTo(cx + step * 0.5, h - 26);
    ctx.stroke();
  }
  return canvas;
}

/** Engraved gold name plate. */
export function makePlateCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#ffd988');
  g.addColorStop(1, '#f0b94c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#7a5214';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = '#6b4510';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 44px Georgia, "Times New Roman", serif';
  ctx.fillText('EXCELLENCE', 256, 50);
  ctx.font = '26px Georgia, "Times New Roman", serif';
  ctx.fillText('GRAND AWARD', 256, 92);
  return canvas;
}

/** Window with mullions, used as an emissive panel in the reflection environment. */
export function makeWindowCanvas(cols: number, rows: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = '#fff';
  const pad = 10;
  const bar = 8;
  const cw = (256 - pad * 2 - bar * (cols - 1)) / cols;
  const ch = (512 - pad * 2 - bar * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillRect(pad + c * (cw + bar), pad + r * (ch + bar), cw, ch);
    }
  }
  return canvas;
}

export function canvasTexture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}
