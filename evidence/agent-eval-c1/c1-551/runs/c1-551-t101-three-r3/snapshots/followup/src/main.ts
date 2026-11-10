import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { walking: boolean };
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

const camera = new THREE.PerspectiveCamera(35, 640 / 360, 0.1, 100);
camera.position.set(5.6, 4.6, 7.2);
camera.lookAt(0, 0.8, 0);

// ---- Constants ----
const PERIOD = 2; // seconds per full gait cycle
const STRIDE = 0.4; // half stride length (x)
const SWING = 0.4; // fraction of cycle spent swinging
const LIFT = 0.6;
// distance the ground travels during one cycle = stance speed * PERIOD
const GROUND_PER_CYCLE = ((2 * STRIDE) / ((1 - SWING) * PERIOD)) * PERIOD;

// ---- Lights ----
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9aa3, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-4, 9, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -6;
key.shadow.camera.right = 6;
key.shadow.camera.top = 6;
key.shadow.camera.bottom = -6;
key.shadow.camera.near = 1;
key.shadow.camera.far = 25;
key.shadow.radius = 4;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdde6ff, 0.5);
fill.position.set(6, 3, -4);
scene.add(fill);

// ---- Ground (with a tiling pattern that scrolls to match the stance feet) ----
function makeGroundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#e3e4e7';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#c3c5cb';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 256, 256);
  g.fillStyle = '#cfd1d6';
  g.beginPath();
  g.arc(128, 128, 14, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
const GROUND_SIZE = 60;
const groundTex = makeGroundTexture();
groundTex.repeat.set(GROUND_SIZE / GROUND_PER_CYCLE, GROUND_SIZE / GROUND_PER_CYCLE);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---- Spider ----
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b2a22, roughness: 0.55 });
const abdMat = new THREE.MeshStandardMaterial({ color: 0x4a3328, roughness: 0.5 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x5a4034, roughness: 0.6 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0xc8793a, roughness: 0.45 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.2 });
const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const spider = new THREE.Group();
scene.add(spider);

const thorax = mesh(new THREE.SphereGeometry(0.42, 32, 24), bodyMat, spider);
thorax.scale.set(1.15, 0.8, 1);
thorax.position.set(0.4, 0.05, 0);
const abdomen = mesh(new THREE.SphereGeometry(0.62, 32, 24), abdMat, spider);
abdomen.scale.set(1.25, 0.95, 1);
abdomen.position.set(-0.6, 0.18, 0);
const waist = mesh(new THREE.SphereGeometry(0.28, 20, 16), bodyMat, spider);
waist.position.set(-0.02, 0.07, 0);
// Eyes
for (const [ex, ey, ez, r] of [
  [0.78, 0.2, 0.13, 0.07],
  [0.78, 0.2, -0.13, 0.07],
  [0.72, 0.33, 0.07, 0.05],
  [0.72, 0.33, -0.07, 0.05],
] as const) {
  const eye = mesh(new THREE.SphereGeometry(r, 16, 12), eyeMat, spider);
  eye.position.set(ex, ey, ez);
  const pupil = mesh(new THREE.SphereGeometry(r * 0.55, 12, 10), pupilMat, spider);
  pupil.position.set(ex + r * 0.55, ey, ez);
}
// Fangs
for (const s of [-1, 1]) {
  const fang = mesh(new THREE.ConeGeometry(0.06, 0.28, 12), jointMat, spider);
  fang.position.set(0.82, -0.12, s * 0.12);
  fang.rotation.z = Math.PI * 0.05;
}
// Abdomen stripe spots
for (let i = 0; i < 3; i++) {
  const spot = mesh(new THREE.SphereGeometry(0.1, 12, 10), jointMat, spider);
  spot.scale.set(1.3, 0.45, 1);
  spot.position.set(-0.35 - i * 0.28, 0.18 + 0.58 * (0.95 - i * 0.12) - 0.04, 0);
}

interface Leg {
  angle: number; // direction angle in xz plane (0 = +x forward, +pi/2 = +z)
  phase: number; // 0 or 0.5
  femur: THREE.Mesh;
  tibia: THREE.Mesh;
  hipJoint: THREE.Mesh;
  kneeJoint: THREE.Mesh;
  footJoint: THREE.Mesh;
}

