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
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const BG = 0xd9dce1;
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 14, 30);

const camera = new THREE.PerspectiveCamera(35, 640 / 360, 0.1, 100);
camera.position.set(5.6, 4.6, 6.6);
camera.lookAt(0, 0.75, -0.1);

// Lighting
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9ea8, 1.0));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(4, 8, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -5;
key.shadow.camera.right = 5;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -5;
key.shadow.camera.near = 1;
key.shadow.camera.far = 20;
key.shadow.radius = 5;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6);
fill.position.set(-5, 3, -2);
scene.add(fill);

// Ground
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 64),
  new THREE.MeshStandardMaterial({ color: 0xeceef1, roughness: 0.95, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Materials
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2a24, roughness: 0.55 });
const abdMat = new THREE.MeshStandardMaterial({ color: 0x5a3a2c, roughness: 0.5 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x2a1f1b, roughness: 0.5 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.4 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.15, metalness: 0.3 });

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const spider = new THREE.Group();
scene.add(spider);

const HIP_Y = 0.85;
const bodyGroup = new THREE.Group();
spider.add(bodyGroup);

// Body: cephalothorax, abdomen, head, eyes, fangs, stripe
const thorax = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), bodyMat));
thorax.scale.set(1, 0.7, 1.15);
bodyGroup.add(thorax);

const abdomen = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 24), abdMat));
abdomen.scale.set(0.95, 0.85, 1.25);
abdomen.position.set(0, 0.12, -1.0);
bodyGroup.add(abdomen);

const spot = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), jointMat));
spot.scale.set(1, 0.4, 1.6);
spot.position.set(0, 0.62, -1.0);
bodyGroup.add(spot);

const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), bodyMat));
head.position.set(0, 0.0, 0.62);
bodyGroup.add(head);

for (const sx of [-1, 1]) {
  const e1 = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), eyeMat));
  e1.position.set(sx * 0.1, 0.13, 0.86);
  bodyGroup.add(e1);
  const e2 = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), eyeMat));
  e2.position.set(sx * 0.19, 0.08, 0.82);
  bodyGroup.add(e2);
  const fang = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 10), jointMat));
  fang.position.set(sx * 0.1, -0.2, 0.84);
  fang.rotation.x = Math.PI; // tip down
  bodyGroup.add(fang);
}

// Legs
const L1 = 1.25;
const L2 = 1.85;
const R1 = 0.075;
const R2 = 0.055;
const STRIDE = 0.8;
const LIFT = 0.55;
const PERIOD = 2.0;

const hipZ = [0.38, 0.14, -0.1, -0.34];
const yawDeg = [52, 20, -20, -52]; // angle from the side axis toward the front
const REACH = 2.0;

interface Leg {
  side: number;
  hip: THREE.Vector3; // in body-local space
  rest: THREE.Vector3; // rest foot position (x,z) in spider space
  phase: number;
  seg1: THREE.Mesh;
  seg2: THREE.Mesh;
  knee: THREE.Mesh;
  hipJ: THREE.Mesh;
  foot: THREE.Mesh;
}

const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
const jointGeo = new THREE.SphereGeometry(1, 16, 12);
const legs: Leg[] = [];

for (const side of [-1, 1]) {
  for (let i = 0; i < 4; i++) {
    const yaw = (yawDeg[i] * Math.PI) / 180;
    const hip = new THREE.Vector3(side * 0.38, 0, hipZ[i]);
    const rest = new THREE.Vector3(
      side * 0.38 + side * Math.cos(yaw) * REACH,
      0,
      hipZ[i] + Math.sin(yaw) * REACH,
    );
    const seg1 = shadowed(new THREE.Mesh(cylGeo, legMat));
    const seg2 = shadowed(new THREE.Mesh(cylGeo, legMat));
    const knee = shadowed(new THREE.Mesh(jointGeo, jointMat));
    const hipJ = shadowed(new THREE.Mesh(jointGeo, jointMat));
    const foot = shadowed(new THREE.Mesh(jointGeo, legMat));
    knee.scale.setScalar(0.105);
    hipJ.scale.setScalar(0.11);
    foot.scale.setScalar(0.05);
    spider.add(seg1, seg2, knee, hipJ, foot);
    // Diagonal gait: (left, even) + (right, odd) form one group.
    const left = side < 0 ? 0 : 1;
    const phase = (i + left) % 2 === 0 ? 0 : 0.5;
    legs.push({ side, hip, rest, phase, seg1, seg2, knee, hipJ, foot });
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const Y = new THREE.Vector3(0, 1, 0);
function placeSegment(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(Y, d.divideScalar(len));
  m.scale.set(r, len, r);
}

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}

const hipW = new THREE.Vector3();
const foot = new THREE.Vector3();
const knee = new THREE.Vector3();
const u = new THREE.Vector3();
const n = new THREE.Vector3();

function update(t: number): void {
  const cyc = (t % PERIOD) / PERIOD; // 0..1
  const bob = Math.cos(cyc * Math.PI * 4); // two steps per period
  const bodyY = HIP_Y + 0.045 * bob;
  bodyGroup.position.set(0, bodyY, 0);
  bodyGroup.rotation.z = 0.02 * Math.sin(cyc * Math.PI * 2);
  bodyGroup.rotation.x = 0.015 * Math.sin(cyc * Math.PI * 4);
  bodyGroup.updateMatrixWorld(true);

  for (const leg of legs) {
    const ph = (cyc + leg.phase) % 1;
    let dz: number;
    let lift = 0;
    if (ph < 0.5) {
      // stance: foot slides backward relative to the body, on the ground
      dz = STRIDE * (0.5 - ph / 0.5);
    } else {
      const q = (ph - 0.5) / 0.5; // swing: lift, move forward, plant
      dz = STRIDE * (-0.5 + smooth(q));
      lift = LIFT * Math.sin(Math.PI * q);
    }
    foot.set(leg.rest.x, lift, leg.rest.z + dz);

    hipW.copy(leg.hip).applyMatrix4(bodyGroup.matrixWorld);

    // Two-bone IK, knee bends upward
    u.subVectors(foot, hipW);
    let d = u.length();
    d = Math.min(d, L1 + L2 - 0.001);
    u.normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
    n.copy(UP).addScaledVector(u, -UP.dot(u)).normalize();
    knee.copy(hipW).addScaledVector(u, a).addScaledVector(n, h);
    const ankle = hipW.clone().addScaledVector(u, d);

    placeSegment(leg.seg1, hipW, knee, R1);
    placeSegment(leg.seg2, knee, ankle, R2);
    leg.hipJ.position.copy(hipW);
    leg.knee.position.copy(knee);
    leg.foot.position.copy(ankle);
  }
}

let ready = false;
function frame(ms: number): void {
  update(ms / 1000);
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
