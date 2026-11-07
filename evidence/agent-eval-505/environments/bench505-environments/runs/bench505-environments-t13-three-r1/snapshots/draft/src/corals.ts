import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addCaustics, groundY, makeRand, paint } from './common';

const coralMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
addCaustics(coralMat, 0.9);

function finish(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('merge failed');
  return merged;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

export function branchingCoral(seed: number, base: THREE.Color, tip: THREE.Color): THREE.Mesh {
  const rand = makeRand(seed);
  const parts: THREE.BufferGeometry[] = [];
  const maxDepth = 3;
  const up = new THREE.Vector3(0, 1, 0);

  const grow = (pos: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number): void => {
    const g = new THREE.CylinderGeometry(rad * 0.72, rad, len, 6, 1);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    g.translate(pos.x, pos.y, pos.z);
    paint(g, base.clone().lerp(tip, depth / maxDepth));
    parts.push(g);
    const end = pos.clone().addScaledVector(dir, len * 0.95);
    if (depth === maxDepth) {
      const s = new THREE.SphereGeometry(rad * 0.85, 6, 5);
      s.translate(end.x, end.y, end.z);
      paint(s, tip);
      parts.push(s);
      return;
    }
    const n = rand() < 0.5 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const d = dir
        .clone()
        .add(new THREE.Vector3(rand() - 0.5, rand() * 0.2, rand() - 0.5).multiplyScalar(1.3))
        .add(new THREE.Vector3(0, 0.3, 0))
        .normalize();
      grow(end, d, len * 0.78, rad * 0.68, depth + 1);
    }
  };

  const roots = 5;
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + rand();
    const lean = 0.25 + rand() * 0.35;
    const dir = new THREE.Vector3(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize();
    grow(new THREE.Vector3(Math.cos(a) * 0.12, -0.05, Math.sin(a) * 0.12), dir, 0.55 + rand() * 0.2, 0.11, 0);
  }
  return mesh(finish(parts), coralMat);
}

export function brainCoral(seed: number, base: THREE.Color): THREE.Mesh {
  const rand = makeRand(seed);
  const ox = rand() * 10;
  const oz = rand() * 10;
  const g = new THREE.SphereGeometry(1, 72, 52);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const dark = base.clone().multiplyScalar(0.45);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const q = Math.sin(n.x * 7 + ox + Math.sin(n.y * 6 + oz) * 1.6 + Math.sin(n.z * 8) * 1.2) * Math.sin(n.z * 6 + n.y * 3 + oz);
    const groove = Math.pow(Math.abs(q), 0.5); // 0 in the groove, 1 on the ridge
    const r = 1 + 0.07 * groove;
    v.copy(n).multiplyScalar(r);
    v.y *= v.y < 0 ? 0.25 : 0.72;
    pos.setXYZ(i, v.x, v.y, v.z);
    c.copy(dark).lerp(base, 0.15 + 0.85 * groove);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return mesh(g, coralMat);
}

let fanTex: THREE.CanvasTexture | null = null;
function fanTexture(): THREE.CanvasTexture {
  if (fanTex) return fanTex;
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  // radial ribs
  ctx.lineWidth = 6;
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI + (i / 18) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124);
    ctx.stroke();
  }
  // cross links
  ctx.lineWidth = 4;
  for (let r = 30; r < 124; r += 20) {
    ctx.beginPath();
    ctx.arc(128, 128, r, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 120, Math.PI, Math.PI * 2);
  ctx.stroke();
  fanTex = new THREE.CanvasTexture(cv);
  fanTex.colorSpace = THREE.SRGBColorSpace;
  fanTex.anisotropy = 4;
  return fanTex;
}

