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
scene.background = new THREE.Color(0x040508);
scene.fog = new THREE.Fog(0x040508, 10, 22);

const camera = new THREE.PerspectiveCamera(35, 640 / 360, 0.1, 50);
camera.position.set(0, 1.9, 8.6);
camera.lookAt(0, 1.75, 0);

// ---------- floor ----------
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 64),
  new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.55, metalness: 0.2 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ---------- lights ----------
scene.add(new THREE.AmbientLight(0x223048, 0.25));

const key = new THREE.SpotLight(0xfff0dd, 260, 30, Math.PI / 7, 0.45, 1.6);
key.position.set(4, 7, 5);
key.target.position.set(0, 1.6, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.02;
key.shadow.camera.near = 2;
key.shadow.camera.far = 20;
scene.add(key, key.target);

const rimA = new THREE.SpotLight(0x19d8ff, 320, 30, Math.PI / 5, 0.5, 1.5);
rimA.position.set(-4.5, 4, -4.5);
rimA.target.position.set(0, 1.7, 0);
scene.add(rimA, rimA.target);

const rimB = new THREE.SpotLight(0xff2fa0, 260, 30, Math.PI / 5, 0.5, 1.5);
rimB.position.set(4.5, 3.5, -4.5);
rimB.target.position.set(0, 1.7, 0);
scene.add(rimB, rimB.target);

// ---------- materials ----------
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.55, roughness: 0.38 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.7, roughness: 0.45 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0x555d6b, metalness: 0.8, roughness: 0.3 });
const glowMat = new THREE.MeshStandardMaterial({
  color: 0x001a22,
  emissive: 0x20e0ff,
  emissiveIntensity: 2.2,
});

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function joint(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---------- robot ----------
const robot = new THREE.Group();
scene.add(robot);

const pelvis = joint(robot, 0, 1.3, 0);
pelvis.add(mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), darkMat, 0, 0, 0));

const spine = joint(pelvis, 0, 0.15, 0);
spine.add(mesh(new THREE.SphereGeometry(0.2, 20, 14), jointMat, 0, 0, 0));
const torso = new THREE.Group();
spine.add(torso);
torso.add(mesh(new THREE.BoxGeometry(1.1, 0.95, 0.6), bodyMat, 0, 0.55, 0));
torso.add(mesh(new THREE.BoxGeometry(0.6, 0.4, 0.08), darkMat, 0, 0.55, 0.31));
const chestLight = mesh(new THREE.CircleGeometry(0.1, 24), glowMat, 0, 0.55, 0.356);
chestLight.castShadow = false;
torso.add(chestLight);

// neck + head
const neck = joint(torso, 0, 1.05, 0);
neck.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 16), jointMat, 0, 0.05, 0));
const head = joint(neck, 0, 0.15, 0);
head.add(mesh(new THREE.BoxGeometry(0.62, 0.5, 0.55), bodyMat, 0, 0.27, 0));
head.add(mesh(new THREE.BoxGeometry(0.5, 0.14, 0.05), darkMat, 0, 0.3, 0.28));
for (const sx of [-1, 1]) {
  const eye = mesh(new THREE.SphereGeometry(0.05, 12, 10), glowMat, sx * 0.12, 0.3, 0.3);
  eye.castShadow = false;
  head.add(eye);
  head.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 12), darkMat, sx * 0.34, 0.27, 0).rotateZ(Math.PI / 2));
}
const antenna = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 8), darkMat, 0.15, 0.65, 0);
head.add(antenna);
const antennaTip = mesh(new THREE.SphereGeometry(0.04, 10, 8), glowMat, 0.15, 0.81, 0);
antennaTip.castShadow = false;
head.add(antennaTip);

// arms
interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
}
function makeArm(side: number): Arm {
  const shoulder = joint(torso, side * 0.75, 0.9, 0);
  shoulder.add(mesh(new THREE.SphereGeometry(0.19, 20, 14), jointMat));
  shoulder.add(mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), bodyMat, 0, -0.3, 0));
  const elbow = joint(shoulder, 0, -0.6, 0);
  elbow.add(mesh(new THREE.SphereGeometry(0.13, 16, 12), jointMat));
  elbow.add(mesh(new THREE.BoxGeometry(0.18, 0.5, 0.2), bodyMat, 0, -0.28, 0));
  elbow.add(mesh(new THREE.BoxGeometry(0.22, 0.2, 0.24), darkMat, 0, -0.58, 0));
  return { shoulder, elbow };
}
const armL = makeArm(-1);
const armR = makeArm(1);

