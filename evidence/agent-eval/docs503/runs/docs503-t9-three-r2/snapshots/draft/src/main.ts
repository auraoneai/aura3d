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
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030409);
scene.fog = new THREE.Fog(0x030409, 12, 26);

const camera = new THREE.PerspectiveCamera(36, 640 / 360, 0.1, 100);
camera.position.set(0, 1.7, 9);
camera.lookAt(0, 1.6, 0);

// ---------- floor ----------
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(14, 64),
  new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.55, metalness: 0.2 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0x1a2030, 0.35));

const key = new THREE.SpotLight(0xfff0dd, 260, 30, Math.PI / 7, 0.45, 1.6);
key.position.set(4, 7, 5);
key.target.position.set(0, 1.4, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.02;
key.shadow.camera.near = 3;
key.shadow.camera.far = 20;
scene.add(key, key.target);

const rimCyan = new THREE.SpotLight(0x22d3ff, 300, 30, Math.PI / 6, 0.5, 1.6);
rimCyan.position.set(-4.5, 4, -4);
rimCyan.target.position.set(0, 1.5, 0);
scene.add(rimCyan, rimCyan.target);

const rimMagenta = new THREE.SpotLight(0xff2a8a, 220, 30, Math.PI / 6, 0.5, 1.6);
rimMagenta.position.set(4.5, 3.5, -4);
rimMagenta.target.position.set(0, 1.5, 0);
scene.add(rimMagenta, rimMagenta.target);

// ---------- robot ----------
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.4, metalness: 0.35 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b303a, roughness: 0.5, metalness: 0.5 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0x555d6b, roughness: 0.35, metalness: 0.6 });
const glowMat = new THREE.MeshStandardMaterial({
  color: 0x66f0ff,
  emissive: 0x33e0ff,
  emissiveIntensity: 2.5,
  roughness: 0.3,
});

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w: number, h: number, d: number, mat: THREE.Material, y = 0): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = y;
  return m;
}

function ball(r: number): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, 24, 16), jointMat);
}

function group(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const robot = new THREE.Group();
scene.add(robot);

const LEG_UP = 0.75;
const LEG_LOW = 0.75;
const HIP_Y = LEG_UP + LEG_LOW + 0.12; // foot sole at y=0 when standing straight

// pelvis (root of the upper body)
const pelvis = group(robot, 0, HIP_Y, 0);
pelvis.add(box(0.95, 0.28, 0.55, darkMat, 0));

// spine / torso
const spine = group(pelvis, 0, 0.14, 0);
const torso = box(1.1, 1.0, 0.6, bodyMat, 0.55);
spine.add(torso);
const chest = box(0.8, 0.45, 0.1, darkMat, 0.7);
chest.position.z = 0.32;
spine.add(chest);
const core = mesh(new THREE.CircleGeometry(0.11, 24), glowMat);
core.position.set(0, 0.7, 0.375);
core.castShadow = false;
spine.add(core);
const shoulderBar = box(1.5, 0.22, 0.5, darkMat, 1.0);
spine.add(shoulderBar);

// neck + head
const neck = group(spine, 0, 1.12, 0);
const neckMesh = mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.2, 16), jointMat);
neckMesh.position.y = 0.05;
neck.add(neckMesh);
const head = group(neck, 0, 0.15, 0);
head.add(box(0.62, 0.5, 0.55, bodyMat, 0.25));
const visor = box(0.5, 0.14, 0.1, darkMat, 0.28);
visor.position.z = 0.28;
head.add(visor);
for (const sx of [-1, 1]) {
  const eye = mesh(new THREE.SphereGeometry(0.055, 12, 10), glowMat);
  eye.position.set(sx * 0.12, 0.28, 0.33);
  eye.castShadow = false;
  head.add(eye);
  const ear = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 16), jointMat);
  ear.rotation.z = Math.PI / 2;
  ear.position.set(sx * 0.35, 0.25, 0);
  head.add(ear);
}
const antenna = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8), darkMat);
antenna.position.set(0.15, 0.65, 0);
head.add(antenna);
const antTip = mesh(new THREE.SphereGeometry(0.045, 12, 10), glowMat);
antTip.position.set(0.15, 0.82, 0);
head.add(antTip);

// arms
const ARM_UP = 0.65;
const ARM_LOW = 0.6;
interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
}
function buildArm(side: number): Arm {
  const shoulder = group(spine, side * 0.88, 1.0, 0);
  shoulder.add(ball(0.17));
  const upper = box(0.2, ARM_UP, 0.22, bodyMat, -ARM_UP / 2 - 0.05);
  shoulder.add(upper);
  const elbow = group(shoulder, 0, -ARM_UP - 0.08, 0);
  elbow.add(ball(0.13));
  elbow.add(box(0.18, ARM_LOW, 0.2, bodyMat, -ARM_LOW / 2 - 0.05));
  const hand = group(elbow, 0, -ARM_LOW - 0.12, 0);
  hand.add(box(0.2, 0.22, 0.2, darkMat, 0));
  return { shoulder, elbow };
}
const armL = buildArm(-1);
const armR = buildArm(1);

