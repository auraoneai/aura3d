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

function finish(c: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

/** Wood grain with streaks running along the texture's u axis. Near-white so material colour tints it. */
export function makeWoodTexture(): THREE.CanvasTexture {
  const rnd = mulberry32(7);
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#e6d6bd';
  ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y++) {
    const n = Math.sin(y * 0.31) * 0.5 + Math.sin(y * 1.17 + 2) * 0.3 + (rnd() - 0.5) * 0.9;
    const a = Math.max(0, 0.08 + n * 0.16);
    ctx.strokeStyle = `rgba(70,40,18,${a.toFixed(3)})`;
    ctx.lineWidth = 1 + rnd() * 1.2;
    ctx.beginPath();
    const ph = rnd() * 6;
    for (let x = 0; x <= S; x += 16) {
      const yy = y + Math.sin(x * 0.03 + ph + y * 0.05) * 1.6;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // knots
  for (let k = 0; k < 3; k++) {
    const kx = rnd() * S;
    const ky = rnd() * S;
    for (let r = 12; r > 1; r -= 3) {
      ctx.strokeStyle = `rgba(60,32,14,${(0.12 + (12 - r) * 0.02).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r * 1.8, r * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return finish(c);
}

export function makeBurlapTexture(): THREE.CanvasTexture {
  const rnd = mulberry32(21);
  const S = 128;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#e4d4ac';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) {
    ctx.strokeStyle = `rgba(90,65,30,${(0.1 + rnd() * 0.25).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(S, i + 0.5);
    ctx.stroke();
    ctx.strokeStyle = `rgba(90,65,30,${(0.1 + rnd() * 0.25).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, S);
    ctx.stroke();
  }
  return finish(c, 3, 3);
}

export function makeDirtTexture(): THREE.CanvasTexture {
  const rnd = mulberry32(99);
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#7a5c40';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 8 + rnd() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    g.addColorStop(0, dark ? 'rgba(60,42,28,0.30)' : 'rgba(150,120,85,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 5000; i++) {
    const v = rnd();
    ctx.fillStyle =
      v < 0.5
        ? `rgba(50,35,22,${(0.2 + rnd() * 0.3).toFixed(2)})`
        : v < 0.85
          ? `rgba(160,135,100,${(0.2 + rnd() * 0.3).toFixed(2)})`
          : `rgba(110,110,105,${(0.3 + rnd() * 0.3).toFixed(2)})`;
    const s = 1 + rnd() * 2;
    ctx.fillRect(rnd() * S, rnd() * S, s, s);
  }
  return finish(c, 40, 40);
}
