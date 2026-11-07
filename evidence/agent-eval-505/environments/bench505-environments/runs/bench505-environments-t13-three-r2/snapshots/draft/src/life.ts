import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng, patchMaterial, terrainHeight } from './util';

/* ---------- fish ---------- */

function fishGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(1, 16, 12);
  body.scale(0.28, 0.42, 0.9);
  {
    const p = body.getAttribute('position');
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const z = p.getZ(i);
      let k = 0.8 + 0.2 * (y / 0.42);
      const band = THREE.MathUtils.smoothstep(Math.sin(z * 6.5), 0.55, 0.85);
      k *= 1 - 0.5 * band;
      c[i * 3] = k;
      c[i * 3 + 1] = k;
      c[i * 3 + 2] = k;
    }
    body.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }

  const flat = (g: THREE.BufferGeometry, k: number) => {
    const n = g.getAttribute('position').count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(k), 3));
  };

  const tail = new THREE.ConeGeometry(0.4, 0.6, 4, 1, false);
  tail.rotateX(Math.PI / 2);
  tail.scale(0.12, 1, 1);
  tail.translate(0, 0, -1.2);
  flat(tail, 0.75);

  const dorsal = new THREE.ConeGeometry(0.3, 0.7, 3, 1, false);
  dorsal.scale(0.1, 0.7, 1.5);
  dorsal.translate(0, 0.4, -0.15);
  flat(dorsal, 0.7);

  return mergeGeometries([body, tail, dorsal], false);
}

export type PathFn = (t: number, out: THREE.Vector3) => void;

export interface FishGroup {
  mesh: THREE.InstancedMesh;
  update: (t: number) => void;
}