// legs
interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
}
function buildLeg(side: number): Leg {
  const hip = group(pelvis, side * 0.32, -0.1, 0);
  hip.add(ball(0.17));
  hip.add(box(0.28, LEG_UP, 0.3, bodyMat, -LEG_UP / 2 - 0.02));
  const knee = group(hip, 0, -LEG_UP - 0.04, 0);
  knee.add(ball(0.15));
  knee.add(box(0.24, LEG_LOW, 0.27, bodyMat, -LEG_LOW / 2 - 0.02));
  const ankle = group(knee, 0, -LEG_LOW - 0.06, 0);
  const foot = box(0.32, 0.14, 0.62, darkMat, -0.0);
  foot.position.set(0, -0.0, 0.12);
  ankle.add(foot);
  return { hip, knee, ankle };
}
const legL = buildLeg(-1);
const legR = buildLeg(1);

// ---------- animation ----------
const clock = new THREE.Clock();

function animate(t: number): void {
  const breath = Math.sin(t * 1.6);
  const shift = Math.sin(t * 0.55); // weight shift left/right, slow
  const shift2 = Math.sin(t * 0.55 + 0.9);

  // weight shift: pelvis slides sideways, tilts; legs compensate to keep feet planted
  const px = shift * 0.12;
  pelvis.position.x = px;
  pelvis.position.y = HIP_Y - Math.abs(shift) * 0.02 + breath * 0.008;
  pelvis.rotation.z = -shift * 0.05;
  pelvis.rotation.y = shift2 * 0.04;

  // loaded leg is straighter, unloaded leg relaxes with a bent knee
  const loadL = Math.max(0, -shift);
  const loadR = Math.max(0, shift);
  legL.hip.rotation.z = -px * 0.55 - pelvis.rotation.z;
  legR.hip.rotation.z = -px * 0.55 - pelvis.rotation.z;
  legL.hip.rotation.x = -0.04 - loadR * 0.12;
  legR.hip.rotation.x = -0.04 - loadL * 0.12;
  legL.knee.rotation.x = 0.08 + loadR * 0.28;
  legR.knee.rotation.x = 0.08 + loadL * 0.28;
  legL.ankle.rotation.x = -(legL.hip.rotation.x + legL.knee.rotation.x);
  legR.ankle.rotation.x = -(legR.hip.rotation.x + legR.knee.rotation.x);

  // spine counter-rotates, breathing expands the chest
  spine.rotation.z = shift * 0.04;
  spine.rotation.y = -shift2 * 0.06;
  spine.rotation.x = 0.02 + breath * 0.015;
  const s = 1 + breath * 0.012;
  torso.scale.set(s, 1, 1 + breath * 0.02);
  chest.scale.set(1, 1, 1 + breath * 0.1);
  core.material.emissiveIntensity = 2.5 + Math.sin(t * 2.4) * 1.0;

  // head looks around gently
  neck.rotation.y = Math.sin(t * 0.7) * 0.25 - spine.rotation.y * 0.5;
  neck.rotation.x = Math.sin(t * 0.9 + 1.0) * 0.05 - breath * 0.015;
  head.rotation.z = Math.sin(t * 0.5 + 0.4) * 0.05;
  head.rotation.x = Math.sin(t * 1.1) * 0.03;
  antTip.scale.setScalar(1 + 0.3 * Math.sin(t * 3.0));

  // arms swing softly, elbows flex
  armL.shoulder.rotation.x = Math.sin(t * 0.8) * 0.08 + breath * 0.02;
  armR.shoulder.rotation.x = Math.sin(t * 0.8 + 1.7) * 0.08 + breath * 0.02;
  armL.shoulder.rotation.z = 0.1 + breath * 0.025 + shift * 0.03;
  armR.shoulder.rotation.z = -0.1 - breath * 0.025 + shift * 0.03;
  armL.elbow.rotation.x = -0.3 + Math.sin(t * 0.9 + 0.5) * 0.12;
  armR.elbow.rotation.x = -0.35 + Math.sin(t * 0.9 + 2.2) * 0.12;
  armL.elbow.rotation.z = 0.03;
  armR.elbow.rotation.z = -0.03;
}

function frame(): void {
  animate(clock.getElapsedTime());
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
