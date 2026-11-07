import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addSway, groundY, makeRand, timeU } from './common';

function setGradient(g: THREE.BufferGeometry, lo: THREE.Color, hi: THREE.Color, yMax: number): void {
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(lo).lerp(hi, Math.min(Math.max(pos.getY(i) / yMax, 0), 1));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export function buildSeaweed(): THREE.InstancedMesh {
  const rand = makeRand(5);
  const g = new THREE.PlaneGeometry(0.16, 1, 1, 7);
  g.translate(0, 0.5, 0);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * (1 - 0.75 * pos.getY(i)));
  setGradient(g, new THREE.Color(0x0e3d1c), new THREE.Color(0x8ab83a), 1);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  addSway(m, 0.32);

  const clumps: { x: number; z: number; n: number; s: number }[] = [];
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2.5 + Math.pow(rand(), 0.8) * 8.5;
    clumps.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, n: 8 + Math.floor(rand() * 10), s: 0.8 + rand() * 1.3 });
  }
  const total = clumps.reduce((s, c) => s + c.n, 0);
  const im = new THREE.InstancedMesh(g, m, total);
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let k = 0;
  for (const c of clumps) {
    for (let i = 0; i < c.n; i++) {
      const x = c.x + (rand() - 0.5) * 1.2;
      const z = c.z + (rand() - 0.5) * 1.2;
      d.position.set(x, groundY(x, z) - 0.03, z);
      d.rotation.set(0, rand() * Math.PI, 0);
      d.scale.set(0.8 + rand() * 0.7, c.s * (0.6 + rand() * 0.8), 1);
      d.updateMatrix();
      im.setMatrixAt(k, d.matrix);
      col.setHSL(0.25 + rand() * 0.1, 0.55, 0.45 + rand() * 0.15);
      im.setColorAt(k, col);
      k++;
    }
  }
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.frustumCulled = false;
  return im;
}

export function buildAnemones(): THREE.Group {
  const rand = makeRand(9);
  const group = new THREE.Group();
  const tg = new THREE.CylinderGeometry(0.012, 0.032, 0.5, 5, 4);
  tg.translate(0, 0.25, 0);
  setGradient(tg, new THREE.Color(0xa0206a), new THREE.Color(0xffd0f0), 0.5);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  addSway(m, 1.3);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x8a2a68, roughness: 0.7 });

  const spots: [number, number, number][] = [
    [-0.9, 0.4, 1.2],
    [2.0, -1.6, 1.0],
    [-3.2, -0.3, 1.3],
    [0.3, 2.2, 1.0],
    [4.2, 0.6, 1.2],
    [-1.8, -2.6, 1.1],
    [2.4, 4.6, 1.2],
    [-5.5, 2.0, 1.4],
  ];
  for (const [x, z, s] of spots) {
    const per = 46;
    const im = new THREE.InstancedMesh(tg, m, per);
    const d = new THREE.Object3D();
    for (let i = 0; i < per; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 0.16;
      d.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      d.rotation.set(0, 0, 0);
      d.rotateY(-a);
      d.rotateZ(-(0.15 + (r / 0.16) * 0.7 + rand() * 0.2));
      d.scale.setScalar(0.7 + rand() * 0.5);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.frustumCulled = false;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.22, 14), baseMat);
    stalk.position.y = 0.05;
    const holder = new THREE.Group();
    holder.add(stalk, im);
    holder.position.set(x, groundY(x, z) - 0.04, z);
    holder.scale.setScalar(s);
    group.add(holder);
  }
  return group;
}

/* ------------------------------ fish ------------------------------ */

function fishGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.5, 14, 10);
  body.scale(0.28, 0.42, 1);
  const tail = new THREE.ConeGeometry(0.24, 0.4, 4);
  tail.rotateX(Math.PI / 2);
  tail.scale(0.12, 1, 1);
  tail.translate(0, 0, -0.65);
  const dorsal = new THREE.ConeGeometry(0.12, 0.3, 3);
  dorsal.scale(0.15, 1, 1.6);
  dorsal.translate(0, 0.3, 0.02);
  const parts = [body, tail, dorsal];
  for (const p of parts) {
    const pos = p.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      // darker back, pale belly
      const t = Math.min(Math.max(pos.getY(i) / 0.4 * 0.5 + 0.5, 0), 1);
      const v = 1.15 - 0.55 * t;
      col[i * 3] = v;
      col[i * 3 + 1] = v;
      col[i * 3 + 2] = v;
    }
    p.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('fish merge failed');
  return g;
}

