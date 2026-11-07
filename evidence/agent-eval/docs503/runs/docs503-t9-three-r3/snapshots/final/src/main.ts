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
scene.fog = new THREE.Fog(0x030409, 10, 22);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);
camera.position.set(0, 2.0, 8.5);
camera.lookAt(0, 1.9, 0);

// ---------- Lighting ----------
scene.add(new THREE.AmbientLight(0x151a2a, 0.5));

const key = new THREE.SpotLight(0xfff0dd, 260, 25, Math.PI / 6, 0.5, 1.5);
key.position.set(3.5, 6.5, 5);
key.target.position.set(0, 1.7, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.camera.near = 2;
key.shadow.camera.far = 20;
scene.add(key, key.target);

const rimA = new THREE.SpotLight(0x00c8ff, 300, 25, Math.PI / 5, 0.6, 1.5);
rimA.position.set(-4, 3.5, -4.5);
rimA.target.position.set(0, 1.8, 0);
scene.add(rimA, rimA.target);

const rimB = new THREE.SpotLight(0xff2a8a, 260, 25, Math.PI / 5, 0.6, 1.5);
rimB.position.set(4.2, 3, -4);
rimB.target.position.set(0, 1.8, 0);
scene.add(rimB, rimB.target);

// ---------- Floor ----------
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(12, 64),
  new THREE.MeshStandardMaterial({ color: 0x20232c, roughness: 0.55, metalness: 0.3 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ---------- Robot ----------
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb9c0cc, roughness: 0.35, metalness: 0.8 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.5, metalness: 0.7 });
const glowMat = new THREE.MeshStandardMaterial({
  color: 0x113344,
  emissive: 0x22d8ff,
  emissiveIntensity: 2.2,
  roughness: 0.4,
});

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function joint(x: number, y: number, z: number, parent: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function ball(r: number, parent: THREE.Object3D): void {
  parent.add(mesh(new THREE.SphereGeometry(r, 20, 14), darkMat));
}

const robot = new THREE.Group();
scene.add(robot);

const LEG_U = 0.8;
const LEG_L = 0.8;
const FOOT_H = 0.14;
const HIP_Y = FOOT_H + LEG_U + LEG_L + 0.05;

// pelvis (root of upper body, moves for weight shift)
const pelvis = joint(0, HIP_Y, 0, robot);
const pelvisMesh = box(0.8, 0.28, 0.45, darkMat);
pelvis.add(pelvisMesh);

// spine / torso
const spine = joint(0, 0.14, 0, pelvis);
const torso = box(0.95, 0.95, 0.52, bodyMat);
torso.position.y = 0.5;
spine.add(torso);
const chest = box(0.7, 0.4, 0.1, darkMat);
chest.position.set(0, 0.62, 0.28);
spine.add(chest);
const core = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 24), glowMat);
core.rotation.x = Math.PI / 2;
core.position.set(0, 0.62, 0.34);
spine.add(core);
const chestStripe = box(0.5, 0.05, 0.02, glowMat);
chestStripe.position.set(0, 0.35, 0.27);
spine.add(chestStripe);

// neck + head
const neck = joint(0, 1.0, 0, spine);
const neckMesh = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 16), darkMat);
neckMesh.position.y = 0.08;
neck.add(neckMesh);
const head = joint(0, 0.18, 0, neck);
const skull = box(0.55, 0.45, 0.5, bodyMat);
skull.position.y = 0.25;
head.add(skull);
const visor = box(0.45, 0.13, 0.06, glowMat);
visor.position.set(0, 0.28, 0.26);
head.add(visor);
const antenna = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8), darkMat);
antenna.position.set(0.15, 0.58, 0);
head.add(antenna);
const antTip = mesh(
  new THREE.SphereGeometry(0.04, 12, 10),
  new THREE.MeshStandardMaterial({ color: 0x330011, emissive: 0xff2a8a, emissiveIntensity: 3 }),
);
antTip.position.set(0.15, 0.72, 0);
head.add(antTip);

