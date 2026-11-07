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

const BG = 0xc9ccd1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 14, 30);

const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);
camera.position.set(5.6, 4.6, 7.2);
camera.lookAt(0, 0.9, 0);

// Lighting
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8d94, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(4, 8, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -6;
key.shadow.camera.right = 6;
key.shadow.camera.top = 6;
key.shadow.camera.bottom = -6;
key.shadow.camera.near = 1;
key.shadow.camera.far = 25;
key.shadow.radius = 5;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdde6ff, 0.5);
fill.position.set(-6, 3, -2);
scene.add(fill);

// Ground
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 64),
  new THREE.MeshStandardMaterial({ color: 0xd9dbdf, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Materials
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b2a22, roughness: 0.55 });
const abdMat = new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.5 });
const stripeMat = new THREE.MeshStandardMaterial({ color: 0xd8a24a, roughness: 0.5 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x2c2420, roughness: 0.5 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0xb5532f, roughness: 0.4 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.15, metalness: 0.3 });

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const sphereGeo = new THREE.SphereGeometry(1, 32, 20);
function ellipsoid(mat: THREE.Material, sx: number, sy: number, sz: number): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(sphereGeo, mat));
  m.scale.set(sx, sy, sz);
  return m;
}

// Body (two main primitives + head, eyes, stripe, fangs)
const spider = new THREE.Group();
scene.add(spider);

const thorax = ellipsoid(bodyMat, 0.55, 0.42, 0.7);
thorax.position.set(0, 0, 0.15);
spider.add(thorax);

const head = ellipsoid(bodyMat, 0.36, 0.3, 0.32);
head.position.set(0, 0.04, 0.82);
spider.add(head);

const abdomenGroup = new THREE.Group();
abdomenGroup.position.set(0, 0.2, -0.85);
spider.add(abdomenGroup);
const abdomen = ellipsoid(abdMat, 0.85, 0.75, 1.05);
abdomenGroup.add(abdomen);
const stripe = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 12, 32), stripeMat));
stripe.position.set(0, 0.25, -0.2);
stripe.rotation.x = Math.PI / 2 - 0.35;
stripe.scale.set(1, 1.2, 1);
abdomenGroup.add(stripe);
const stripe2 = stripe.clone();
stripe2.position.set(0, 0.2, -0.65);
stripe2.scale.set(1.1, 1.3, 1);
abdomenGroup.add(stripe2);

for (const s of [-1, 1]) {
  const eye = ellipsoid(eyeMat, 0.08, 0.08, 0.08);
  eye.position.set(s * 0.14, 0.2, 1.08);
  spider.add(eye);
  const eye2 = ellipsoid(eyeMat, 0.05, 0.05, 0.05);
  eye2.position.set(s * 0.25, 0.14, 1.0);
  spider.add(eye2);
  const fang = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 12), jointMat));
  fang.position.set(s * 0.12, -0.14, 1.08);
  fang.rotation.x = Math.PI - 0.2;
  spider.add(fang);
}

// Legs
const L1 = 1.35; // femur
const L2 = 1.75; // tibia
const HIP_Y = 1.15; // body height above ground
const FOOT_R = 0.06;
const STRIDE = 0.4;
const LIFT = 0.55;
const PERIOD = 2;

const segGeo = new THREE.CylinderGeometry(0.06, 0.085, 1, 12);
const tibiaGeo = new THREE.CylinderGeometry(0.035, 0.06, 1, 12);

interface Leg {
  side: number;
  group: number; // 0 or 1 (diagonal pair)
  hip: THREE.Vector3; // relative to body centre
  rest: THREE.Vector3; // rest foot position, world (x, z used)
  femur: THREE.Mesh;
  tibia: THREE.Mesh;
  kneeJoint: THREE.Mesh;
  hipJoint: THREE.Mesh;
  foot: THREE.Mesh;
}

const hipZ = [0.55, 0.28, 0.02, -0.25];
const dirs: [number, number][] = [
  [0.75, 1.0],
  [1.0, 0.4],
  [1.0, -0.3],
  [0.8, -1.0],
];
const reach = [1.9, 2.1, 2.1, 2.0];

