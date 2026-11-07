import * as THREE from 'three';
import { mulberry32 } from './rng';

function cloudTexture(seed: number): THREE.CanvasTexture {
  const rng = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  for (let k = 0; k < 8; k++) {
    const x = 64 + (rng() - 0.5) * 36;
    const y = 64 + (rng() - 0.5) * 20;
    const r = 18 + rng() * 14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Bank {
  group: THREE.Group;
  speed: number;
  limit: number;
}

interface BankSpec {
  x: number;
  y: number;
  z: number;
  len: number;
  size: number;
  puffs: number;
}

const SPECS: BankSpec[] = [
  { x: -90, y: 14, z: -170, len: 90, size: 40, puffs: 9 },
  { x: 70, y: 4, z: -160, len: 80, size: 36, puffs: 8 },
  { x: 0, y: -22, z: -130, len: 120, size: 44, puffs: 10 },
  { x: -60, y: 30, z: -100, len: 60, size: 28, puffs: 7 },
  { x: 90, y: 24, z: -75, len: 60, size: 26, puffs: 7 },
  { x: -30, y: -26, z: -60, len: 90, size: 30, puffs: 9 },
  { x: 40, y: -14, z: -35, len: 50, size: 22, puffs: 7 },
  { x: -70, y: 18, z: -30, len: 50, size: 22, puffs: 6 },
  { x: 20, y: 26, z: -8, len: 40, size: 18, puffs: 6 },
  { x: -20, y: -22, z: 12, len: 60, size: 20, puffs: 7 },
  { x: 60, y: -8, z: 18, len: 40, size: 16, puffs: 5 },
  { x: -50, y: 8, z: 30, len: 36, size: 14, puffs: 5 },
];

export class Clouds {
  readonly group = new THREE.Group();
  private readonly banks: Bank[] = [];

  constructor() {
    const rng = mulberry32(4242);
    const textures = [cloudTexture(1), cloudTexture(2), cloudTexture(3)];
    const top = new THREE.Color('#ffe2cc');
    const mid = new THREE.Color('#ffb4b4');
    const low = new THREE.Color('#b0709c');
    const c = new THREE.Color();

    for (const s of SPECS) {
      const g = new THREE.Group();
      g.position.set(s.x, s.y, s.z);
      for (let i = 0; i < s.puffs; i++) {
        const u = i / (s.puffs - 1) - 0.5;
        const k = rng();
        c.copy(low).lerp(mid, k).lerp(top, Math.max(0, k - 0.5) * 1.2);
        const mat = new THREE.SpriteMaterial({
          map: textures[Math.floor(rng() * textures.length)],
          color: c.clone(),
          transparent: true,
          opacity: 0.55 + rng() * 0.3,
          depthWrite: false,
          fog: true,
        });
        const sp = new THREE.Sprite(mat);
        const w = s.size * (0.8 + rng() * 0.7);
        sp.scale.set(w * 1.6, w * 0.7, 1);
        sp.position.set(u * s.len + (rng() - 0.5) * s.size * 0.4, (k - 0.5) * s.size * 0.25, (rng() - 0.5) * 6);
        g.add(sp);
      }
      const depth = Math.max(0, -s.z);
      this.banks.push({
        group: g,
        speed: 0.5 + (1 - Math.min(depth, 180) / 180) * 1.1 + rng() * 0.3,
        limit: 100 + depth * 0.8 + s.len,
      });
      this.group.add(g);
    }
  }

  update(dt: number): void {
    for (const b of this.banks) {
      b.group.position.x += b.speed * dt;
      if (b.group.position.x > b.limit) b.group.position.x = -b.limit;
    }
  }
}
