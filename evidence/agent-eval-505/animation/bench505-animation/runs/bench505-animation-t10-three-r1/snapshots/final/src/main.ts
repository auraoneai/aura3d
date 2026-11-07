import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const BG = 0xc9ccd2;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 12, 26);

const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);
camera.position.set(4.6, 3.6, 6.2);
camera.lookAt(0, 0.8, 0);

// Lighting
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8d96, 1.1));
const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
key.position.set(-3, 7, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4;
key.shadow.camera.right = 4;
key.shadow.camera.top = 4;
key.shadow.camera.bottom = -4;
key.shadow.camera.near = 1;
key.shadow.camera.far = 20;
key.shadow.radius = 5;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdde6ff, 0.6);
fill.position.set(5, 3, -2);
scene.add(fill);

// Ground with a tile texture that scrolls to match the planted feet
const TILE = 256;
const tc = document.createElement('canvas');
tc.width = TILE;
tc.height = TILE;
const g = tc.getContext('2d')!;
g.fillStyle = '#d7d9de';
g.fillRect(0, 0, TILE, TILE);
g.strokeStyle = 'rgba(120,125,135,0.35)';
g.lineWidth = 3;
g.strokeRect(0, 0, TILE, TILE);
g.fillStyle = 'rgba(120,125,135,0.35)';
g.beginPath();
g.arc(TILE / 2, TILE / 2, 5, 0, Math.PI * 2);
g.fill();
const groundTex = new THREE.CanvasTexture(tc);
groundTex.colorSpace = THREE.SRGBColorSpace;
groundTex.wrapS = THREE.RepeatWrapping;
groundTex.wrapT = THREE.RepeatWrapping;
groundTex.anisotropy = 8;
const GROUND_SIZE = 40;
groundTex.repeat.set(GROUND_SIZE, GROUND_SIZE);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Spider
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b2a26, roughness: 0.5, metalness: 0.1 });
const markMat = new THREE.MeshStandardMaterial({ color: 0xb8402a, roughness: 0.5 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x2c2220, roughness: 0.55, metalness: 0.1 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0xc9532f, roughness: 0.45 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.2 });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const spider = new THREE.Group(); // facing +X
scene.add(spider);

const body = new THREE.Group();
spider.add(body);

const sphereGeo = new THREE.SphereGeometry(1, 32, 20);
const abdomen = mesh(sphereGeo, bodyMat);
abdomen.scale.set(0.95, 0.65, 0.7);
abdomen.position.set(-0.75, 0.1, 0);
body.add(abdomen);
const stripe = mesh(sphereGeo, markMat);
stripe.scale.set(0.45, 0.2, 0.3);
stripe.position.set(-0.75, 0.66, 0);
body.add(stripe);
const thorax = mesh(sphereGeo, bodyMat);
thorax.scale.set(0.55, 0.38, 0.45);
thorax.position.set(0.25, 0, 0);
body.add(thorax);
const head = mesh(sphereGeo, bodyMat);
head.scale.set(0.3, 0.26, 0.3);
head.position.set(0.72, -0.02, 0);
body.add(head);
for (const sz of [-1, 1]) {
  const eye = mesh(sphereGeo, eyeMat);
  eye.scale.setScalar(0.07);
  eye.position.set(0.97, 0.08, sz * 0.12);
  body.add(eye);
  const eye2 = mesh(sphereGeo, eyeMat);
  eye2.scale.setScalar(0.05);
  eye2.position.set(0.9, 0.18, sz * 0.07);
  body.add(eye2);
}

const segGeo1 = new THREE.CylinderGeometry(0.075, 0.095, 1, 12);
const segGeo2 = new THREE.CylinderGeometry(0.03, 0.065, 1, 12);
const UP = new THREE.Vector3(0, 1, 0);

interface Leg {
  side: number;
  hip: THREE.Vector3; // body-local
  dir: THREE.Vector3; // horizontal outward unit
  group: number;
  thigh: THREE.Mesh;
  shin: THREE.Mesh;
  knee: THREE.Mesh;
  foot: THREE.Mesh;
}

const L1 = 1.0;
const L2 = 1.45;
const REACH = 1.95; // horizontal hip-to-foot distance at rest
const STRIDE = 0.25; // half stride
const LIFT = 0.45;
const HIP_Y = 0.85;
const PERIOD = 2;

