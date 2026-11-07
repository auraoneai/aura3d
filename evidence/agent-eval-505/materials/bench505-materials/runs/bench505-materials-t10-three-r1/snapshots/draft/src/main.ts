import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

declare global {
  interface Window {
    __TASK_STATE__: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

const W = 640;
const H = 360;
const canvas = document.getElementById('app') as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

RectAreaLightUniformsLib.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9bbbe);

/* ---------- procedural studio environment (reflection source) ---------- */
function buildEnvironment(): THREE.Texture {
  const env = new THREE.Scene();
  const face = (v: number): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v * 1.02), side: THREE.BackSide });
  // order: +x, -x, +y, -y, +z, -z
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 24, 40), [
    face(0.22), face(0.22), face(0.12), face(0.5), face(0.2), face(0.3),
  ]);
  room.position.y = 8;
  env.add(room);

  const panel = (w: number, h: number, intensity: number, pos: THREE.Vector3, tint = 0xffffff): void => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide });
    m.toneMapped = false;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.copy(pos);
    mesh.lookAt(0, 1, 0);
    env.add(mesh);
  };
  panel(14, 9, 7, new THREE.Vector3(-13, 9, 8)); // key softbox
  panel(8, 8, 2.2, new THREE.Vector3(14, 6, 6), 0xdde8ff); // fill
  panel(18, 2.5, 5, new THREE.Vector3(0, 8, -14)); // back strip
  panel(12, 12, 3, new THREE.Vector3(0, 17, 0)); // overhead
  panel(2, 10, 4, new THREE.Vector3(10, 6, -10)); // rim strip

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  return rt.texture;
}
scene.environment = buildEnvironment();
scene.environmentIntensity = 0.7;

/* ---------- curved seamless floor / backdrop ---------- */
function buildCyc(): THREE.Mesh {
  const R = 3.5;
  const zBack = -3.5;
  const prof: [number, number][] = []; // [y, z]
  prof.push([0, 16], [0, zBack]);
  const N = 28;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * Math.PI * 0.5;
    prof.push([R - R * Math.cos(t), zBack - R * Math.sin(t)]);
  }
  prof.push([R + 14, zBack - R]);
  const X = 40;
  const pos: number[] = [];
  const idx: number[] = [];
  prof.forEach(([y, z]) => {
    pos.push(-X, y, z, X, y, z);
  });
  for (let i = 0; i < prof.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}
scene.add(buildCyc());

/* ---------- procedural textures ---------- */
function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

// deterministic random
let seed = 12345;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function weaveTextures(): { color: THREE.CanvasTexture; height: THREE.CanvasTexture } {
  const S = 256;
  const threads = 4;
  const cell = S / threads;
  const [cc, cx] = makeCanvas(S, S);
  const [hc, hx] = makeCanvas(S, S);
  const cImg = cx.createImageData(S, S);
  const hImg = hx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = Math.floor(x / cell);
      const j = Math.floor(y / cell);
      const warpOver = (i + j) % 2 === 0;
      const fx = (x % cell) / cell;
      const fy = (y % cell) / cell;
      // cylindrical thread profile across its width, tapered toward ends where it dives under
      const across = warpOver ? fx : fy;
      const along = warpOver ? fy : fx;
      const prof = Math.sin(across * Math.PI);
      const dive = 0.55 + 0.45 * Math.sin(along * Math.PI);
      let h = Math.pow(prof, 0.7) * dive;
      const fiber = rnd();
      h = h * 0.9 + fiber * 0.1;
      const shade = 0.25 + 0.75 * h;
      const n = 0.85 + 0.3 * rnd();
      const k = (y * S + x) * 4;
      cImg.data[k] = Math.min(255, 128 * shade * n);
      cImg.data[k + 1] = Math.min(255, 14 * shade * n);
      cImg.data[k + 2] = Math.min(255, 26 * shade * n);
      cImg.data[k + 3] = 255;
      const hv = Math.min(255, h * 255);
      hImg.data[k] = hv;
      hImg.data[k + 1] = hv;
      hImg.data[k + 2] = hv;
      hImg.data[k + 3] = 255;
    }
  }
  cx.putImageData(cImg, 0, 0);
  hx.putImageData(hImg, 0, 0);
  const color = new THREE.CanvasTexture(cc);
  color.colorSpace = THREE.SRGBColorSpace;
  const height = new THREE.CanvasTexture(hc);
  for (const t of [color, height]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(20, 10);
    t.anisotropy = 8;
    t.needsUpdate = true;
  }
  return { color, height };
}

function brushedTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) {
    const y = rnd() * h;
    const x = rnd() * w;
    const len = 40 + rnd() * 300;
    const v = Math.floor(90 + rnd() * 150);
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.15 + rnd() * 0.35})`;
    ctx.lineWidth = 0.5 + rnd() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
    if (x + len > w) {
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.lineTo(x + len - w, y);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  t.anisotropy = 8;
  return t;
}

function blobTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.3, 'rgba(0,0,0,0.65)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/* ---------- spheres ---------- */
const RADIUS = 0.8;
const SPACING = 2.2;
const sphereGeo = new THREE.SphereGeometry(RADIUS, 128, 64);

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0,
  roughness: 0.02,
  transmission: 1,
  thickness: 1.4,
  ior: 1.5,
  attenuationColor: new THREE.Color(0xbfeee4),
  attenuationDistance: 2.5,
  specularIntensity: 1,
  envMapIntensity: 1.6,
});
const glass = new THREE.Mesh(sphereGeo, glassMat);
glass.position.set(-SPACING, RADIUS, 0);

const brushed = brushedTexture();
const metalMat = new THREE.MeshPhysicalMaterial({
  color: 0xcdd1d6,
  metalness: 1,
  roughness: 0.42,
  roughnessMap: brushed,
  bumpMap: brushed,
  bumpScale: 0.6,
  anisotropy: 0.85,
  anisotropyRotation: Math.PI / 2,
  envMapIntensity: 1.5,
});
const metal = new THREE.Mesh(sphereGeo, metalMat);
metal.position.set(0, RADIUS, 0);

const weave = weaveTextures();
const fabricMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  map: weave.color,
  bumpMap: weave.height,
  bumpScale: 2.5,
  roughness: 1,
  metalness: 0,
  specularIntensity: 0,
  sheen: 1,
  sheenColor: new THREE.Color(0xff5a64),
  sheenRoughness: 0.4,
  envMapIntensity: 0.6,
});
const fabric = new THREE.Mesh(sphereGeo, fabricMat);
fabric.position.set(SPACING, RADIUS, 0);

for (const s of [glass, metal, fabric]) {
  s.castShadow = true;
  s.receiveShadow = false;
  scene.add(s);
}
fabric.receiveShadow = true;

// soft contact shadows
const blobTex = blobTexture();
function addBlob(x: number, size: number, opacity: number): void {
  const m = new THREE.MeshBasicMaterial({
    map: blobTex,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
  p.rotation.x = -Math.PI / 2;
  p.position.set(x, 0.005, 0);
  scene.add(p);
}
addBlob(-SPACING, 2.4, 0.5);
addBlob(0, 2.4, 0.85);
addBlob(SPACING, 2.4, 0.9);

/* ---------- lights ---------- */
const target = new THREE.Vector3(0, 0.7, 0);

const keyRect = new THREE.RectAreaLight(0xfff4e8, 4.5, 5, 4);
scene.add(keyRect);

const keySpot = new THREE.SpotLight(0xfff4e8, 55, 0, Math.PI / 5, 1, 2);
keySpot.castShadow = true;
keySpot.shadow.mapSize.set(2048, 2048);
keySpot.shadow.radius = 8;
keySpot.shadow.bias = -0.0004;
keySpot.shadow.normalBias = 0.02;
keySpot.shadow.camera.near = 2;
keySpot.shadow.camera.far = 30;
keySpot.target.position.copy(target);
scene.add(keySpot, keySpot.target);

const fillRect = new THREE.RectAreaLight(0xdfe8ff, 1.8, 4, 4);
fillRect.position.set(6.5, 3, 4.5);
fillRect.lookAt(0, 0.8, 0);
scene.add(fillRect);

const rimRect = new THREE.RectAreaLight(0xffffff, 9, 11, 1.6);
rimRect.position.set(0, 3.2, -3.0);
rimRect.lookAt(0, 0.8, 3);
scene.add(rimRect);

/* ---------- camera ---------- */
const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 100);
camera.position.set(3.0, 2.9, 9.2);
camera.lookAt(0, 0.75, 0);

/* ---------- animation ---------- */
window.__TASK_STATE__ = {
  spheres: [{ name: 'glass' }, { name: 'metal' }, { name: 'fabric' }],
  keyLightX: 0,
};

const KEY_Y = 5.2;
const KEY_Z = 5.5;
function updateKey(t: number): number {
  const x = Math.sin(t * 0.45) * 3.8 - 1.0;
  keyRect.position.set(x, KEY_Y, KEY_Z);
  keyRect.lookAt(target);
  keySpot.position.set(x, KEY_Y, KEY_Z);
  scene.environmentRotation.y = x * 0.06;
  return x;
}

let first = true;
function frame(now: number): void {
  const t = now / 1000;
  window.__TASK_STATE__.keyLightX = updateKey(t);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
