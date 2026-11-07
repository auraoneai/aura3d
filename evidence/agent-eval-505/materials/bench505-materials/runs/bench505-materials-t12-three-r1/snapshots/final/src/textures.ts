import * as THREE from 'three';

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number, oct: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, seed + i * 17);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

function turbulence(x: number, y: number, seed: number, oct: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += amp * Math.abs(vnoise(x * f, y * f, seed + i * 31) - 0.5) * 2;
    f *= 2.1;
    amp *= 0.5;
  }
  return sum;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Carrara-style white marble with grey veins from turbulence-warped stripes. */
export function makeMarbleTexture(seed: number, size = 768): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const ang = 0.5 + seed * 0.7;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const v = py / size;
      const x = u * 3.2;
      const y = v * 3.2;
      // cloudy tone variation
      const cloud = fbm(x * 1.3 + seed * 5, y * 1.3, seed, 5);
      // main veins
      const along = (u * ca + v * sa) * 2.4;
      const warp = turbulence(x * 0.9 + seed, y * 0.9, seed + 3, 6);
      const t1 = along + warp * 2.6;
      let v1 = Math.pow(1 - Math.abs(Math.sin(t1 * Math.PI)), 22);
      const mask1 = smoothstep(0.3, 0.62, fbm(x * 0.7 + 9, y * 0.7 + seed, seed + 8, 4));
      v1 *= 0.35 + 0.65 * mask1;
      // secondary finer veins, different direction
      const along2 = (u * sa - v * ca) * 5.0;
      const warp2 = turbulence(x * 1.7 + 4, y * 1.7 + seed * 2, seed + 11, 6);
      const t2 = along2 + warp2 * 3.4;
      let v2 = Math.pow(1 - Math.abs(Math.sin(t2 * Math.PI)), 40);
      const mask2 = smoothstep(0.4, 0.7, fbm(x * 1.1 + 20, y * 1.1, seed + 14, 4));
      v2 *= mask2 * 0.7;
      // soft haze around main veins
      const haze = Math.pow(1 - Math.abs(Math.sin(t1 * Math.PI)), 5) * 0.12 * mask1;
      const fine = (vnoise(px * 0.5, py * 0.5, seed + 40) - 0.5) * 0.015;

      const base = 0.93 - cloud * 0.07 + fine;
      const vein = Math.min(1, v1 * 0.85 + v2 * 0.5 + haze);
      const grey = 0.46 + 0.1 * fbm(x * 3, y * 3, seed + 50, 3);
      const k = vein;
      const r = base * (1 - k) + grey * k + 0.005;
      const g = base * (1 - k) + (grey + 0.005) * k;
      const b = base * (1 - k) + (grey + 0.03) * k - 0.005;
      const i = (py * size + px) * 4;
      d[i] = Math.min(255, Math.max(0, r * 255));
      d[i + 1] = Math.min(255, Math.max(0, g * 255 * 0.992));
      d[i + 2] = Math.min(255, Math.max(0, b * 255 * 0.98));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Dark warm floor with faint plank structure. */
export function makeFloorTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const planks = 8;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const plank = Math.floor((px / size) * planks);
      const shade = 0.75 + 0.25 * hash(plank, 3, 5);
      const grain = fbm(px * 0.01 + plank * 7, py * 0.12, 21, 4);
      let val = shade * (0.7 + 0.5 * grain);
      const edge = (px / size) * planks - plank;
      if (edge < 0.02 || edge > 0.98) val *= 0.4;
      const i = (py * size + px) * 4;
      d[i] = Math.min(255, val * 70);
      d[i + 1] = Math.min(255, val * 50);
      d[i + 2] = Math.min(255, val * 36);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Bump map for an engraved band: greek-key style zigzag (dark = recessed). */
export function makeEngravingBump(): THREE.CanvasTexture {
  const w = 1024;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'miter';
  const reps = 32;
  const step = w / reps;
  for (const [y0, y1] of [[34, 60], [68, 94]] as const) {
    ctx.beginPath();
    for (let i = 0; i <= reps; i++) {
      const x = i * step;
      ctx.lineTo(x, i % 2 === 0 ? y0 : y1);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 14, w, 5);
  ctx.fillRect(0, h - 19, w, 5);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Bump map for the name plate. */
export function makePlateBump(): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 54px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CHAMPION', w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}
