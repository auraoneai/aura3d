import * as THREE from 'three';
import { L, addBump, center, channel, halfWidth, height, visibility } from './terrain';
import { camU } from './camera';

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

type RGB = [number, number, number];

class Acc {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  shade: number[] = [];

  /** Append geometry. If `fixedShade` is null the sun visibility is computed per vertex. */
  add(
    geo: THREE.BufferGeometry,
    color: RGB,
    tab: Float32Array,
    fixedShade: number | null,
    vary = 0,
    rng?: () => number,
  ): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      this.pos.push(x, y, z);
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      const v = vary && rng ? 1 + (rng() - 0.5) * vary : 1;
      this.col.push(color[0] * v, color[1] * v, color[2] * v);
      this.shade.push(fixedShade === null ? visibility(tab, x, y, z) : fixedShade);
    }
    if (g !== geo) g.dispose();
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    geo.setAttribute('aShade', new THREE.BufferAttribute(new Float32Array(this.shade), 1));
    geo.computeBoundingSphere();
    return geo;
  }
}

export interface Boulder {
  x: number;
  y: number;
  z: number;
  r: number;
  seed: number;
}

const ZMIN = -940;
const ZMAX = 40;

/** Replicate a base position (z in [0, L)) over the generated mesh range. */
function copies(zb: number): number[] {
  const out: number[] = [];
  for (let m = 0; m < 3; m++) {
    const z = zb - L * m;
    if (z <= ZMAX && z >= ZMIN) out.push(z);
  }
  return out;
}

export function placeBoulders(): Boulder[] {
  const rng = mulberry32(1234);
  const list: Boulder[] = [];
  for (let i = 0; i < 150; i++) {
    const zb = rng() * L;
    const r = 0.4 + Math.pow(rng(), 3) * 2.8;
    const w = halfWidth(zb);
    const side = rng() < 0.5 ? -1 : 1;
    const near = rng() < 0.45;
    const u = near ? side * (w - 3 + rng() * 6) : (rng() * 2 - 1) * (w - 1);
    const seed = Math.floor(rng() * 1e6);
    if (Math.abs(u - camU(zb)) < r + 2.2) continue;
    for (const z of copies(zb)) {
      const x = center(z) + u;
      list.push({ x, y: height(u, z), z, r, seed });
    }
  }
  return list;
}

export function applyBoulderBumps(tab: Float32Array, boulders: Boulder[]): void {
  for (const b of boulders) addBump(tab, b.x, b.z, b.y, b.r, b.r * 0.75);
}

const ROCK_COLS: RGB[] = [
  [0.55, 0.28, 0.18],
  [0.66, 0.42, 0.28],
  [0.5, 0.3, 0.28],
  [0.72, 0.55, 0.38],
];

export function buildRocks(boulders: Boulder[], tab: Float32Array): THREE.BufferGeometry {
  const acc = new Acc();
  for (const b of boulders) {
    const rng = mulberry32(b.seed);
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const p = geo.getAttribute('position');
    const sy = 0.6 + rng() * 0.3;
    const sz = 1.0 + rng() * 0.2;
    const ph1 = rng() * 6.28;
    const ph2 = rng() * 6.28;
    const ph3 = rng() * 6.28;
    const rot = rng() * 6.28;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      const d = 1 + 0.22 * Math.sin(vx * 3.1 + ph1) * Math.sin(vy * 2.7 + ph2) + 0.12 * Math.sin(vz * 5 + ph3);
      const lx = vx * d * b.r;
      const ly = Math.max(vy * d * sy, -0.35 * sy) * b.r;
      const lz = vz * d * sz * b.r;
      const rx = lx * cr + lz * sr;
      const rz = -lx * sr + lz * cr;
      p.setXYZ(i, b.x + rx, b.y + 0.25 * sy * b.r + ly, b.z + rz);
    }
    geo.computeVertexNormals();
    const c = ROCK_COLS[Math.floor(rng() * ROCK_COLS.length)];
    acc.add(geo, c, tab, null, 0.25, rng);
    geo.dispose();
  }
  return acc.build();
}

export function buildShrubs(tab: Float32Array): THREE.BufferGeometry {
  const acc = new Acc();
  const up = new THREE.Vector3(0, 1, 0);
  const rng0 = mulberry32(777);

  const branch = (
    rng: () => number,
    M: THREE.Matrix4,
    col: RGB,
    shade: number,
    start: THREE.Vector3,
    dir: THREE.Vector3,
    len: number,
    r: number,
    depth: number,
  ): void => {
    const geo = new THREE.CylinderGeometry(r * 0.55, r, len, 4, 1, true);
    geo.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    geo.applyMatrix4(new THREE.Matrix4().compose(start, q, new THREE.Vector3(1, 1, 1)));
    geo.applyMatrix4(M);
    acc.add(geo, col, tab, shade, 0.3, rng);
    geo.dispose();
    if (depth > 0) {
      const kids = depth === 2 ? 3 : 2;
      for (let k = 0; k < kids; k++) {
        const t = 0.4 + rng() * 0.55;
        const ns = start.clone().addScaledVector(dir, len * t);
        const nd = dir
          .clone()
          .add(new THREE.Vector3(rng() - 0.5, rng() * 0.5 - 0.15, rng() - 0.5).multiplyScalar(1.6))
          .normalize();
        branch(rng, M, col, shade, ns, nd, len * 0.65, r * 0.6, depth - 1);
      }
    }
  };

  for (let i = 0; i < 130; i++) {
    const zb = rng0() * L;
    const ch = channel(zb);
    const w = halfWidth(zb);
    let u = ch + (rng0() - rng0()) * 12;
    if (Math.abs(u) > w + 1) u = (rng0() * 2 - 1) * w;
    const seed = Math.floor(rng0() * 1e6);
    const s = 0.8 + rng0() * 0.9;
    const rot = rng0() * 6.28;
    if (Math.abs(u - camU(zb)) < 1.6) continue;
    for (const z of copies(zb)) {
      const rng = mulberry32(seed);
      const x = center(z) + u;
      const y = height(u, z) - 0.05;
      const M = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromAxisAngle(up, rot),
        new THREE.Vector3(s, s, s),
      );
      const shade = visibility(tab, x, y + 0.5, z);
      const col: RGB = [0.3 + rng() * 0.08, 0.22 + rng() * 0.05, 0.16];
      const origin = new THREE.Vector3(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const ang = rng() * 6.28;
        const dir = new THREE.Vector3(Math.cos(ang) * 0.6, 0.8, Math.sin(ang) * 0.6).normalize();
        branch(rng, M, col, shade, origin, dir, 0.5 + rng() * 0.5, 0.06, 2);
      }
    }
  }
  return acc.build();
}
