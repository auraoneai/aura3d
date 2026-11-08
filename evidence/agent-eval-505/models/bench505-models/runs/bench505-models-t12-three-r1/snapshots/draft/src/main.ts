import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- utilities

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

const params = new URLSearchParams(location.search);
const parsedSeed = Number(params.get('seed'));
const SEED = params.has('seed') && Number.isFinite(parsedSeed) ? Math.floor(parsedSeed) : 1337;
const rng = mulberry32(SEED);
const rand = (a: number, b: number): number => a + (b - a) * rng();
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---------------------------------------------------------------- terrain

const MOUND_H = 1.4;
function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const m = 1 - THREE.MathUtils.smoothstep(r, 3.2, 8.5);
  return (MOUND_H + 0.07 * Math.sin(x * 1.3 + 0.5) * Math.sin(z * 1.1)) * m;
}

// ---------------------------------------------------------------- seasons

interface Season {
  leaves: string[];
  fallen: string[];
  grass: string;
  skyTop: string;
  skyBottom: string;
}
const SEASONS: Season[] = [
  {
    leaves: ['#1f6b2a', '#3c9a3a', '#6dbb45', '#2a8a55'],
    fallen: ['#6dbb45', '#c9b43a', '#3c9a3a'],
    grass: '#4f9a3a',
    skyTop: '#3d8fe0',
    skyBottom: '#c3e6f6',
  },
  {
    leaves: ['#c0392b', '#e67e22', '#f1c40f', '#8e3b1e'],
    fallen: ['#c0392b', '#e67e22', '#f1c40f'],
    grass: '#8a9a3a',
    skyTop: '#5a8fc4',
    skyBottom: '#f5dfc0',
  },
  {
    leaves: ['#8fd16a', '#b5e48c', '#f4a6c0', '#5fb85a'],
    fallen: ['#f4a6c0', '#b5e48c', '#ffd1dc'],
    grass: '#6fc04a',
    skyTop: '#58a8f0',
    skyBottom: '#d8f0fb',
  },
];
const SEASON_NAMES = ['summer', 'autumn', 'spring'];
let seasonIndex = Math.max(0, SEASON_NAMES.indexOf(params.get('season') ?? 'summer'));

// ---------------------------------------------------------------- renderer / scene

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SEASONS[seasonIndex].skyBottom, 35, 130);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 600);
const LOOK_AT = new THREE.Vector3(0, 5.3, 0);

