import * as THREE from 'three';

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

function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Tileable value noise; `p` is the lattice period. */
function vnoise(x: number, y: number, p: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % p) + p) % p;
  const y0 = ((iy % p) + p) % p;
  const x1 = (x0 + 1) % p;
  const y1 = (y0 + 1) % p;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function makeStoneTexture(base: [number, number, number], seed: number, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  const rnd = mulberry32(seed + 99);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let f = 0;
      let amp = 0.5;
      let freq = 4;
      for (let o = 0; o < 5; o++) {
        f += amp * vnoise(u * freq, v * freq, freq, seed + o);
        amp *= 0.5;
        freq *= 2;
      }
      const ridge = Math.abs(vnoise(u * 6, v * 6, 6, seed + 10) - 0.5);
      const crack = 1 - Math.min(1, ridge / 0.025);
      let shade = 0.4 + 1.0 * f;
      shade *= 1 - 0.55 * crack;
      shade += (rnd() - 0.5) * 0.1;
      // mossy / stained patches
      const stain = vnoise(u * 3, v * 3, 3, seed + 20);
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, base[0] * shade * (0.9 + 0.1 * stain)));
      img.data[i + 1] = Math.max(0, Math.min(255, base[1] * shade * (0.95 + 0.1 * stain)));
      img.data[i + 2] = Math.max(0, Math.min(255, base[2] * shade));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function drawRune(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, rnd: () => number): void {
  const cols = [-s / 2, 0, s / 2];
  const rows = [-s / 2, -s / 6, s / 6, s / 2];
  ctx.beginPath();
  if (rnd() < 0.7) {
    ctx.moveTo(cx, cy + rows[0]);
    ctx.lineTo(cx, cy + rows[3]);
  }
  const n = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const ax = cols[Math.floor(rnd() * 3)];
    const ay = rows[Math.floor(rnd() * 4)];
    const bx = cols[Math.floor(rnd() * 3)];
    const by = rows[Math.floor(rnd() * 4)];
    ctx.moveTo(cx + ax, cy + ay);
    ctx.lineTo(cx + bx, cy + by);
  }
  ctx.stroke();
}

export function makeRuneTexture(seed: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const rnd = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#40d8ff';
  ctx.shadowBlur = 10;
  ctx.strokeStyle = '#d8fbff';
  ctx.lineWidth = 7;
  drawRune(ctx, size / 2, size / 2, 62, rnd);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeFloorRunes(): THREE.CanvasTexture {
  const size = 1024;
  const c = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const rnd = mulberry32(7);
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.shadowColor = '#6a50ff';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = '#bfe8ff';
  const circle = (r: number, w: number) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  circle(500, 5);
  circle(478, 2);
  circle(380, 3);
  circle(345, 2);
  circle(220, 3);
  ctx.lineWidth = 2;
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const r0 = 480;
    const r1 = i % 5 === 0 ? 498 : 490;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.lineWidth = 5;
  const glyphs = 20;
  for (let i = 0; i < glyphs; i++) {
    const a = (i / glyphs) * Math.PI * 2;
    ctx.save();
    ctx.translate(c + Math.cos(a) * 430, c + Math.sin(a) * 430);
    ctx.rotate(a + Math.PI / 2);
    drawRune(ctx, 0, 0, 44, rnd);
    ctx.restore();
  }
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    ctx.save();
    ctx.translate(c + Math.cos(a) * 285, c + Math.sin(a) * 285);
    ctx.rotate(a + Math.PI / 2);
    drawRune(ctx, 0, 0, 36, rnd);
    ctx.restore();
  }
  // star polygon
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = ((i * 3) / 7) * Math.PI * 2 - Math.PI / 2;
    const x = c + Math.cos(a) * 340;
    const y = c + Math.sin(a) * 340;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeRadialTexture(stops: Array<[number, string]>, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