// legs
interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
}
function makeLeg(side: number): Leg {
  const hip = joint(pelvis, side * 0.3, -0.15, 0);
  hip.add(mesh(new THREE.SphereGeometry(0.17, 18, 12), jointMat));
  hip.add(mesh(new THREE.BoxGeometry(0.26, 0.5, 0.28), bodyMat, 0, -0.28, 0));
  const knee = joint(hip, 0, -0.55, 0);
  knee.add(mesh(new THREE.SphereGeometry(0.14, 16, 12), jointMat));
  knee.add(mesh(new THREE.BoxGeometry(0.22, 0.45, 0.26), bodyMat, 0, -0.27, 0));
  const ankle = joint(knee, 0, -0.55, 0);
  ankle.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), jointMat));
  ankle.add(mesh(new THREE.BoxGeometry(0.3, 0.12, 0.52), darkMat, 0, -0.04, 0.08));
  return { hip, knee, ankle };
}
const legL = makeLeg(-1);
const legR = makeLeg(1);
// pelvis height so the feet sit on the floor in the rest pose
// pelvis y - 0.15 - 0.55 - 0.55 - 0.1 (ankle to sole) = 0
pelvis.position.y = 1.35;

// ---------- animation ----------
function animate(t: number): void {
  const breath = Math.sin(t * 1.6);
  const sway = Math.sin(t * 0.55);
  const sway2 = Math.sin(t * 0.55 + Math.PI / 2);

  // weight shift: pelvis moves sideways, torso counter-leans
  pelvis.position.x = sway * 0.09;
  pelvis.position.y = 1.35 - Math.abs(sway) * 0.015 + breath * 0.008;
  pelvis.rotation.z = -sway * 0.035;
  pelvis.rotation.y = sway2 * 0.04;

  // legs compensate so the feet stay roughly planted
  legL.hip.rotation.z = sway * 0.05 + 0.03;
  legR.hip.rotation.z = sway * 0.05 - 0.03;
  legL.hip.rotation.x = -0.02 + Math.max(0, sway) * 0.03;
  legR.hip.rotation.x = -0.02 + Math.max(0, -sway) * 0.03;
  legL.knee.rotation.x = 0.04 + Math.max(0, -sway) * 0.08 + breath * 0.01;
  legR.knee.rotation.x = 0.04 + Math.max(0, sway) * 0.08 + breath * 0.01;
  legL.ankle.rotation.x = -(legL.hip.rotation.x + legL.knee.rotation.x) * 0.7;
  legR.ankle.rotation.x = -(legR.hip.rotation.x + legR.knee.rotation.x) * 0.7;
  legL.ankle.rotation.z = -legL.hip.rotation.z;
  legR.ankle.rotation.z = -legR.hip.rotation.z;

  // torso breathing
  spine.rotation.z = sway * 0.04;
  spine.rotation.y = -sway2 * 0.05;
  spine.rotation.x = 0.02 + breath * 0.012;
  torso.scale.set(1 + breath * 0.012, 1 + breath * 0.012, 1 + breath * 0.02);

  // head looks around slowly
  neck.rotation.y = Math.sin(t * 0.4) * 0.35;
  neck.rotation.x = Math.sin(t * 0.7 + 1) * 0.06 - breath * 0.01;
  neck.rotation.z = Math.sin(t * 0.3 + 2) * 0.05;

  // arms swing gently, elbows bend
  armL.shoulder.rotation.x = Math.sin(t * 0.9) * 0.08;
  armR.shoulder.rotation.x = Math.sin(t * 0.9 + 1.7) * 0.08;
  armL.shoulder.rotation.z = 0.08 + breath * 0.02 + sway * 0.03;
  armR.shoulder.rotation.z = -0.08 - breath * 0.02 + sway * 0.03;
  armL.elbow.rotation.x = -0.25 + Math.sin(t * 0.8 + 0.5) * 0.12;
  armR.elbow.rotation.x = -0.35 + Math.sin(t * 0.8 + 2.4) * 0.15;
  armR.elbow.rotation.z = Math.sin(t * 0.6) * 0.04;

  antennaTip.scale.setScalar(1 + Math.sin(t * 4) * 0.25);
  glowMat.emissiveIntensity = 2.0 + Math.sin(t * 2.2) * 0.5;
}

// ---------- loop ----------
const clock = new THREE.Clock();
let first = true;
function frame(): void {
  animate(clock.getElapsedTime());
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