function makeFishMesh(count: number, geo: THREE.BufferGeometry, rng: () => number): THREE.InstancedMesh {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  patchMaterial(mat, { key: 'fish', caustic: 0.15, wag: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) phase[i] = rng() * Math.PI * 2;
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  return mesh;
}

const dummy = new THREE.Object3D();
const pA = new THREE.Vector3();
const pB = new THREE.Vector3();

function placeFish(mesh: THREE.InstancedMesh, i: number, a: THREE.Vector3, b: THREE.Vector3, scale: number): void {
  dummy.position.copy(a);
  dummy.lookAt(b);
  dummy.scale.setScalar(scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

export function createSchool(count: number): FishGroup {
  const rng = makeRng(555);
  const geo = fishGeometry();
  const mesh = makeFishMesh(count, geo, rng);
  const col = new THREE.Color();
  const palette = [0xffb830, 0xff7a2a, 0x40a8ff, 0xffe45a, 0xff9a60];
  const offsets: THREE.Vector3[] = [];
  const lags: number[] = [];
  const ph: number[][] = [];
  const scales: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = new THREE.Color(palette[Math.floor(rng() * 3.2)]);
    col.copy(base).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.08);
    mesh.setColorAt(i, col);
    const v = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.6, rng() - 0.5).multiplyScalar(3.2);
    offsets.push(v);
    lags.push(rng() * 0.9);
    ph.push([rng() * 6.28, rng() * 6.28, rng() * 6.28]);
    scales.push(0.15 + rng() * 0.04);
  }

  const centre = (t: number, out: THREE.Vector3) => {
    out.set(
      5.2 * Math.cos(0.27 * t) + 1.5 * Math.sin(0.6 * t),
      3.0 + 0.5 * Math.sin(0.33 * t),
      4.4 * Math.sin(0.27 * t + 0.5) + 1.0,
    );
  };
  const fishPos = (i: number, t: number, out: THREE.Vector3) => {
    centre(t - lags[i], out);
    const o = offsets[i];
    const p = ph[i];
    out.x += o.x + 0.5 * Math.sin(0.9 * t + p[0]);
    out.y += o.y + 0.25 * Math.sin(0.7 * t + p[1]);
    out.z += o.z + 0.5 * Math.sin(0.8 * t + p[2]);
    const minY = terrainHeight(out.x, out.z) + 2.0;
    if (out.y < minY) out.y = minY;
  };

  return {
    mesh,
    update: (t: number) => {
      for (let i = 0; i < count; i++) {
        fishPos(i, t, pA);
        fishPos(i, t + 0.1, pB);
        placeFish(mesh, i, pA, pB, scales[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

interface Loner {
  path: PathFn;
  scale: number;
  color: number;
}

export function createLoners(): FishGroup {
  const rng = makeRng(808);
  const geo = fishGeometry();
  const loners: Loner[] = [
    {
      path: (t, o) => o.set(8.5 * Math.cos(0.16 * t), 1.9 + 0.4 * Math.sin(0.4 * t), 6.5 * Math.sin(0.16 * t)),
      scale: 0.5,
      color: 0x2f6fe0,
    },
    {
      path: (t, o) =>
        o.set(4.8 * Math.cos(-0.21 * t + 2), 2.5 + 0.3 * Math.sin(0.5 * t), 3.8 * Math.sin(-0.21 * t + 2)),
      scale: 0.42,
      color: 0xffd02a,
    },
    {
      path: (t, o) => o.set(7.5 * Math.cos(0.12 * t + 1), 3.9 + 0.5 * Math.sin(0.35 * t), 5.5 * Math.sin(0.24 * t)),
      scale: 0.6,
      color: 0xe04a3a,
    },
    {
      path: (t, o) =>
        o.set(10.5 * Math.cos(-0.1 * t + 4), 1.6 + 0.3 * Math.sin(0.3 * t), 9 * Math.sin(-0.1 * t + 4)),
      scale: 0.75,
      color: 0x7fb0a8,
    },
  ];
  const mesh = makeFishMesh(loners.length, geo, rng);
  const col = new THREE.Color();
  loners.forEach((l, i) => mesh.setColorAt(i, col.set(l.color)));
  return {
    mesh,
    update: (t: number) => {
      loners.forEach((l, i) => {
        l.path(t, pA);
        l.path(t + 0.1, pB);
        const minY = terrainHeight(pA.x, pA.z) + 1.4;
        if (pA.y < minY) {
          pA.y = minY;
          pB.y = minY;
        }
        placeFish(mesh, i, pA, pB, l.scale);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ---------- bubbles and particles ---------- */

function bubbleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d context unavailable');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(220,255,255,0.08)');
  grad.addColorStop(0.75, 'rgba(220,255,255,0.25)');
  grad.addColorStop(0.92, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(22, 21, 4, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d context unavailable');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createBubbles(): { object: THREE.Points; update: (t: number) => void } {
  const rng = makeRng(31);
  const emitters = [
    [-1.2, 0.8],
    [2.6, -1.0],
    [-3.6, -2.6],
    [1.0, 3.8],
    [4.6, 2.4],
    [-2.0, -4.2],
  ];
  const per = 14;
  const n = emitters.length * per;
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const speed: number[] = [];
  const off: number[] = [];
  const ph: number[] = [];
  const spread: number[][] = [];
  for (let i = 0; i < n; i++) {
    speed.push(0.05 + rng() * 0.04);
    off.push(rng());
    ph.push(rng() * 6.28);
    spread.push([(rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5]);
  }
  const mat = new THREE.PointsMaterial({
    map: bubbleTexture(),
    size: 0.32,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const H = 11;
  return {
    object: pts,
    update: (t: number) => {
      for (let i = 0; i < n; i++) {
        const e = emitters[Math.floor(i / per)];
        const f = (t * speed[i] + off[i]) % 1;
        const y = terrainHeight(e[0], e[1]) + 0.4 + f * H;
        const wob = 0.12 + 0.25 * f;
        arr[i * 3] = e[0] + spread[i][0] + Math.sin(t * 1.3 + ph[i]) * wob;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = e[1] + spread[i][1] + Math.cos(t * 1.1 + ph[i]) * wob;
      }
      geo.getAttribute('position').needsUpdate = true;
    },
  };
}

export function createSnow(): { object: THREE.Points; update: (t: number) => void } {
  const rng = makeRng(77);
  const n = 220;
  const span = new THREE.Vector3(26, 9, 26);
  const base: number[] = [];
  const vel: number[] = [];
  for (let i = 0; i < n; i++) {
    base.push(rng() * span.x, rng() * span.y, rng() * span.z);
    vel.push((rng() - 0.5) * 0.15, 0.03 + rng() * 0.06, (rng() - 0.5) * 0.15);
  }
  const arr = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({
    map: softTexture(),
    size: 0.16,
    color: 0xd8fff0,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const wrap = (v: number, s: number) => ((v % s) + s) % s;
  return {
    object: pts,
    update: (t: number) => {
      for (let i = 0; i < n; i++) {
        arr[i * 3] = wrap(base[i * 3] + vel[i * 3] * t + Math.sin(t * 0.3 + i) * 0.3, span.x) - span.x / 2;
        arr[i * 3 + 1] = wrap(base[i * 3 + 1] + vel[i * 3 + 1] * t, span.y) + 0.3;
        arr[i * 3 + 2] = wrap(base[i * 3 + 2] + vel[i * 3 + 2] * t, span.z) - span.z / 2;
      }
      geo.getAttribute('position').needsUpdate = true;
    },
  };
}

/* ---------- light shafts and backdrop ---------- */

function beamTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2d context unavailable');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1;
      const bell = Math.exp(-u * u * 4.5);
      const fade = Math.pow(1 - y / (h - 1), 0.9);
      const idx = (y * w + x) * 4;
      img.data[idx] = 255;
      img.data[idx + 1] = 255;
      img.data[idx + 2] = 255;
      img.data[idx + 3] = Math.round(255 * bell * fade);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createBeams(): { object: THREE.Group; update: (t: number) => void } {
  const rng = makeRng(404);
  const group = new THREE.Group();
  const tex = beamTexture();
  const beams: { mat: THREE.MeshBasicMaterial; ph: number; base: number }[] = [];
  const geoCache = new Map<number, THREE.PlaneGeometry>();
  for (let i = 0; i < 8; i++) {
    const width = 2.5 + rng() * 2.5;
    const ang = rng() * Math.PI * 2;
    const rad = 2 + rng() * 9;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const base = 0.09 + rng() * 0.06;
    const ph = rng() * 6.28;
    const yaw = rng() * Math.PI;
    for (let k = 0; k < 2; k++) {
      const key = Math.round(width * 100);
      let geo = geoCache.get(key);
      if (!geo) {
        geo = new THREE.PlaneGeometry(width, 18);
        geo.translate(0, -9, 0);
        geoCache.set(key, geo);
      }
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: 0xa8ffe8,
        transparent: true,
        opacity: base,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.order = 'ZYX';
      m.rotation.z = 0.22;
      m.rotation.y = yaw + k * Math.PI * 0.5;
      m.position.set(x, 14, z);
      m.frustumCulled = false;
      group.add(m);
      beams.push({ mat, ph, base });
    }
  }
  return {
    object: group,
    update: (t: number) => {
      for (const b of beams) b.mat.opacity = b.base * (0.65 + 0.35 * Math.sin(t * 0.5 + b.ph));
    },
  };
}

export function createBackdrop(fogColor: THREE.Color): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uLow: { value: fogColor.clone() },
      uHigh: { value: new THREE.Color(0x4fd6d0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLow;
      uniform vec3 uHigh;
      varying vec3 vDir;
      void main() {
        float k = smoothstep(0.0, 0.75, vDir.y);
        gl_FragColor = vec4(mix(uLow, uHigh, k * 0.85), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}
