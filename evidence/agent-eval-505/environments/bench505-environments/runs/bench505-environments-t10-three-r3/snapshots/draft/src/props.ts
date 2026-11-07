import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { strataColor } from './terrain';

export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeBoulderGeometry(seed: number): BufferGeometry {
  let g: BufferGeometry = new IcosahedronGeometry(1, 4);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);
    const r =
      1 +
      0.2 * Math.sin(2.3 * x + seed) * Math.sin(2.1 * y + seed * 1.7) +
      0.13 * Math.sin(4.1 * z + seed * 0.6) * Math.sin(3.7 * x + 2) +
      0.05 * Math.sin(9 * y + 3 * seed) * Math.sin(8 * z + seed);
    pos.setXYZ(i, x * r, y * r, z * r);
    y = pos.getY(i);
    if (y < -0.55) pos.setY(i, -0.55);
  }
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  const p = g.getAttribute('position');
  const colors = new Float32Array(p.count * 3);
  const tmp: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < p.count; i++) {
    strataColor(p.getY(i) * 1.6 + seed * 3.1, tmp);
    const dark = 0.75;
    for (let q = 0; q < 3; q++) colors[i * 3 + q] = Math.pow(tmp[q] * dark, 2.2);
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}

export function makeShrubGeometry(seed: number): BufferGeometry {
  const rng = makeRng(seed);
  const parts: BufferGeometry[] = [];
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();

  const grow = (start: Vector3, dir: Vector3, len: number, radius: number, depth: number): void => {
    const g = new CylinderGeometry(radius * 0.55, radius, len, 5, 1);
    g.translate(0, len / 2, 0);
    q.setFromUnitVectors(up, dir);
    g.applyQuaternion(q);
    g.translate(start.x, start.y, start.z);
    parts.push(g);
    if (depth <= 0) return;
    const end = start.clone().addScaledVector(dir, len);
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const d = dir
        .clone()
        .add(new Vector3((rng() - 0.5) * 1.4, (rng() - 0.3) * 0.5, (rng() - 0.5) * 1.4))
        .normalize();
      grow(end, d, len * (0.62 + rng() * 0.15), radius * 0.62, depth - 1);
    }
  };

  const stems = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < stems; i++) {
    const d = new Vector3((rng() - 0.5) * 1.2, 1, (rng() - 0.5) * 1.2).normalize();
    grow(new Vector3(0, -0.05, 0), d, 0.35 + rng() * 0.15, 0.028, 3);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('shrub merge failed');
  return merged;
}

export function makeRockMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
}

export function makeShrubMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: 0x6a5240, roughness: 1, metalness: 0 });
}