// sky dome
const skyUniforms = {
  top: { value: new THREE.Color(SEASONS[seasonIndex].skyTop) },
  bottom: { value: new THREE.Color(SEASONS[seasonIndex].skyBottom) },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(300, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 bottom;
      varying vec3 vDir;
      void main() {
        float h = smoothstep(-0.05, 0.65, vDir.y);
        gl_FragColor = vec4(mix(bottom, top, h), 1.0);
        #include <colorspace_fragment>
      }`,
  }),
);
sky.renderOrder = -1;
scene.add(sky);

// lights
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x55703a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
sun.position.set(9, 15, 6);
sun.target.position.set(0, 2.5, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -13;
sc.right = 13;
sc.top = 13;
sc.bottom = -13;
sc.near = 2;
sc.far = 45;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ground: mound mesh + big flat skirt
const grassMat = new THREE.MeshStandardMaterial({
  color: SEASONS[seasonIndex].grass,
  vertexColors: true,
  roughness: 1,
  flatShading: false,
});
{
  const size = 26;
  const seg = 130;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 2.1) * Math.sin(z * 1.7 + 1) + 0.25 * Math.sin(x * 5.3 + z * 4.1);
    const rr = Math.hypot(x, z);
    const v = (0.82 + 0.2 * n) * (1 - 0.1 * THREE.MathUtils.smoothstep(rr, 6, 13));
    col[i * 3] = v;
    col[i * 3 + 1] = v;
    col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mound = new THREE.Mesh(g, grassMat);
  mound.receiveShadow = true;
  scene.add(mound);

  const skirtGeo = new THREE.CircleGeometry(400, 48);
  skirtGeo.rotateX(-Math.PI / 2);
  const sCol = new Float32Array(skirtGeo.attributes.position.count * 3).fill(0.78);
  skirtGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const skirt = new THREE.Mesh(skirtGeo, grassMat);
  skirt.position.y = -0.05;
  skirt.receiveShadow = true;
  scene.add(skirt);
}

// grass blades
const bladeMat = new THREE.MeshStandardMaterial({ color: SEASONS[seasonIndex].grass, roughness: 1 });
{
  const count = 3500;
  const geo = new THREE.ConeGeometry(0.045, 0.42, 3);
  geo.translate(0, 0.21, 0);
  const inst = new THREE.InstancedMesh(geo, bladeMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.9 + Math.sqrt(rng()) * 9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    e.set(rand(-0.3, 0.3), rand(0, 6.28), rand(-0.3, 0.3));
    q.setFromEuler(e);
    const s = rand(0.6, 1.5);
    m.compose(new THREE.Vector3(x, heightAt(x, z) - 0.02, z), q, new THREE.Vector3(s, s * rand(0.8, 1.4), s));
    inst.setMatrixAt(i, m);
    const v = rand(0.75, 1.15);
    inst.setColorAt(i, c.setRGB(v, v, v));
  }
  inst.receiveShadow = true;
  scene.add(inst);
}

// ---------------------------------------------------------------- tree generation

interface Branch {
  pts: THREE.Vector3[];
  radii: number[];
  level: number;
  isRoot: boolean;
}
const branches: Branch[] = []; // trunk, limbs, twigs
const roots: Branch[] = [];

interface ClumpSpec {
  pos: THREE.Vector3;
  size: number;
}
const clumpSpecs: ClumpSpec[] = [];

const UP = new THREE.Vector3(0, 1, 0);

function makeBranch(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  length: number,
  r0: number,
  level: number,
  nSeg: number,
  wob: number,
  trop: number,
): Branch {
  const pts: THREE.Vector3[] = [origin.clone()];
  const radii: number[] = [];
  const d = dir.clone().normalize();
  const step = length / nSeg;
  for (let i = 0; i < nSeg; i++) {
    d.x += rand(-1, 1) * wob;
    d.y += rand(-1, 1) * wob * 0.7 + trop;
    d.z += rand(-1, 1) * wob;
    d.normalize();
    pts.push(pts[i].clone().addScaledVector(d, step));
  }
  for (let i = 0; i <= nSeg; i++) {
    const s = i / nSeg;
    let r: number;
    if (level === 0) r = r0 * (1 - 0.62 * s) * (1 + 0.55 * Math.exp(-14 * s));
    else r = r0 * (1 - 0.88 * s);
    radii.push(Math.max(r, 0.014));
  }
  return { pts, radii, level, isRoot: false };
}

function tangentAt(b: Branch, i: number): THREE.Vector3 {
  const a = b.pts[Math.max(0, i - 1)];
  const c = b.pts[Math.min(b.pts.length - 1, i + 1)];
  return c.clone().sub(a).normalize();
}

function childDir(t: THREE.Vector3, angle: number, az: number): THREE.Vector3 {
  const a = Math.abs(t.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
  const u = a.clone().cross(t).normalize();
  const v = t.clone().cross(u).normalize();
  return t
    .clone()
    .multiplyScalar(Math.cos(angle))
    .addScaledVector(u, Math.cos(az) * Math.sin(angle))
    .addScaledVector(v, Math.sin(az) * Math.sin(angle));
}

const deg = (d: number): number => (d * Math.PI) / 180;

function addTwigs(parent: Branch, level: number): void {
  // level 3 twigs on a level 2 branch
  const n = parent.pts.length - 1;
  const count = rng() < 0.65 ? 2 : 1;
  for (let k = 0; k < count; k++) {
    const t = k === 0 ? rand(0.45, 0.6) : rand(0.8, 0.95);
    const idx = Math.round(t * n);
    const dir = childDir(tangentAt(parent, idx), deg(rand(35, 60)), rand(0, Math.PI * 2));
    const tw = makeBranch(parent.pts[idx], dir, rand(0.9, 1.35), Math.max(parent.radii[idx] * 0.62, 0.025), level, 4, 0.3, 0.1);
    branches.push(tw);
    clumpSpecs.push({ pos: tw.pts[tw.pts.length - 1].clone().add(new THREE.Vector3(0, 0.15, 0)), size: rand(0.65, 1.0) });
  }
}

function addMinorBranches(limb: Branch, minT: number, azBase: number): void {
  const n = limb.pts.length - 1;
  const ts = [0.3, 0.58, 0.85].filter((t) => t >= minT - 0.01);
  if (minT > 0.5) ts.splice(0, ts.length, 0.7, 0.88, 0.99);
  ts.forEach((t0, k) => {
    const t = Math.min(0.99, t0 + rand(-0.04, 0.04));
    const idx = Math.round(t * n);
    const dir = childDir(tangentAt(limb, idx), deg(rand(40, 65)), azBase + k * 2.4 + rand(-0.4, 0.4));
    const len = 2.1 * (1 - 0.35 * t) * rand(0.85, 1.15);
    const b = makeBranch(limb.pts[idx], dir, len, Math.max(limb.radii[idx] * 0.6, 0.04), 2, 5, 0.25, 0.1);
    branches.push(b);
    clumpSpecs.push({ pos: b.pts[b.pts.length - 1].clone().add(new THREE.Vector3(0, 0.2, 0)), size: rand(0.9, 1.3) });
    addTwigs(b, 3);
  });
}

const BASE_Y = heightAt(0, 0);
const TRUNK_LEN = 5.2;
const trunk = makeBranch(
  new THREE.Vector3(0, BASE_Y - 0.3, 0),
  new THREE.Vector3(0.05, 1, 0.03),
  TRUNK_LEN,
  0.62,
  0,
  16,
  0.1,
  0.0,
);
branches.push(trunk);
const TN = trunk.pts.length - 1;

// swing limb (kept near-horizontal)
const swingAz = rand(0, Math.PI * 2);
let swingLimb: Branch;
{
  const idx = Math.round(0.46 * TN);
  const dir = childDir(tangentAt(trunk, idx), deg(82), swingAz);
  swingLimb = makeBranch(trunk.pts[idx], dir, 4.8, trunk.radii[idx] * 0.55, 1, 9, 0.12, 0.02);
  branches.push(swingLimb);
  clumpSpecs.push({ pos: swingLimb.pts[swingLimb.pts.length - 1].clone().add(new THREE.Vector3(0, 0.2, 0)), size: 1.3 });
  addMinorBranches(swingLimb, 0.7, rand(0, 6));
}

// ordinary limbs
{
  const N = 8;
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const t = 0.34 + 0.6 * f;
    const idx = Math.round(t * TN);
    const az = swingAz + ((i + 1) * Math.PI * 2) / (N + 1) + rand(-0.25, 0.25);
    const ang = deg(lerp(72, 36, f) + rand(-6, 6));
    const dir = childDir(tangentAt(trunk, idx), ang, az);
    const len = lerp(4.3, 2.6, f) * rand(0.9, 1.1);
    const limb = makeBranch(trunk.pts[idx], dir, len, trunk.radii[idx] * 0.58, 1, 8, 0.2, 0.1);
    branches.push(limb);
    clumpSpecs.push({ pos: limb.pts[limb.pts.length - 1].clone().add(new THREE.Vector3(0, 0.25, 0)), size: rand(1.1, 1.5) });
    addMinorBranches(limb, 0, az);
  }
}
// leader crown
clumpSpecs.push({ pos: trunk.pts[TN].clone().add(new THREE.Vector3(0, 0.5, 0)), size: 1.6 });

// roots
const ROOT_COUNT = 7;
for (let i = 0; i < ROOT_COUNT; i++) {
  const az = (i / ROOT_COUNT) * Math.PI * 2 + rand(-0.25, 0.25);
  const L = rand(2.4, 3.4);
  const r0 = rand(0.38, 0.5);
  const n = 10;
  const pts: THREE.Vector3[] = [];
  const radii: number[] = [];
  for (let k = 0; k <= n; k++) {
    const s = k / n;
    const a = az + Math.sin(s * 5 + i) * 0.18;
    const d = 0.25 + s * L;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const r = Math.max(r0 * (1 - s) * (1 - s) + 0.03, 0.03) ;
    radii.push(r);
    pts.push(new THREE.Vector3(x, heightAt(x, z) + r * 0.35 + 0.35 * Math.exp(-s * 6) - s * s * 0.12, z));
  }
  roots.push({ pts, radii, level: 0, isRoot: true });
}

// ---------------------------------------------------------------- tree meshes

const BARK = ['#5b3f2c', '#6a4a34', '#7a5a40', '#8a6a4c'];
function buildTubes(list: Branch[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const base = new THREE.Color();
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const side = new THREE.Vector3();
  const bin = new THREE.Vector3();
  for (const b of list) {
    const radial = b.level === 0 ? 16 : b.level === 1 ? 10 : 6;
    const ridgeAmt = b.level === 0 ? 0.07 : 0.02;
    base.set(BARK[Math.min(b.level, 3)]);
    const startIdx = positions.length / 3;
    let nPrev = new THREE.Vector3();
    for (let i = 0; i < b.pts.length; i++) {
      const t = tangentAt(b, i);
      if (i === 0) {
        const a = Math.abs(t.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
        nPrev = a.clone().cross(t).normalize();
      } else {
        nPrev = nPrev.clone().addScaledVector(t, -nPrev.dot(t)).normalize();
      }
      side.copy(nPrev);
      bin.copy(t).cross(side).normalize();
      const ringShade = 0.85 + 0.25 * rng();
      for (let j = 0; j < radial; j++) {
        const th = (j / radial) * Math.PI * 2;
        const ridge = 1 + ridgeAmt * (Math.sin(th * 5 + i * 0.5) + 0.6 * Math.sin(th * 3 - i * 0.3));
        nrm.copy(side).multiplyScalar(Math.cos(th)).addScaledVector(bin, Math.sin(th));
        p.copy(b.pts[i]).addScaledVector(nrm, b.radii[i] * ridge);
        positions.push(p.x, p.y, p.z);
        normals.push(nrm.x, nrm.y, nrm.z);
        const stripe = 0.9 + 0.1 * Math.sin(th * 7 + i);
        const sh = ringShade * stripe;
        colors.push(base.r * sh, base.g * sh, base.b * sh);
      }
    }
    for (let i = 0; i < b.pts.length - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = startIdx + i * radial + j;
        const bb = startIdx + i * radial + ((j + 1) % radial);
        const c = a + radial;
        const d = bb + radial;
        indices.push(a, c, bb, bb, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  return g;
}

const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
const treeGroup = new THREE.Group();
scene.add(treeGroup);
const woodMesh = new THREE.Mesh(buildTubes(branches), barkMat);
woodMesh.castShadow = true;
woodMesh.receiveShadow = true;
treeGroup.add(woodMesh);
const rootMesh = new THREE.Mesh(buildTubes(roots), barkMat);
rootMesh.castShadow = true;
rootMesh.receiveShadow = true;
treeGroup.add(rootMesh);

// ---------------------------------------------------------------- foliage

const leafMats: THREE.MeshStandardMaterial[] = SEASONS[0].leaves.map(
  () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }),
);
const clumps: THREE.Mesh[] = [];
const clumpPhase: number[] = [];

function buildClumpGeometry(seedOffset: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blobs = 3;
  for (let b = 0; b < blobs; b++) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const radius = b === 0 ? 1 : rand(0.55, 0.75);
    const off = b === 0 ? new THREE.Vector3() : new THREE.Vector3(rand(-1, 1), rand(-0.4, 0.7), rand(-1, 1)).normalize().multiplyScalar(rand(0.55, 0.8));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n =
        Math.sin(x * 3.1 + seedOffset + y * 1.7) * Math.sin(z * 2.9 + x * 1.3 + seedOffset * 0.7) +
        0.5 * Math.sin(y * 5.3 + z * 4.1 + seedOffset);
      const k = radius * (1 + 0.14 * n);
      pos.setXYZ(i, x * k + off.x, y * k * 0.9 + off.y, z * k + off.z);
      const shade = 0.72 + 0.36 * (y * 0.5 + 0.5) + 0.05 * n;
      col[i * 3] = shade;
      col[i * 3 + 1] = shade;
      col[i * 3 + 2] = shade;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('clump merge failed');
  merged.computeVertexNormals();
  return merged;
}

clumpSpecs.forEach((spec, i) => {
  const toneIdx = i % 4 === 3 && rng() < 0.5 ? Math.floor(rng() * 4) : Math.floor(rng() * 4);
  const mesh = new THREE.Mesh(buildClumpGeometry(rand(0, 100)), leafMats[toneIdx]);
  mesh.position.copy(spec.pos);
  mesh.scale.setScalar(spec.size);
  mesh.rotation.y = rand(0, Math.PI * 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  treeGroup.add(mesh);
  clumps.push(mesh);
  clumpPhase.push(rand(0, Math.PI * 2));
});

// ---------------------------------------------------------------- details

// hollow
{
  const idx = Math.round(0.2 * TN);
  const az = swingAz + Math.PI * 0.85;
  const n = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const c = trunk.pts[idx];
  const r = trunk.radii[idx];
  const g = new THREE.Group();
  const hole = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 20, 14),
    new THREE.MeshStandardMaterial({ color: '#120a06', roughness: 1 }),
  );
  hole.scale.set(1, 1.5, 0.5);
  hole.position.z = -0.1;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.29, 0.075, 8, 24),
    new THREE.MeshStandardMaterial({ color: '#4a3223', roughness: 1 }),
  );
  rim.scale.set(1, 1.5, 1);
  rim.position.z = 0.0;
  g.add(hole, rim);
  g.position.copy(c).addScaledVector(n, r * 1.0);
  g.lookAt(g.position.clone().add(n));
  g.traverse((o) => {
    o.castShadow = true;
  });
  treeGroup.add(g);

  // a small knot higher up
  const kIdx = Math.round(0.52 * TN);
  const kaz = swingAz + Math.PI * 1.6;
  const kn = new THREE.Vector3(Math.cos(kaz), 0, Math.sin(kaz));
  const knot = new THREE.Group();
  const bump = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshStandardMaterial({ color: '#4a3223', roughness: 1 }));
  bump.scale.set(1, 1, 0.6);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: '#20130b', roughness: 1 }));
  eye.scale.set(1, 1, 0.5);
  eye.position.z = 0.05;
  knot.add(bump, eye);
  knot.position.copy(trunk.pts[kIdx]).addScaledVector(kn, trunk.radii[kIdx] * 0.97);
  knot.lookAt(knot.position.clone().add(kn));
  treeGroup.add(knot);
}

// rope swing
const swingPivot = new THREE.Group();
const swingAxis = new THREE.Vector3();
{
  const nS = swingLimb.pts.length - 1;
  const idx = Math.round(0.58 * nS);
  const P = swingLimb.pts[idx].clone();
  const rLimb = swingLimb.radii[idx];
  const t = tangentAt(swingLimb, idx);
  swingAxis.set(t.x, 0, t.z).normalize();
  const side = new THREE.Vector3(-swingAxis.z, 0, swingAxis.x);
  const hang = P.y - rLimb * 0.6;
  const L = hang - heightAt(P.x, P.z) - 0.75;
  const ropeMat = new THREE.MeshStandardMaterial({ color: '#c8a870', roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.9 });
  swingPivot.position.set(P.x, hang, P.z);
  for (const sgn of [-1, 1]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, L, 6), ropeMat);
    rope.position.set(side.x * 0.3 * sgn, -L / 2, side.z * 0.3 * sgn);
    rope.castShadow = true;
    swingPivot.add(rope);
  }
  // loops around limb
  const loop = new THREE.Mesh(new THREE.TorusGeometry(rLimb * 1.05, 0.03, 6, 14), ropeMat);
  loop.position.set(0, rLimb * 0.6, 0);
  loop.lookAt(loop.position.clone().add(swingAxis));
  swingPivot.add(loop);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.07, 0.24), woodMat);
  plank.position.set(0, -L - 0.03, 0);
  plank.rotation.y = Math.atan2(-side.z, side.x);
  plank.castShadow = true;
  plank.receiveShadow = true;
  swingPivot.add(plank);
  scene.add(swingPivot);
}

// mushrooms
{
  const capMat = new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.6 });
  const stemMat = new THREE.MeshStandardMaterial({ color: '#efe3c8', roughness: 0.8 });
  const dotMat = new THREE.MeshStandardMaterial({ color: '#fff7ea', roughness: 0.7 });
  const spots: Array<[number, number, number]> = [
    [2.0, 0.9, 0.2],
    [2.35, 1.15, 0.13],
    [1.9, 1.05, 0.1],
    [-1.8, 2.2, 0.16],
    [-2.1, 2.45, 0.1],
  ];
  for (const [x, z, s] of spots) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.35, s * 0.45, s * 1.6, 10), stemMat);
    stem.position.y = s * 0.8;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(s * 1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.scale.y = 0.75;
    cap.position.y = s * 1.5;
    g.add(stem, cap);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.9;
      const pr = s * 0.7;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(s * 0.17, 8, 6), dotMat);
      dot.scale.y = 0.4;
      const ph = 0.5 + 0.5 * (k % 2);
      dot.position.set(Math.cos(a) * pr * ph, s * 1.5 + Math.sqrt(Math.max(0, 1 - ph * ph * 0.5)) * s * 0.9 * 0.72, Math.sin(a) * pr * ph);
      g.add(dot);
    }
    g.position.set(x, heightAt(x, z) - 0.02, z);
    g.rotation.z = rand(-0.1, 0.1);
    g.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    scene.add(g);
  }
}

// fallen leaves
const fallenMats = SEASONS[0].fallen.map(
  () => new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }),
);
{
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.5);
  shape.bezierCurveTo(0.45, -0.25, 0.4, 0.3, 0, 0.55);
  shape.bezierCurveTo(-0.4, 0.3, -0.45, -0.25, 0, -0.5);
  const geo = new THREE.ShapeGeometry(shape, 6);
  geo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 40; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(1.4, 7);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const m = new THREE.Mesh(geo, fallenMats[i % fallenMats.length]);
    const s = rand(0.18, 0.32);
    m.scale.setScalar(s);
    m.position.set(x, heightAt(x, z) + 0.03 + rng() * 0.03, z);
    m.rotation.y = rand(0, Math.PI * 2);
    m.rotation.x = rand(-0.12, 0.12);
    m.receiveShadow = true;
    m.castShadow = true;
    scene.add(m);
  }
}

// ---------------------------------------------------------------- seasons update

const curLeaf = SEASONS[seasonIndex].leaves.map((c) => new THREE.Color(c));
const curFallen = SEASONS[seasonIndex].fallen.map((c) => new THREE.Color(c));
const curGrass = new THREE.Color(SEASONS[seasonIndex].grass);
const tmpColor = new THREE.Color();
const tgtLeaf = curLeaf.map((c) => c.clone());
const tgtFallen = curFallen.map((c) => c.clone());
const tgtGrass = curGrass.clone();
const tgtTop = new THREE.Color(SEASONS[seasonIndex].skyTop);
const tgtBottom = new THREE.Color(SEASONS[seasonIndex].skyBottom);

function setSeason(i: number): void {
  seasonIndex = ((i % SEASONS.length) + SEASONS.length) % SEASONS.length;
  const s = SEASONS[seasonIndex];
  s.leaves.forEach((c, k) => tgtLeaf[k].set(c));
  s.fallen.forEach((c, k) => tgtFallen[k].set(c));
  tgtGrass.set(s.grass);
  tgtTop.set(s.skyTop);
  tgtBottom.set(s.skyBottom);
}

function applySeason(k: number): void {
  curLeaf.forEach((c, i) => {
    c.lerp(tgtLeaf[i], k);
    leafMats[i].color.copy(c);
  });
  curFallen.forEach((c, i) => {
    c.lerp(tgtFallen[i], k);
    fallenMats[i].color.copy(c);
  });
  curGrass.lerp(tgtGrass, k);
  grassMat.color.copy(curGrass);
  bladeMat.color.copy(tmpColor.copy(curGrass).multiplyScalar(1.15));
  skyUniforms.top.value.lerp(tgtTop, k);
  skyUniforms.bottom.value.lerp(tgtBottom, k);
  (scene.fog as THREE.Fog).color.copy(skyUniforms.bottom.value);
}
applySeason(1);

window.addEventListener('keydown', (e) => {
  if (e.key === 's' || e.key === 'S') setSeason(seasonIndex + 1);
});
canvas.addEventListener('click', () => setSeason(seasonIndex + 1));

// ---------------------------------------------------------------- loop

const ORBIT_RADIUS = 21;
const CAM_Y = 6.2;
let firstFrame = true;
let last = performance.now();
let elapsed = 0;
const qSwing = new THREE.Quaternion();

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  elapsed += dt;

  const a = 0.6 + elapsed * 0.1;
  camera.position.set(Math.sin(a) * ORBIT_RADIUS, CAM_Y, Math.cos(a) * ORBIT_RADIUS);
  camera.lookAt(LOOK_AT);
  sky.position.copy(camera.position);

  applySeason(1 - Math.exp(-dt * 3));

  for (let i = 0; i < clumps.length; i++) {
    const m = clumps[i];
    m.rotation.z = Math.sin(elapsed * 0.9 + clumpPhase[i]) * 0.03;
    m.rotation.x = Math.sin(elapsed * 0.7 + clumpPhase[i] * 1.7) * 0.03;
  }
  swingPivot.quaternion.copy(qSwing.setFromAxisAngle(swingAxis, Math.sin(elapsed * 1.3) * 0.1));

  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    const w = window as unknown as Record<string, unknown>;
    w.__TASK_STATE__ = {
      ready: true,
      branchCount: branches.length,
      foliageClumpCount: clumps.length,
      seed: SEED,
    };
    w.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