// arms
interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
}
function makeArm(side: 1 | -1): Arm {
  const shoulder = joint(side * 0.67, 0.9, 0, spine);
  ball(0.17, shoulder);
  const upper = box(0.2, 0.62, 0.22, bodyMat);
  upper.position.y = -0.33;
  shoulder.add(upper);
  const elbow = joint(0, -0.67, 0, shoulder);
  ball(0.13, elbow);
  const fore = box(0.22, 0.6, 0.24, bodyMat);
  fore.position.y = -0.33;
  elbow.add(fore);
  const band = box(0.24, 0.04, 0.26, glowMat);
  band.position.y = -0.1;
  elbow.add(band);
  const hand = box(0.2, 0.22, 0.16, darkMat);
  hand.position.y = -0.74;
  elbow.add(hand);
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
function makeLeg(side: 1 | -1): Leg {
  const hip = joint(side * 0.27, -0.1, 0, pelvis);
  ball(0.15, hip);
  const thigh = box(0.28, LEG_U, 0.3, bodyMat);
  thigh.position.y = -LEG_U / 2;
  hip.add(thigh);
  const knee = joint(0, -LEG_U, 0, hip);
  ball(0.14, knee);
  const shin = box(0.25, LEG_L - 0.1, 0.28, bodyMat);
  shin.position.y = -LEG_L / 2;
  knee.add(shin);
  const stripe = box(0.27, 0.04, 0.3, glowMat);
  stripe.position.y = -0.2;
  knee.add(stripe);
  const ankle = joint(0, -LEG_L, 0, knee);
  const foot = box(0.32, FOOT_H, 0.6, darkMat);
  foot.position.set(0, -FOOT_H / 2 + 0.0, 0.1);
  ankle.add(foot);
  return { hip, knee, ankle };
}
const legL = makeLeg(-1);
const legR = makeLeg(1);

// Glow point lights so the emissive parts light nearby surfaces slightly
const visorLight = new THREE.PointLight(0x22d8ff, 1.5, 3);
visorLight.position.set(0, 0.28, 0.6);
head.add(visorLight);

// pedestal ring glow on floor
const ring = new THREE.Mesh(
  new THREE.RingGeometry(1.5, 1.56, 64),
  new THREE.MeshBasicMaterial({ color: 0x22d8ff }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.005;
scene.add(ring);

// ---------- Animation ----------
const clock = new THREE.Clock();

function animate(t: number): void {
  const breath = Math.sin(t * 1.8);
  const shift = Math.sin(t * 0.55); // weight shift: -1 (left) .. 1 (right)
  const shift2 = Math.sin(t * 0.55 + Math.PI / 2);

  // weight shift: pelvis moves sideways and tilts
  pelvis.position.x = shift * 0.08;
  pelvis.position.y = HIP_Y - Math.abs(shift) * 0.02 + breath * 0.008;
  pelvis.rotation.z = -shift * 0.04;
  pelvis.rotation.y = shift2 * 0.05;

  // legs counter-rotate so feet stay near the floor; the loaded leg is straighter
  const loadR = Math.max(0, shift);
  const loadL = Math.max(0, -shift);
  legR.hip.rotation.z = shift * 0.04 + 0.02;
  legL.hip.rotation.z = shift * 0.04 - 0.02;
  legR.hip.rotation.x = -0.03 - (1 - loadR) * 0.05;
  legL.hip.rotation.x = -0.03 - (1 - loadL) * 0.05;
  legR.knee.rotation.x = 0.03 + (1 - loadR) * 0.1;
  legL.knee.rotation.x = 0.03 + (1 - loadL) * 0.1;
  legR.ankle.rotation.x = -(legR.hip.rotation.x + legR.knee.rotation.x);
  legL.ankle.rotation.x = -(legL.hip.rotation.x + legL.knee.rotation.x);

  // breathing: chest expands and rises, spine leans slightly
  spine.rotation.x = 0.02 + breath * 0.015;
  spine.rotation.z = shift * 0.03;
  spine.rotation.y = -shift2 * 0.06;
  torso.scale.set(1 + breath * 0.02, 1, 1 + breath * 0.04);
  chest.scale.z = 1 + breath * 0.1;

  // head looks around gently
  neck.rotation.y = Math.sin(t * 0.7) * 0.25;
  neck.rotation.x = Math.sin(t * 0.9 + 1) * 0.05;
  head.rotation.z = Math.sin(t * 0.5 + 2) * 0.05;
  head.rotation.x = Math.sin(t * 1.1) * 0.04;

  // arms sway
  armL.shoulder.rotation.x = Math.sin(t * 0.9) * 0.08;
  armR.shoulder.rotation.x = Math.sin(t * 0.9 + 1.7) * 0.08;
  armL.shoulder.rotation.z = 0.08 + breath * 0.02 + shift * 0.02;
  armR.shoulder.rotation.z = -0.08 - breath * 0.02 + shift * 0.02;
  armL.elbow.rotation.x = -0.25 + Math.sin(t * 1.2 + 0.5) * 0.1;
  armR.elbow.rotation.x = -0.35 + Math.sin(t * 1.2 + 2.2) * 0.12;

  // glowing parts pulse
  glowMat.emissiveIntensity = 2.2 + Math.sin(t * 2.5) * 0.6;
  visorLight.intensity = 1.5 + Math.sin(t * 2.5) * 0.4;
}

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