export function fanCoral(color: number): THREE.Mesh {
  const g = new THREE.CircleGeometry(1, 56, 0, Math.PI);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, 0.12 * Math.sin(x * 3.2 + 0.5) + 0.08 * y * y);
  }
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({
    map: fanTexture(),
    color,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  addCaustics(m, 0.8);
  const o = mesh(g, m);
  o.scale.set(1.1, 1.3, 1.1);
  return o;
}

export function tubeCoral(seed: number, base: THREE.Color, rim: THREE.Color): THREE.Mesh {
  const rand = makeRand(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 8;
  const inside = new THREE.Color(0x1a0a18);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 0.4;
    const h = 0.5 + rand() * 0.75;
    const r = 0.07 + rand() * 0.06;
    const tube = new THREE.CylinderGeometry(r, r * 0.8, h, 12, 1);
    tube.translate(0, h / 2, 0);
    paint(tube, base.clone().lerp(rim, rand() * 0.5));
    const cap = new THREE.CircleGeometry(r * 0.72, 12);
    cap.rotateX(-Math.PI / 2);
    cap.translate(0, h + 0.004, 0);
    paint(cap, inside);
    const both = finish([tube, cap]);
    both.rotateX((rand() - 0.5) * 0.4);
    both.rotateZ((rand() - 0.5) * 0.4);
    both.translate(Math.cos(a) * d, -0.05, Math.sin(a) * d);
    parts.push(both);
  }
  return mesh(finish(parts), coralMat);
}

const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
addCaustics(rockMat, 0.7);

export function rock(seed: number, tint: THREE.Color): THREE.Mesh {
  const rand = makeRand(seed);
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.getAttribute('position');
  const key = new Map<string, number>();
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const p1 = rand() * 6;
  const p2 = rand() * 6;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let f = key.get(k);
    if (f === undefined) {
      f = 0.8 + 0.25 * Math.sin(v.x * 3 + p1) * Math.cos(v.z * 3 + p2) + 0.12 * Math.sin(v.y * 5 + p1 * 2);
      key.set(k, f);
    }
    v.multiplyScalar(f);
    v.y *= 0.65;
    pos.setXYZ(i, v.x, v.y, v.z);
    c.copy(tint).multiplyScalar(0.7 + 0.5 * (f - 0.6) + (rand() - 0.5) * 0.05);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return mesh(g, rockMat);
}

export function buildReef(): THREE.Group {
  const reef = new THREE.Group();
  const rand = makeRand(77);
  const C = (hex: number): THREE.Color => new THREE.Color(hex);

  const place = (o: THREE.Object3D, x: number, z: number, s: number, sink = 0.05): void => {
    o.position.set(x, groundY(x, z) - sink * s, z);
    o.scale.multiplyScalar(s);
    o.rotation.y = rand() * Math.PI * 2;
    reef.add(o);
  };

  // central rock base
  place(rock(1, C(0x6a6a62)), 0, 0, 1.5, 0.3);
  place(rock(2, C(0x77705f)), -2.3, 1.2, 0.9, 0.2);
  place(rock(3, C(0x5f6a66)), 3.0, -0.8, 1.0, 0.25);
  place(rock(4, C(0x6e6a60)), 1.0, 4.4, 0.7, 0.2);

  // branching
  place(branchingCoral(11, C(0xe0561f), C(0xffc07a)), 0, 0.1, 1.7, -0.35);
  place(branchingCoral(12, C(0xd0307a), C(0xffa0d0)), -3.2, 1.8, 1.3, 0);
  place(branchingCoral(13, C(0xc9b21c), C(0xf3ff7a)), 3.5, -2.0, 1.4, 0);
  place(branchingCoral(14, C(0x7a38c8), C(0xd7a0ff)), 1.5, 3.6, 1.1, 0);
  place(branchingCoral(15, C(0xd6302a), C(0xff9a70)), -2.5, -3.5, 1.2, 0);

  // brain
  place(brainCoral(21, C(0xc9a85a)), 2.2, 0.9, 0.85);
  place(brainCoral(22, C(0x4ea06a)), -1.4, -1.3, 0.75);
  place(brainCoral(23, C(0xd04a9a)), 4.6, 2.5, 0.95);
  place(brainCoral(24, C(0x6cb0a0)), -4.8, -0.6, 1.0);

  // fans
  place(fanCoral(0xb050e0), -1.2, 2.5, 1.2, 0.1);
  place(fanCoral(0xff4a3a), 1.2, -2.5, 1.3, 0.1);
  place(fanCoral(0xe040a0), -5.0, 3.0, 1.4, 0.1);
  place(fanCoral(0x8a60ff), 5.5, -0.5, 1.2, 0.1);

  // tubes
  place(tubeCoral(31, C(0xf0c020), C(0xfff080)), 3.0, 3.0, 1.1, 0);
  place(tubeCoral(32, C(0x3a70e0), C(0x80d0ff)), -3.6, -2.0, 1.2, 0);
  place(tubeCoral(33, C(0xf07820), C(0xffc060)), 0.6, -4.6, 1.0, 0);

  // scattered outer reef
  const palette = [0xe0561f, 0xd0307a, 0xc9b21c, 0x7a38c8, 0xd6302a, 0x3a9ae0, 0x40c070];
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() < 0.5 ? 7.5 + rand() * 3.5 : 15.5 + rand() * 6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const base = C(palette[Math.floor(rand() * palette.length)]);
    const tip = base.clone().lerp(C(0xffffff), 0.45);
    const t = i % 4;
    if (t === 0) place(branchingCoral(100 + i, base, tip), x, z, 1.2 + rand() * 0.9, 0);
    else if (t === 1) place(brainCoral(200 + i, base), x, z, 0.9 + rand() * 0.8);
    else if (t === 2) place(fanCoral(palette[Math.floor(rand() * palette.length)]), x, z, 1.2 + rand(), 0.1);
    else place(tubeCoral(300 + i, base, tip), x, z, 1.0 + rand() * 0.6, 0);
    if (rand() < 0.5) place(rock(400 + i, C(0x66675f)), x + 1.2, z - 0.8, 0.6 + rand() * 0.8, 0.2);
  }
  return reef;
}