const legs: Leg[] = [];
const angles = [48, 78, 108, 140]; // degrees from +X toward the side
const hipX = [0.5, 0.35, 0.2, 0.05];
for (let side = -1; side <= 1; side += 2) {
  for (let i = 0; i < 4; i++) {
    const a = (angles[i] * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(a), 0, side * Math.sin(a));
    const hip = new THREE.Vector3(hipX[i], 0, side * 0.2);
    const thigh = mesh(segGeo1, legMat);
    const shin = mesh(segGeo2, legMat);
    const knee = mesh(sphereGeo, jointMat);
    knee.scale.setScalar(0.11);
    const foot = mesh(sphereGeo, legMat);
    foot.scale.setScalar(0.04);
    const hipJoint = mesh(sphereGeo, jointMat);
    hipJoint.scale.setScalar(0.1);
    hipJoint.position.copy(hip);
    body.add(hipJoint);
    // Diagonal pairing: left even / right odd move together
    const idx = side < 0 ? i : i + 1;
    const group = idx % 2;
    spider.add(thigh, shin, knee, foot);
    legs.push({ side, hip, dir, group, thigh, shin, knee, foot });
  }
}

function place(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
  m.scale.set(radius, len, radius);
}

const hipW = new THREE.Vector3();
const footW = new THREE.Vector3();
const kneeW = new THREE.Vector3();
const horiz = new THREE.Vector3();

function update(t: number): void {
  const cyc = t / PERIOD;
  const bob = 0.05 * Math.cos(cyc * Math.PI * 4);
  const sway = 0.02 * Math.sin(cyc * Math.PI * 2);
  body.position.set(0, HIP_Y + bob, 0);
  body.rotation.x = sway;

  for (const leg of legs) {
    const p = (((cyc + leg.group * 0.5) % 1) + 1) % 1;
    let fx: number;
    let lift = 0;
    if (p < 0.5) {
      fx = STRIDE * (1 - 4 * p); // stance: foot slides back with the ground
    } else {
      const q = (p - 0.5) * 2;
      fx = -STRIDE + 2 * STRIDE * (0.5 - 0.5 * Math.cos(Math.PI * q));
      lift = LIFT * Math.sin(Math.PI * q);
    }
    // world-space hip (spider frame; body roll is tiny but included)
    hipW.copy(leg.hip);
    body.localToWorld(hipW);
    spider.worldToLocal(hipW);
    // foot target in spider frame
    footW.set(
      leg.hip.x + leg.dir.x * REACH + fx,
      0.04 + lift,
      leg.hip.z + leg.dir.z * REACH,
    );
    // 2-bone IK in vertical plane through hip and foot
    horiz.set(footW.x - hipW.x, 0, footW.z - hipW.z);
    const r = horiz.length();
    horiz.multiplyScalar(1 / r);
    const dy = footW.y - hipW.y;
    let D = Math.hypot(r, dy);
    D = Math.min(D, L1 + L2 - 0.001);
    const ur = r / Math.hypot(r, dy);
    const uy = dy / Math.hypot(r, dy);
    const aLen = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(L1 * L1 - aLen * aLen, 0));
    const kr = ur * aLen + -uy * h;
    const ky = uy * aLen + ur * h;
    kneeW.set(hipW.x + horiz.x * kr, hipW.y + ky, hipW.z + horiz.z * kr);
    if (D < Math.hypot(r, dy)) {
      // unreachable: stretch foot toward the clamped distance
      footW.set(
        hipW.x + horiz.x * ur * D,
        hipW.y + uy * D,
        hipW.z + horiz.z * ur * D,
      );
    }
    place(leg.thigh, hipW, kneeW, 1);
    place(leg.shin, kneeW, footW, 1);
    leg.knee.position.copy(kneeW);
    leg.foot.position.copy(footW);
  }

  // Ground scrolls backward at the stance speed (4*STRIDE/PERIOD*... per second)
  const speed = (2 * STRIDE) / (0.5 * PERIOD);
  groundTex.offset.x = (speed * t) % 1;
}

let first = true;
const start = performance.now();
function frame(now: number): void {
  update((now - start) / 1000);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