const legs: Leg[] = [];
for (const side of [-1, 1]) {
  for (let j = 0; j < 4; j++) {
    const hip = new THREE.Vector3(side * 0.38, 0, hipZ[j]);
    const d = new THREE.Vector2(side * dirs[j][0], dirs[j][1]).normalize();
    const rest = new THREE.Vector3(hip.x + d.x * reach[j], 0, hip.z + d.y * reach[j]);
    // Diagonal pairing: (left, j even) and (right, j odd) move together.
    const group = (j + (side > 0 ? 1 : 0)) % 2;
    const femur = shadowed(new THREE.Mesh(segGeo, legMat));
    const tibia = shadowed(new THREE.Mesh(tibiaGeo, legMat));
    const kneeJoint = ellipsoid(jointMat, 0.11, 0.11, 0.11);
    const hipJoint = ellipsoid(jointMat, 0.12, 0.12, 0.12);
    const foot = ellipsoid(legMat, FOOT_R, FOOT_R, FOOT_R);
    scene.add(femur, tibia, kneeJoint, hipJoint, foot);
    legs.push({ side, group, hip, rest, femur, tibia, kneeJoint, hipJoint, foot });
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

function placeSegment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  tmpDir.subVectors(b, a);
  const len = tmpDir.length();
  mesh.position.copy(a).addScaledVector(tmpDir, 0.5);
  mesh.quaternion.copy(tmpQ.setFromUnitVectors(UP, tmpDir.multiplyScalar(1 / len)));
  mesh.scale.set(1, len, 1);
}

const hipW = new THREE.Vector3();
const footW = new THREE.Vector3();
const knee = new THREE.Vector3();
const dv = new THREE.Vector3();
const perp = new THREE.Vector3();

function smooth(u: number): number {
  return u * u * (3 - 2 * u);
}

function update(time: number): void {
  const p = (time % PERIOD) / PERIOD; // 0..1 loop
  const bob = Math.cos(4 * Math.PI * p); // two steps per cycle
  const bodyY = HIP_Y + 0.07 * bob;
  spider.position.set(0, bodyY, 0);
  spider.rotation.z = 0.025 * Math.sin(2 * Math.PI * p);
  abdomenGroup.rotation.x = 0.04 * Math.sin(4 * Math.PI * p + 0.8);
  abdomenGroup.rotation.y = 0.05 * Math.sin(2 * Math.PI * p);
  spider.updateMatrixWorld(true);

  for (const leg of legs) {
    let q = (p + leg.group * 0.5) % 1;
    let dz: number;
    let lift: number;
    if (q < 0.5) {
      // swing: forward, lifted
      const u = q / 0.5;
      dz = -STRIDE + 2 * STRIDE * smooth(u);
      lift = LIFT * Math.sin(Math.PI * u);
    } else {
      // stance: planted, slides backward
      const u = (q - 0.5) / 0.5;
      dz = STRIDE - 2 * STRIDE * u;
      lift = 0;
    }
    q = 0;
    hipW.set(leg.hip.x, bodyY, leg.hip.z + 0.0);
    // hip tilt with roll
    hipW.x += 0;
    footW.set(leg.rest.x, FOOT_R + lift, leg.rest.z + dz);

    // two-bone IK, knee biased upward
    dv.subVectors(footW, hipW);
    const D = Math.min(dv.length(), L1 + L2 - 0.001);
    dv.normalize();
    const along = (D * D + L1 * L1 - L2 * L2) / (2 * D);
    const h = Math.sqrt(Math.max(L1 * L1 - along * along, 0));
    perp.copy(UP).addScaledVector(dv, -UP.dot(dv)).normalize();
    knee.copy(hipW).addScaledVector(dv, along).addScaledVector(perp, h);
    footW.copy(hipW).addScaledVector(dv, D);

    placeSegment(leg.femur, hipW, knee);
    placeSegment(leg.tibia, knee, footW);
    leg.hipJoint.position.copy(hipW);
    leg.kneeJoint.position.copy(knee);
    leg.foot.position.copy(footW);
  }
}

let ready = false;
const start = performance.now();
function frame(now: number): void {
  update((now - start) / 1000);
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
