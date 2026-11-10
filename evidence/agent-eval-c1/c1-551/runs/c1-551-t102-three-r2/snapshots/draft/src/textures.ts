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

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

/** Weathered stone: speckle, blotches, cracks and a bit of moss. Tileable enough at low contrast. */
export function makeStoneTexture(seed: number, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = makeCanvas(size);
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#74727f';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 20 + rnd() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.5;
    g.addColorStop(0, dark ? 'rgba(30,28,45,0.35)' : 'rgba(170,168,185,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(ox, oy);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
    }
  }
  for (let i = 0; i < 7000; i++) {
    const v = Math.floor(rnd() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${0.05 + rnd() * 0.12})`;
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // moss
  for (let i = 0; i < 14; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 8 + rnd() * 22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(40,85,80,0.35)');
    g.addColorStop(1, 'rgba(40,85,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // cracks
  ctx.strokeStyle = 'rgba(15,12,25,0.7)';
  for (let i = 0; i < 9; i++) {
    ctx.lineWidth = 0.6 + rnd() * 1.2;
    ctx.beginPath();
    let x = rnd() * size;
    let y = rnd() * size;
    ctx.moveTo(x, y);
    const n = 5 + Math.floor(rnd() * 8);
    for (let k = 0; k < n; k++) {
      x += (rnd() - 0.5) * 36;
      y += (rnd() - 0.3) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // block seams
  ctx.strokeStyle = 'rgba(10,8,20,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

/** Glowing rune glyph on transparent background (white-ish strokes, tinted by material color). */
export function makeRuneTexture(seed: number): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = makeCanvas(size);
  const rnd = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const draw = (width: number, alpha: number) => {
    const r2 = mulberry32(seed * 31 + 7);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(64, 14);
    ctx.lineTo(64, 114);
    const strokes = 4 + Math.floor(r2() * 3);
    for (let i = 0; i < strokes; i++) {
      const y = 22 + r2() * 84;
      const dx = 14 + r2() * 30;
      const dy = (r2() - 0.5) * 40;
      const side = r2() > 0.5 ? 1 : -1;
      ctx.moveTo(64, y);
      ctx.lineTo(64 + side * dx, y + dy);
      if (r2() > 0.6) ctx.lineTo(64 + side * dx, y + dy + 14);
    }
    ctx.stroke();
  };
  void rnd;
  draw(9, 0.25);
  draw(4, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Concentric ritual circle drawn on the platform. */
export function makeCircleTexture(): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = makeCanvas(size);
  const m = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = '#fff';
  const ring = (r: number, w: number, a: number) => {
    ctx.globalAlpha = a;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(m, m, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(240, 4, 1);
  ring(228, 2, 0.7);
  ring(170, 3, 0.9);
  ring(120, 2, 0.6);
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r0 = 175;
    const r1 = i % 4 === 0 ? 222 : 200;
    ctx.lineWidth = i % 4 === 0 ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(m + Math.cos(a) * r0, m + Math.sin(a) * r0);
    ctx.lineTo(m + Math.cos(a) * r1, m + Math.sin(a) * r1);
    ctx.stroke();
  }
  // triangle sigils
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2.5;
  for (let k = 0; k < 2; k++) {
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * Math.PI * 2 + k * Math.PI - Math.PI / 2;
      const x = m + Math.cos(a) * 168;
      const y = m + Math.sin(a) * 168;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = makeCanvas(size);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
