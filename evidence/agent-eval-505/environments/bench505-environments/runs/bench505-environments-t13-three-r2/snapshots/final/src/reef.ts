import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng, patchMaterial, ripple, terrainHeight } from './util';

const UP = new THREE.Vector3(0, 1, 0);

function setConstantColor(geo: THREE.BufferGeometry, factor: number): void {
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3).fill(factor);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/* ---------- seabed ---------- */

export function createSeabed(): THREE.Mesh {
  const size = 80;
  const seg = 340;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const rng = makeRng(7);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    const r = ripple(x, z);
    const grain = 0.94 + rng() * 0.06;
    const k = (0.82 + 0.18 * r) * grain;
    colors[i * 3] = 0.72 * k;
    colors[i * 3 + 1] = 0.64 * k;
    colors[i * 3 + 2] = 0.46 * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  patchMaterial(mat, { key: 'sand', caustic: 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}

/* ---------- rocks ---------- */

function makeRockGeometry(rng: () => number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const merged = mergeVertices(geo);
  const pos = merged.getAttribute('position');
  const a = rng() * 10;
  const b = rng() * 10;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
    const n =
      0.18 * Math.sin(v.x * 3.1 + a) * Math.sin(v.y * 2.7 + b) +
      0.1 * Math.sin(v.z * 6.3 + a * 2) * Math.sin(v.x * 5.1 + b);
    v.multiplyScalar(1 + n);
    pos.setXYZ(i, v.x, v.y, v.z);
    const c = 0.75 + 0.25 * Math.sin(v.y * 4 + a);
    colors[i * 3] = c;
    colors[i * 3 + 1] = c;
    colors[i * 3 + 2] = c;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  return merged;
}

export function createRocks(): THREE.Group {
  const group = new THREE.Group();
  const rng = makeRng(21);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6f7468,
    roughness: 0.95,
    vertexColors: true,
  });
  patchMaterial(mat, { key: 'rock', caustic: 0.25 });
  const geos = [makeRockGeometry(rng), makeRockGeometry(rng), makeRockGeometry(rng)];

  const add = (x: number, z: number, sx: number, sy: number, sz: number, gi: number) => {
    const m = new THREE.Mesh(geos[gi % geos.length], mat);
    m.position.set(x, terrainHeight(x, z) + sy * 0.25, z);
    m.scale.set(sx, sy, sz);
    m.rotation.y = rng() * Math.PI * 2;
    group.add(m);
  };
  add(0, 0, 1.5, 0.9, 1.3, 0);
  for (let i = 0; i < 22; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 1.8 + rng() * 6.5;
    const s = 0.25 + rng() * 0.5;
    add(Math.cos(ang) * rad, Math.sin(ang) * rad, s * 1.3, s * 0.8, s, i);
  }
  return group;
}

/* ---------- corals ---------- */

function branchingGeometry(rng: () => number, roots: number, maxLevel: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const grow = (origin: THREE.Vector3, dir: THREE.Vector3, len: number, radius: number, level: number) => {
    const g = new THREE.CylinderGeometry(radius * 0.72, radius, len, 6, 1, true);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    g.applyMatrix4(new THREE.Matrix4().compose(origin, q, new THREE.Vector3(1, 1, 1)));
    setConstantColor(g, 0.55 + 0.45 * (level / maxLevel));
    parts.push(g);
    if (level < maxLevel) {
      const end = origin.clone().addScaledVector(dir, len);
      const n = rng() < 0.4 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const nd = dir
          .clone()
          .add(new THREE.Vector3((rng() - 0.5) * 1.1, (rng() - 0.2) * 0.5, (rng() - 0.5) * 1.1))
          .normalize();
        nd.y += 0.2;
        nd.normalize();
        grow(end, nd, len * 0.74, radius * 0.7, level + 1);
      }
    }
  };
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + rng();
    const dir = new THREE.Vector3(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize();
    grow(new THREE.Vector3(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08), dir, 0.5, 0.08, 0);
  }
  return mergeGeometries(parts, false);
}

