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

const SKY = 0xbfe3f5;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 35, 80);

const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 150);

// Lighting: one directional light with shadows, plus a hemisphere fill (no shadows).
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(8, 18, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -20;
sc.right = 20;
sc.top = 20;
sc.bottom = -20;
sc.near = 1;
sc.far = 60;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xdff2ff, 0x6b8f5a, 0.9));

// Ground
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(30, 64),
  new THREE.MeshStandardMaterial({ color: 0x7fb069, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Props: cone trees and a few rocks. Kept clear of the camera ring (radius ~10-15).
function addTree(x: number, z: number, s: number): void {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2 * s, 0.28 * s, 1.0 * s, 8),
    new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 }),
  );
  trunk.position.y = 0.5 * s;
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(1.0 * s, 2.8 * s, 10),
    new THREE.MeshStandardMaterial({ color: 0x2f7d46, roughness: 0.9, flatShading: true }),
  );
  crown.position.y = 1.0 * s + 1.4 * s;
  for (const m of [trunk, crown]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.position.set(x, 0, z);
  scene.add(g);
}
addTree(0, 0, 1.3);
addTree(2.5, -2, 0.9);
addTree(-2.5, 2.2, 1.0);
addTree(-3.5, -3, 0.8);
addTree(18, 4, 1.4);
addTree(-17, 8, 1.2);
addTree(5, -19, 1.5);
addTree(-9, -18, 1.1);
addTree(20, -12, 1.3);
addTree(-20, -6, 1.5);
addTree(10, 20, 1.2);
addTree(-12, 19, 1.3);

const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 1, flatShading: true });
for (const [x, z, s] of [
  [4, 3.5, 0.5],
  [-4.5, 0.5, 0.4],
  [1, -4.5, 0.35],
] as const) {
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s), rockMat);
  r.position.set(x, s * 0.6, z);
  r.castShadow = true;
  r.receiveShadow = true;
  scene.add(r);
}

// ---------------- Bird ----------------
const paper = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    flatShading: true,
    side: THREE.DoubleSide,
  });
const bodyMat = paper(0xf2f2ee);
const wingMat = paper(0xe8554e);
const wingTipMat = paper(0xb53a38);
const tailMat = paper(0x3b6fb6);
const beakMat = paper(0xffb02e);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Hierarchy: birdRoot (position, yaw) > bankGroup (roll) > bobGroup (bob) > parts
const birdRoot = new THREE.Group();
const bankGroup = new THREE.Group();
const bobGroup = new THREE.Group();
birdRoot.add(bankGroup);
bankGroup.add(bobGroup);
scene.add(birdRoot);

// Body: ellipsoid, long axis along +Z (forward).
const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), bodyMat));
body.scale.set(0.9, 0.85, 1.7);
bobGroup.add(body);

// Head
const head = new THREE.Group();
head.position.set(0, 0.3, 0.85);
bobGroup.add(head);
head.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), bodyMat)));
const beak = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.4, 8), beakMat));
beak.geometry.rotateX(Math.PI / 2);
beak.position.set(0, -0.02, 0.45);
head.add(beak);
for (const sx of [-1, 1]) {
  const eye = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat));
  eye.position.set(sx * 0.15, 0.08, 0.2);
  head.add(eye);
}

// Tail fan: 5 feathers radiating from the rear of the body.
const tail = new THREE.Group();
tail.position.set(0, 0.0, -0.75);
tail.rotation.x = -0.15;
bobGroup.add(tail);
const featherCount = 5;
for (let i = 0; i < featherCount; i++) {
  const f = (i - (featherCount - 1) / 2) / ((featherCount - 1) / 2); // -1..1
  const geo = new THREE.BoxGeometry(0.16, 0.03, 0.9);
  geo.translate(0, 0, -0.45);
  const feather = shadowed(new THREE.Mesh(geo, tailMat));
  feather.rotation.y = f * 0.45;
  feather.rotation.x = -Math.abs(f) * 0.05;
  tail.add(feather);
}

// Wings: inner + outer hinged segments per side.
interface Wing {
  sign: number;
  inner: THREE.Group;
  outer: THREE.Group;
}
function makeWing(sign: number): Wing {
  const inner = new THREE.Group();
  inner.position.set(sign * 0.3, 0.12, 0.1);
  const innerGeo = new THREE.BoxGeometry(1.1, 0.05, 0.9);
  innerGeo.translate(sign * 0.55, 0, 0);
  inner.add(shadowed(new THREE.Mesh(innerGeo, wingMat)));

  const outer = new THREE.Group();
  outer.position.set(sign * 1.1, 0, 0);
  const outerGeo = new THREE.BoxGeometry(1.1, 0.04, 0.6);
  outerGeo.translate(sign * 0.55, 0, -0.1);
  outer.add(shadowed(new THREE.Mesh(outerGeo, wingTipMat)));
  inner.add(outer);

  bobGroup.add(inner);
  return { sign, inner, outer };
}
const wings = [makeWing(1), makeWing(-1)];

// ---------------- Animation ----------------
const LOOP = 8; // seconds
const RADIUS = 6;
const HEIGHT = 4;
const FLAP_HZ = 2;
const BANK = 0.35;

function update(t: number): void {
  const a = (t / LOOP) * Math.PI * 2;
  const ca = Math.cos(a);
  const sa = Math.sin(a);

  // Position on circle and heading along tangent (model forward = +Z).
  birdRoot.position.set(RADIUS * ca, HEIGHT, RADIUS * sa);
  birdRoot.rotation.y = -a;
  bankGroup.rotation.z = BANK; // left wing down, bank into the turn (center is local -X)

  // Flap
  const w = Math.PI * 2 * FLAP_HZ * t;
  const lag = 0.7;
  const innerAng = 0.6 * Math.sin(w);
  const outerAng = 0.5 * Math.sin(w - lag);
  for (const wing of wings) {
    wing.inner.rotation.z = wing.sign * innerAng;
    wing.outer.rotation.z = wing.sign * outerAng;
  }

  // Body rises on the upstroke-to-downstroke cycle, once per flap.
  bobGroup.position.y = 0.12 * Math.sin(w + Math.PI / 2 - 0.3);
  head.rotation.x = 0.05 * Math.sin(w - 0.8);
  tail.rotation.x = -0.15 + 0.08 * Math.sin(w - 1.0);

  // Chase camera: outside the circle, slightly behind the bird along the path.
  const camA = a - 0.55;
  const camR = RADIUS + 6.5;
  camera.position.set(camR * Math.cos(camA), HEIGHT + 2.6, camR * Math.sin(camA));
  camera.lookAt(birdRoot.position.x, HEIGHT - 0.3, birdRoot.position.z);
}

let first = true;
function frame(now: number): void {
  update(now / 1000);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
