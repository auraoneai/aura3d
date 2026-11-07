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
scene.fog = new THREE.Fog(SKY, 40, 90);

const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 200);

// Lights
scene.add(new THREE.HemisphereLight(0xdff2ff, 0x6a7a5a, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(10, 22, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0005;
scene.add(sun);

// Ground
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(32, 64),
  new THREE.MeshStandardMaterial({ color: 0x7fb069, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Props: trees (cones) and rocks
function addTree(x: number, z: number, s: number): void {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15 * s, 0.2 * s, 1 * s, 8),
    new THREE.MeshStandardMaterial({ color: 0x7a5230, flatShading: true }),
  );
  trunk.position.y = 0.5 * s;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(0.9 * s, 2.6 * s, 8),
    new THREE.MeshStandardMaterial({ color: 0x2f7d4a, flatShading: true }),
  );
  leaves.position.y = 1 * s + 1.3 * s;
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  g.add(leaves);
  g.position.set(x, 0, z);
  scene.add(g);
}
const trees: Array<[number, number, number]> = [
  [0, 0, 1.4],
  [2.5, -2, 1],
  [-3, 2.5, 1.2],
  [-2, -3.5, 0.9],
  [10, 3, 1.3],
  [9, -6, 1],
  [-9.5, 4, 1.2],
  [-8, -7, 1.5],
  [3, 9.5, 1.1],
  [-4, 10, 1.3],
  [5, -10, 1.2],
  [-1, -10.5, 1],
  [18, 6, 1.6],
  [-18, -4, 1.5],
  [14, -17, 1.6],
  [-12, 19, 1.7],
  [4, 22, 1.5],
  [22, -6, 1.8],
];
for (const [x, z, s] of trees) addTree(x, z, s);

const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, flatShading: true });
for (const [x, z, s] of [
  [6.8, 6.8, 0.5],
  [-7, 0.5, 0.6],
  [1.5, -7.5, 0.4],
] as Array<[number, number, number]>) {
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s), rockMat);
  r.position.set(x, s * 0.5, z);
  r.castShadow = true;
  r.receiveShadow = true;
  scene.add(r);
}

// Bird (faces local +Z, wings along +/-X)
const paper = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, side: THREE.DoubleSide, roughness: 0.8 });

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const yawGroup = new THREE.Group(); // position + heading
const bankGroup = new THREE.Group(); // roll
const bird = new THREE.Group(); // bob offset
yawGroup.add(bankGroup);
bankGroup.add(bird);
scene.add(yawGroup);

const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), paper(0xf2f2f2)));
body.scale.set(0.8, 0.75, 1.5);
bird.add(body);

const head = new THREE.Group();
head.position.set(0, 0.28, 0.78);
bird.add(head);
head.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), paper(0xf2f2f2))));
const beak = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.38, 4), paper(0xf5a623)));
beak.rotation.x = Math.PI / 2;
beak.position.set(0, -0.03, 0.43);
head.add(beak);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
for (const s of [-1, 1]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat);
  eye.position.set(s * 0.15, 0.08, 0.2);
  head.add(eye);
}

// Tail fan
const tail = new THREE.Group();
tail.position.set(0, 0.0, -0.65);
bird.add(tail);
const featherColors = [0xe4572e, 0xf3a712, 0x29a0b1, 0xf3a712, 0xe4572e];
featherColors.forEach((c, i) => {
  const pivot = new THREE.Group();
  const spread = (i - 2) * 0.28;
  pivot.rotation.y = spread;
  pivot.rotation.x = -0.1;
  const f = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.9), paper(c)));
  f.position.z = -0.45;
  pivot.add(f);
  tail.add(pivot);
});

// Wings
const INNER = 0.9;
const OUTER = 0.9;
interface Wing {
  side: number;
  shoulder: THREE.Group;
  elbow: THREE.Group;
}
function makeWing(side: number): Wing {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.25, 0.12, 0.05);
  const inner = shadowed(new THREE.Mesh(new THREE.BoxGeometry(INNER, 0.04, 0.8), paper(0x4a90d9)));
  inner.position.x = side * INNER / 2;
  shoulder.add(inner);
  const elbow = new THREE.Group();
  elbow.position.x = side * INNER;
  shoulder.add(elbow);
  const outer = shadowed(new THREE.Mesh(new THREE.BoxGeometry(OUTER, 0.035, 0.55), paper(0x2e5fa8)));
  outer.position.set(side * OUTER / 2, 0, -0.1);
  elbow.add(outer);
  bird.add(shoulder);
  return { side, shoulder, elbow };
}
const wings = [makeWing(1), makeWing(-1)];

// Animation
const LOOP = 8;
const RADIUS = 6;
const HEIGHT = 4;
const FLAP_HZ = 2;
const BANK = 0.4;
const tmp = new THREE.Vector3();

function update(t: number): void {
  const a = (t / LOOP) * Math.PI * 2;
  const phase = t * FLAP_HZ * Math.PI * 2;

  yawGroup.position.set(Math.cos(a) * RADIUS, HEIGHT, Math.sin(a) * RADIUS);
  yawGroup.rotation.y = -a; // heading along tangent (-sin a, cos a)
  bankGroup.rotation.z = BANK; // raise outer wing, lower inner (center is local -X)

  bird.position.y = 0.14 * Math.sin(phase + 0.3);

  for (const w of wings) {
    w.shoulder.rotation.z = w.side * 0.55 * Math.sin(phase);
    w.elbow.rotation.z = w.side * 0.45 * Math.sin(phase - 0.9);
  }
  tail.rotation.x = 0.08 * Math.sin(phase - 0.6);
  head.rotation.x = 0.04 * Math.sin(phase - 0.3);

  // Chase camera outside the circle, trailing slightly behind the bird
  const ca = a - 0.55;
  camera.position.set(Math.cos(ca) * 15, HEIGHT + 3.5, Math.sin(ca) * 15);
  yawGroup.getWorldPosition(tmp);
  camera.lookAt(tmp.x * 0.9, tmp.y - 0.4, tmp.z * 0.9);
}

const start = performance.now();
let ready = false;
function frame(now: number): void {
  const t = (((now - start) / 1000) % LOOP + LOOP) % LOOP;
  update(t);
  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