function brainGeometry(rng: () => number): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, 5);
  base.deleteAttribute('uv');
  base.deleteAttribute('normal');
  const geo = mergeVertices(base);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const a = rng() * 20;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const warp = 1.6 * Math.sin(v.y * 7 + a) + 1.2 * Math.sin(v.z * 6 - a);
    const f = Math.sin(v.x * 15 + warp + Math.sin(v.z * 9 + a) * 1.5);
    const ridge = Math.abs(f);
    const r = 1 - 0.07 * (1 - ridge);
    pos.setXYZ(i, v.x * r, Math.max(v.y * 0.75 * r, -0.15), v.z * r);
    const c = 0.6 + 0.4 * ridge;
    colors[i * 3] = c;
    colors[i * 3 + 1] = c;
    colors[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function tubeGeometry(rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.1 + rng() * 0.38;
    const h = 0.5 + rng() * 0.8;
    const r = 0.07 + rng() * 0.05;
    const tube = new THREE.CylinderGeometry(r, r * 0.8, h, 12, 1, true);
    setConstantColor(tube, 1);
    const cap = new THREE.CircleGeometry(r * 0.88, 12);
    cap.rotateX(-Math.PI / 2);
    cap.translate(0, h - 0.04, 0);
    setConstantColor(cap, 0.18);
    const g = mergeGeometries([tube, cap], false);
    g.translate(0, h / 2, 0);
    const lean = new THREE.Quaternion().setFromEuler(
      new THREE.Euler((rng() - 0.5) * 0.35, 0, (rng() - 0.5) * 0.35),
    );
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d),
        lean,
        new THREE.Vector3(1, 1, 1),
      ),
    );
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}

function tableGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.12, 0.2, 0.6, 8, 1, true);
  stem.translate(0, 0.3, 0);
  setConstantColor(stem, 0.6);
  const top = new THREE.CylinderGeometry(1.1, 0.25, 0.3, 28, 3, false);
  const p = top.getAttribute('position');
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const ang = Math.atan2(z, x);
    const rr = Math.hypot(x, z);
    const w = 1 + 0.08 * Math.sin(ang * 9) * Math.min(1, rr);
    p.setXYZ(i, x * w, p.getY(i) + 0.05 * Math.sin(ang * 5 + rr * 4) * rr, z * w);
    const c = 0.7 + 0.3 * Math.min(1, rr);
    colors[i * 3] = c;
    colors[i * 3 + 1] = c;
    colors[i * 3 + 2] = c;
  }
  top.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  top.translate(0, 0.72, 0);
  return mergeGeometries([stem, top], false);
}

function makeFanTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d context unavailable');
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  const cx = 128;
  const cy = 250;
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12 - 0.5) * 2.3;
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * 235, cy + Math.sin(a) * 235);
    g.stroke();
  }
  g.lineWidth = 6;
  for (let r = 50; r <= 230; r += 36) {
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2 - 1.15, -Math.PI / 2 + 1.15);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function fanGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1.7, 1.7, 12, 12);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i) + 0.85;
    p.setXYZ(i, x, y, 0.18 * Math.sin(x * 3.2) * y);
  }
  g.computeVertexNormals();
  return g;
}

export function createCorals(): THREE.Group {
  const group = new THREE.Group();
  const rng = makeRng(99);
  const fanTex = makeFanTexture();
  const fanGeo = fanGeometry();

  const solidMat = (color: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.75,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    patchMaterial(m, { key: 'coral', caustic: 0.3 });
    return m;
  };

  const place = (obj: THREE.Object3D, x: number, z: number, s: number, y?: number) => {
    obj.position.set(x, y ?? terrainHeight(x, z) - 0.03, z);
    obj.scale.setScalar(s);
    obj.rotation.y = rng() * Math.PI * 2;
    group.add(obj);
  };

  const branching = (x: number, z: number, s: number, color: number, y?: number) => {
    const m = new THREE.Mesh(branchingGeometry(rng, 3, 4), solidMat(color));
    place(m, x, z, s, y);
  };
  branching(0.1, 0.1, 0.9, 0xffa048, terrainHeight(0, 0) + 0.95);
  branching(-1.9, 1.3, 1.3, 0xff7a3d);
  branching(2.8, -1.4, 1.1, 0xe0409a);
  branching(-3.8, -2.8, 1.0, 0xf2d23c);
  branching(1.2, 4.0, 1.2, 0x8a63e0);
  branching(4.8, 2.6, 0.9, 0xff9aa8);

  const brain = (x: number, z: number, s: number, color: number) => {
    const m = new THREE.Mesh(brainGeometry(rng), solidMat(color));
    place(m, x, z, s, terrainHeight(x, z) + 0.35 * s);
  };
  brain(0.9, -2.4, 1.0, 0x8fbf4a);
  brain(-2.8, 3.2, 0.9, 0xd6a86a);
  brain(4.0, 0.2, 0.8, 0xe07a8a);
  brain(-0.8, 2.4, 0.6, 0x4fb8a8);
  brain(-5.6, 0.8, 1.1, 0xb8c24a);

  const fan = (x: number, z: number, s: number, color: number) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      map: fanTex,
      alphaTest: 0.3,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    patchMaterial(mat, { key: 'fan', caustic: 0.25, swayAmp: 0.1 });
    const m = new THREE.Mesh(fanGeo, mat);
    m.frustumCulled = false;
    place(m, x, z, s);
  };
  fan(-4.7, -0.6, 1.4, 0xb04ad0);
  fan(2.0, -4.0, 1.3, 0xe0384a);
  fan(-1.2, -4.8, 1.1, 0xf08a30);
  fan(5.2, -1.2, 1.0, 0xd04aa0);

  const tube = (x: number, z: number, s: number, color: number) => {
    const m = new THREE.Mesh(tubeGeometry(rng), solidMat(color));
    place(m, x, z, s);
  };
  tube(2.0, 1.1, 1.0, 0xf2c43a);
  tube(-2.4, -1.3, 1.1, 0x4a7fe0);
  tube(3.8, -3.4, 1.0, 0xe8603a);
  tube(-0.2, 5.0, 0.9, 0x38b8d8);

  const table = new THREE.Mesh(tableGeometry(), solidMat(0x9ab86a));
  place(table, -5.6, -3.0, 1.3);
  const table2 = new THREE.Mesh(tableGeometry(), solidMat(0xd0a060));
  place(table2, 5.8, 4.0, 1.0);

  return group;
}