function fishMesh(count: number, speed: number): THREE.InstancedMesh {
  const g = fishGeometry();
  const phase = new Float32Array(count);
  const r = makeRand(count * 31 + 7);
  for (let i = 0; i < count; i++) phase[i] = r() * 6.28;
  g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.25 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeU;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aPhase;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float back = clamp(-position.z + 0.1, 0.0, 1.0);
          transformed.x += sin(uTime * ${speed.toFixed(2)} + aPhase - position.z * 4.0) * 0.14 * back * back;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'fish' + speed.toFixed(2);
  const im = new THREE.InstancedMesh(g, m, count);
  im.frustumCulled = false;
  return im;
}

export interface Fish {
  school: THREE.InstancedMesh;
  big: THREE.InstancedMesh;
  update(t: number): void;
}

export function buildFish(): Fish {
  const SCHOOL = 48;
  const rand = makeRand(21);
  const school = fishMesh(SCHOOL, 11);
  const offs: THREE.Vector3[] = [];
  const ph: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < SCHOOL; i++) {
    const u = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.6, rand() - 0.5).multiplyScalar(4.2);
    offs.push(u);
    ph.push(rand() * 6.28, rand() * 6.28, rand() * 6.28);
    const blue = rand() < 0.25;
    if (blue) c.setRGB(0.25 + rand() * 0.1, 0.55, 1.0);
    else c.setRGB(1.0, 0.7 + rand() * 0.2, 0.1 + rand() * 0.1);
    school.setColorAt(i, c);
  }
  if (school.instanceColor) school.instanceColor.needsUpdate = true;

  const big = fishMesh(4, 6);
  // [colour, scale xyz, centre xz, radii, height, bob, angular speed, phase]
  const bigDefs = [
    { col: [1.0, 0.45, 0.05], sc: [1.0, 1.0, 1.0], cx: 0, cz: 0, rx: 8.0, rz: 6.0, y: 2.2, w: 0.2, p: 0 },
    { col: [0.1, 0.3, 1.0], sc: [0.8, 1.5, 0.9], cx: 1, cz: -1, rx: 5.5, rz: 7.5, y: 1.6, w: -0.16, p: 2 },
    { col: [0.85, 0.95, 1.0], sc: [1.3, 1.3, 1.5], cx: -2, cz: 1, rx: 9.0, rz: 4.5, y: 3.4, w: 0.12, p: 4 },
    { col: [1.0, 0.9, 0.15], sc: [0.9, 1.7, 0.9], cx: 0, cz: 1, rx: 4.0, rz: 4.0, y: 1.5, w: -0.27, p: 1 },
  ];
  bigDefs.forEach((b, i) => big.setColorAt(i, c.setRGB(b.col[0], b.col[1], b.col[2])));
  if (big.instanceColor) big.instanceColor.needsUpdate = true;

  const d = new THREE.Object3D();
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();

  const schoolPos = (i: number, t: number, out: THREE.Vector3): void => {
    const cx = 6.5 * Math.sin(t * 0.17) + 2 * Math.sin(t * 0.41 + 1);
    const cz = 5.5 * Math.cos(t * 0.13) + 1.5 * Math.cos(t * 0.37);
    const cy = 2.9 + 0.7 * Math.sin(t * 0.23);
    const o = offs[i];
    out.set(
      cx + o.x + 0.5 * Math.sin(t * 0.8 + ph[i * 3]),
      cy + o.y + 0.25 * Math.sin(t * 0.6 + ph[i * 3 + 1]),
      cz + o.z + 0.5 * Math.cos(t * 0.7 + ph[i * 3 + 2]),
    );
  };

  const bigPos = (i: number, t: number, out: THREE.Vector3): void => {
    const b = bigDefs[i];
    const a = b.w * t + b.p;
    const x = b.cx + b.rx * Math.cos(a);
    const z = b.cz + b.rz * Math.sin(a);
    out.set(x, groundY(x, z) + b.y + 0.4 * Math.sin(t * 0.4 + b.p), z);
  };

  const aim = (s: number, ix: number, im: THREE.InstancedMesh, sx: number, sy: number, sz: number): void => {
    d.position.copy(p0);
    d.lookAt(p1);
    d.scale.set(sx * s, sy * s, sz * s);
    d.updateMatrix();
    im.setMatrixAt(ix, d.matrix);
  };

  return {
    school,
    big,
    update(t: number) {
      for (let i = 0; i < SCHOOL; i++) {
        schoolPos(i, t, p0);
        schoolPos(i, t + 0.15, p1);
        aim(0.42, i, school, 1, 1, 1);
      }
      school.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < bigDefs.length; i++) {
        bigPos(i, t, p0);
        bigPos(i, t + 0.15, p1);
        const b = bigDefs[i];
        aim(1.0, i, big, b.sc[0], b.sc[1], b.sc[2]);
      }
      big.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ------------------- bubbles and drifting particles ------------------- */

function dotTexture(ring: boolean): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
  if (ring) {
    gr.addColorStop(0, 'rgba(200,255,255,0.05)');
    gr.addColorStop(0.7, 'rgba(210,255,255,0.25)');
    gr.addColorStop(0.9, 'rgba(255,255,255,0.95)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 64, 64);
  if (ring) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(22, 22, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Particles {
  bubbles: THREE.Points;
  snow: THREE.Points;
  update(t: number): void;
}

export function buildParticles(): Particles {
  const rand = makeRand(33);
  const TOP = 11;

  const NB = 90;
  const vents: [number, number][] = [
    [-1.5, 0.8],
    [2.8, -1.2],
    [0.5, 3.0],
    [-3.5, -2.2],
    [4.2, 2.0],
  ];
  const bx = new Float32Array(NB);
  const bz = new Float32Array(NB);
  const by = new Float32Array(NB);
  const bs = new Float32Array(NB);
  const bp = new Float32Array(NB);
  const bpos = new Float32Array(NB * 3);
  for (let i = 0; i < NB; i++) {
    const v = vents[i % vents.length];
    bx[i] = v[0] + (rand() - 0.5) * 0.4;
    bz[i] = v[1] + (rand() - 0.5) * 0.4;
    by[i] = rand() * TOP;
    bs[i] = 0.35 + rand() * 0.5;
    bp[i] = rand() * 6.28;
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  const bubbles = new THREE.Points(
    bg,
    new THREE.PointsMaterial({
      map: dotTexture(true),
      size: 0.3,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    }),
  );
  bubbles.frustumCulled = false;

  const NS = 320;
  const sp = new Float32Array(NS * 3);
  const sb = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) {
    sb[i * 3] = (rand() - 0.5) * 36;
    sb[i * 3 + 1] = rand() * TOP;
    sb[i * 3 + 2] = (rand() - 0.5) * 36;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(
    sg,
    new THREE.PointsMaterial({
      map: dotTexture(false),
      size: 0.13,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
      color: 0xbfffee,
    }),
  );
  snow.frustumCulled = false;

  return {
    bubbles,
    snow,
    update(t: number) {
      for (let i = 0; i < NB; i++) {
        const y = (by[i] + t * bs[i]) % TOP;
        const wob = 0.12 * (1 + y * 0.1);
        bpos[i * 3] = bx[i] + Math.sin(t * 1.7 + bp[i] + y) * wob;
        bpos[i * 3 + 1] = groundY(bx[i], bz[i]) + 0.4 + y;
        bpos[i * 3 + 2] = bz[i] + Math.cos(t * 1.5 + bp[i] + y) * wob;
      }
      bg.getAttribute('position').needsUpdate = true;
      for (let i = 0; i < NS; i++) {
        const x = sb[i * 3] + Math.sin(t * 0.15 + i) * 0.6 + t * 0.12;
        const wrap = (v: number): number => ((((v + 18) % 36) + 36) % 36) - 18;
        sp[i * 3] = wrap(x);
        sp[i * 3 + 1] = 0.3 + ((sb[i * 3 + 1] + t * 0.05 + 100 * TOP) % TOP);
        sp[i * 3 + 2] = sb[i * 3 + 2] + Math.cos(t * 0.12 + i * 1.3) * 0.5;
      }
      sg.getAttribute('position').needsUpdate = true;
    },
  };
}
