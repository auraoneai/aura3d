import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { P, cl, camU, height, sunShadow } from './terrain';

function addBake(g: THREE.BufferGeometry, value: number): void {
  const n = g.getAttribute('position').count;
  g.setAttribute('bake', new THREE.BufferAttribute(new Float32Array(n).fill(value), 1));
}

/** Pick a floor position that stays clear of the camera's flight path. */
function pickSpot(rng: () => number, clearance: number): { u: number; z: number } {
  for (let tries = 0; tries < 50; tries++) {
    const z = 8 + rng() * (P - 16);
    const u = (rng() * 2 - 1) * 11;
    if (Math.abs(u - camU(z)) > clearance) return { u, z };
  }
  return { u: 11, z: 8 + rng() * (P - 16) };
}

export function buildBoulders(rng: () => number, count: number): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, 2);
  base.deleteAttribute('uv');
  const parts: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const r = 0.35 + 3.2 * Math.pow(rng(), 3);
    const { u, z } = pickSpot(rng, r + 3);
    const g = base.clone();
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const seed = rng() * 100;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const y = pos.getY(k);
      const zz = pos.getZ(k);
      const d =
        1 + 0.18 * Math.sin(x * 2.3 + seed) * Math.cos(y * 2.9 + seed * 1.7) + 0.1 * Math.sin(zz * 5.1 + x * 3.7 + seed * 0.6);
      pos.setXYZ(k, x * d, y * d, zz * d);
    }
    g.computeVertexNormals();

    const tint = 0.75 + rng() * 0.45;
    const redness = rng();
    const colors = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const shade = 0.7 + 0.3 * (pos.getY(k) * 0.5 + 0.5);
      color.setRGB(
        (0.5 + 0.1 * redness) * tint * shade,
        (0.33 + 0.02 * redness) * tint * shade,
        0.25 * tint * shade,
        THREE.SRGBColorSpace,
      );
      colors[k * 3] = color.r;
      colors[k * 3 + 1] = color.g;
      colors[k * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const sx = r * (0.9 + rng() * 0.5);
    const sy = r * (0.55 + rng() * 0.35);
    const sz = r * (0.9 + rng() * 0.5);
    const gy = height(u, z);
    const wx = cl(z) + u;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(wx, gy + sy * 0.4, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3)),
      new THREE.Vector3(sx, sy, sz),
    );
    g.applyMatrix4(m);
    addBake(g, sunShadow(wx, gy + sy * 0.9, z));
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('boulder merge failed');
  parts.forEach((p) => p.dispose());
  return merged;
}

function shrubVariant(rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  const branch = (start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number): void => {
    const g = new THREE.CylinderGeometry(rad * 0.62, rad, len, 3, 1);
    g.translate(0, len / 2, 0);
    g.applyMatrix4(
      new THREE.Matrix4().compose(start, new THREE.Quaternion().setFromUnitVectors(up, dir), new THREE.Vector3(1, 1, 1)),
    );
    g.deleteAttribute('uv');
    parts.push(g);
    if (depth <= 0) return;
    const end = start.clone().addScaledVector(dir, len);
    for (let k = 0; k < 2; k++) {
      const d2 = dir
        .clone()
        .add(new THREE.Vector3(rng() - 0.5, (rng() - 0.3) * 0.6, rng() - 0.5).multiplyScalar(1.3))
        .normalize();
      branch(end, d2, len * (0.62 + rng() * 0.2), rad * 0.6, depth - 1);
    }
  };

  const trunks = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < trunks; i++) {
    const az = rng() * Math.PI * 2;
    const el = 0.45 + rng() * 0.9;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    branch(new THREE.Vector3(0, 0, 0), dir, 0.5 + rng() * 0.3, 0.032, 3);
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('shrub merge failed');
  parts.forEach((p) => p.dispose());
  return merged;
}

export function buildShrubs(rng: () => number, count: number): THREE.BufferGeometry {
  const variants = [shrubVariant(rng), shrubVariant(rng), shrubVariant(rng), shrubVariant(rng)];
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const { u, z } = pickSpot(rng, 2.5);
    const g = variants[i % variants.length].clone();
    const s = 0.7 + rng() * 1.1;
    const wx = cl(z) + u;
    const gy = height(u, z);
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(wx, gy - 0.05, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2),
        new THREE.Vector3(s, s * (0.8 + rng() * 0.5), s),
      ),
    );
    addBake(g, sunShadow(wx, gy + 0.6 * s, z));
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('shrub merge failed');
  parts.forEach((p) => p.dispose());
  variants.forEach((v) => v.dispose());
  return merged;
}