/* ---------- seaweed and anemones ---------- */

export function createPlants(): THREE.Group {
  const group = new THREE.Group();
  const rng = makeRng(1234);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();

  // Seaweed blades
  const bladeGeo = new THREE.PlaneGeometry(1, 1, 1, 8);
  const bp = bladeGeo.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i) + 0.5;
    bp.setXYZ(i, bp.getX(i) * 0.16 * (1 - 0.7 * y), y, 0);
  }
  bladeGeo.computeVertexNormals();
  const clusters = 11;
  const perCluster = 24;
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
  patchMaterial(bladeMat, { key: 'weed', caustic: 0.2, swayAmp: 0.4 });
  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, clusters * perCluster);
  blades.frustumCulled = false;
  let bi = 0;
  for (let c = 0; c < clusters; c++) {
    const ca = rng() * Math.PI * 2;
    const cr = 2.5 + rng() * 6;
    const cx = Math.cos(ca) * cr;
    const cz = Math.sin(ca) * cr;
    const hue = 0.22 + rng() * 0.1;
    for (let k = 0; k < perCluster; k++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * 0.55;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const h = 0.9 + rng() * 1.3;
      e.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.02, z), q, new THREE.Vector3(1.3, h, 1));
      blades.setMatrixAt(bi, m4);
      col.setHSL(hue + rng() * 0.05, 0.55, 0.28 + rng() * 0.12);
      blades.setColorAt(bi, col);
      bi++;
    }
  }
  group.add(blades);

  // Anemones
  const tentGeo = new THREE.CylinderGeometry(0.008, 0.03, 0.5, 5, 5, true);
  tentGeo.translate(0, 0.25, 0);
  const anemones = [
    { x: 1.0, z: -0.9, hue: 0.92 },
    { x: -1.6, z: -2.4, hue: 0.07 },
    { x: 3.4, z: 2.0, hue: 0.78 },
    { x: -3.4, z: 0.8, hue: 0.95 },
    { x: 0.2, z: 3.2, hue: 0.12 },
    { x: -0.6, z: -3.4, hue: 0.85 },
  ];
  const perAnem = 36;
  const tentMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.6,
    side: THREE.DoubleSide,
    emissive: 0x200818,
  });
  patchMaterial(tentMat, { key: 'tent', caustic: 0.2, swayAmp: 1.1 });
  const tents = new THREE.InstancedMesh(tentGeo, tentMat, anemones.length * perAnem);
  tents.frustumCulled = false;
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x884466, roughness: 0.8 });
  patchMaterial(baseMat, { key: 'abase', caustic: 0.2 });
  let ti = 0;
  for (const an of anemones) {
    const y0 = terrainHeight(an.x, an.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.2, 14), baseMat);
    base.position.set(an.x, y0 + 0.05, an.z);
    group.add(base);
    for (let k = 0; k < perAnem; k++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * 0.27;
      const tilt = 0.15 + d * 1.6 + rng() * 0.2;
      e.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
      q.setFromEuler(e);
      const s = 0.7 + rng() * 0.6;
      m4.compose(
        new THREE.Vector3(an.x + Math.cos(a) * d, y0 + 0.12, an.z + Math.sin(a) * d),
        q,
        new THREE.Vector3(1, s, 1),
      );
      tents.setMatrixAt(ti, m4);
      col.setHSL(an.hue + (rng() - 0.5) * 0.05, 0.7, 0.55 + rng() * 0.15);
      tents.setColorAt(ti, col);
      ti++;
    }
  }
  group.add(tents);

  return group;
}