const L1 = 1.3;
const L2 = 1.9;
const REACH = 1.75; // horizontal distance foot rest from hip
const FOOT_R = 0.05;
const baseAngles = [38, 68, 104, 142].map((d) => (d * Math.PI) / 180);
const legs: Leg[] = [];

function unitCyl(rTop: number, rBot: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBot, 1, 12, 1);
  return mesh(geo, legMat, scene);
}

for (const side of [1, -1]) {
  baseAngles.forEach((a, i) => {
    const angle = side * a;
    // diagonal gait: (left i even, right i odd) vs the others
    const group = (i + (side === 1 ? 0 : 1)) % 2;
    legs.push({
      angle,
      phase: group * 0.5,
      femur: unitCyl(0.075, 0.09),
      tibia: unitCyl(0.03, 0.065),
      hipJoint: mesh(new THREE.SphereGeometry(0.11, 14, 12), jointMat, scene),
      kneeJoint: mesh(new THREE.SphereGeometry(0.105, 14, 12), jointMat, scene),
      footJoint: mesh(new THREE.SphereGeometry(FOOT_R + 0.01, 10, 8), legMat, scene),
    });
  });
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpPerp = new THREE.Vector3();
const tmpKnee = new THREE.Vector3();

function placeSegment(m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  tmpDir.subVectors(to, from);
  const len = tmpDir.length();
  tmpDir.divideScalar(len);
  m.position.addVectors(from, to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(Y_AXIS, tmpDir);
  m.scale.set(1, len, 1);
}

function smooth(u: number): number {
  return u * u * (3 - 2 * u);
}

const BODY_H = 1.15;

function update(t: number): void {
  const cyc = t / PERIOD;
  // two steps per cycle -> two bobs per cycle
  const bob = Math.cos(cyc * Math.PI * 4);
  const bodyY = BODY_H + 0.05 * bob;
  spider.position.set(0, bodyY, 0);
  spider.rotation.z = 0.012 * Math.sin(cyc * Math.PI * 2);
  spider.rotation.x = 0.01 * Math.sin(cyc * Math.PI * 2);
  spider.updateMatrixWorld(true);

  for (const leg of legs) {
    const ca = Math.cos(leg.angle);
    const sa = Math.sin(leg.angle);
    const hip = tmpA.set(ca * 0.42 + 0.2, bodyY - 0.05, sa * 0.36);
    // rest foot position
    const restX = hip.x + ca * REACH;
    const restZ = hip.z + sa * REACH;

    let p = (cyc + leg.phase) % 1;
    if (p < 0) p += 1;
    let fx: number;
    let lift = 0;
    if (p < SWING) {
      const u = p / SWING;
      fx = -STRIDE + 2 * STRIDE * smooth(u);
      lift = Math.sin(Math.PI * u) * LIFT;
    } else {
      const u = (p - SWING) / (1 - SWING);
      fx = STRIDE - 2 * STRIDE * u;
    }
    const foot = tmpB.set(restX + fx, FOOT_R + lift, restZ);

    // two-bone IK, knee bends upward
    const d = tmpDir.subVectors(foot, hip);
    let D = d.length();
    const maxD = L1 + L2 - 0.02;
    if (D > maxD) {
      foot.copy(hip).addScaledVector(d, maxD / D);
      D = maxD;
    }
    d.subVectors(foot, hip).divideScalar(D);
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
    tmpPerp.copy(Y_AXIS).addScaledVector(d, -d.y).normalize();
    tmpKnee.copy(hip).addScaledVector(d, a).addScaledVector(tmpPerp, h);

    const hipC = hip.clone();
    const footC = foot.clone();
    const kneeC = tmpKnee.clone();
    placeSegment(leg.femur, hipC, kneeC);
    placeSegment(leg.tibia, kneeC, footC);
    leg.hipJoint.position.copy(hipC);
    leg.kneeJoint.position.copy(kneeC);
    leg.footJoint.position.copy(footC);
  }
}

// Hip positions above use world coordinates, but the body is tilted slightly; the tilt is tiny
// and hips sit inside the body mesh, so the visual error is hidden.

const state = { walking: true };
window.__TASK_STATE__ = state;
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) {
      state.walking = !state.walking;
      window.__TASK_STATE__ = state;
    }
  }
});

let animTime = 0;
let lastNow: number | null = null;

function frame(now: number): void {
  const dt = lastNow === null ? 0 : Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;
  if (state.walking) animTime += dt;
  update(animTime);
  groundTex.offset.x = (animTime / PERIOD) % 1;
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
