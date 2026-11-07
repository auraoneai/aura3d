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
scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa77, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(12, 22, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -26;
sun.shadow.camera.right = 26;
sun.shadow.camera.top = 26;
sun.shadow.camera.bottom = -26;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0005;
scene.add(sun);

// Ground
const ground = new THREE.Mesh(
  new THREE.CylinderGeometry(30, 30, 0.4, 64),
  new THREE.MeshStandardMaterial({ color: 0x7cb860, roughness: 1 }),
);
ground.position.y = -0.2;
ground.receiveShadow = true;
scene.add(ground);

// Props: cone trees
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d3c, roughness: 0.9 });
function addTree(x: number, z: number, s: number): void {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1, 10), trunkMat);
  trunk.position.y = 0.5;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 14), leafMat);
  cone.position.y = 2.2;
  const cone2 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.8, 14), leafMat);
  cone2.position.y = 3.3;
  for (const m of [trunk, cone, cone2]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  scene.add(g);
}
addTree(0, 0, 1.3);
addTree(2.2, -1.5, 0.9);
addTree(-2, 1.8, 1.0);
addTree(-1.5, -2.5, 0.8);
const outer: Array<[number, number, number]> = [
  [24, 4, 1.4], [22, -10, 1.1], [-23, 8, 1.3], [-20, -12, 1.0],
  [5, 24, 1.2], [-8, 23, 1.4], [10, -24, 1.2], [-4, -25, 1.0],
  [19, 17, 1.1], [-18, 19, 1.2],
];
for (const [x, z, s] of outer) addTree(x, z, s);

const rock = new THREE.Mesh(
  new THREE.DodecahedronGeometry(0.7),
  new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1 }),
);
rock.position.set(9.5, 0.3, 9.5);
rock.castShadow = true;
rock.receiveShadow = true;
scene.add(rock);

// Bird (faces local +Z, +X is its left side)
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8553d, roughness: 0.7 });
const wingMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.8, side: THREE.DoubleSide });
const wingTipMat = new THREE.MeshStandardMaterial({ color: 0x3b6fd1, roughness: 0.8, side: THREE.DoubleSide });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x3b6fd1, roughness: 0.8, side: THREE.DoubleSide });
const beakMat = new THREE.MeshStandardMaterial({ color: 0xf5b82e, roughness: 0.6 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

const bird = new THREE.Group(); // path position, yaw, bank
bird.rotation.order = 'YXZ';
scene.add(bird);
const flyer = new THREE.Group(); // flap bob inside
bird.add(flyer);

const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), bodyMat));
body.scale.set(0.8, 0.75, 1.6);
flyer.add(body);

const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 14), bodyMat));
head.position.set(0, 0.2, 0.62);
flyer.add(head);

const beak = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 12), beakMat));
beak.rotation.x = Math.PI / 2;
beak.position.set(0, 0.17, 0.97);
flyer.add(beak);

for (const side of [1, -1]) {
  const eye = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeMat));
  eye.position.set(side * 0.13, 0.28, 0.78);
  flyer.add(eye);
}

// Tail fan: 5 feathers
const tailPivot = new THREE.Group();
tailPivot.position.set(0, 0.02, -0.55);
flyer.add(tailPivot);
const featherCount = 5;
for (let i = 0; i < featherCount; i++) {
  const a = (i - (featherCount - 1) / 2) * 0.22;
  const pivot = new THREE.Group();
  pivot.rotation.y = a;
  const f = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.55), tailMat));
  f.position.z = -0.27;
  pivot.add(f);
  tailPivot.add(pivot);
}

// Wings
interface Wing {
  inner: THREE.Group;
  outer: THREE.Group;
  sign: number;
}
function makeWing(sign: number): Wing {
  const inner = new THREE.Group();
  inner.position.set(sign * 0.25, 0.1, 0.05);
  const innerMesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, 0.6), wingMat));
  innerMesh.position.x = sign * 0.45;
  inner.add(innerMesh);

  const outer = new THREE.Group();
  outer.position.set(sign * 0.9, 0, 0);
  const outerMesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.03, 0.42), wingTipMat));
  outerMesh.position.set(sign * 0.475, 0, -0.06);
  outer.add(outerMesh);
  inner.add(outer);
  flyer.add(inner);
  return { inner, outer, sign };
}
const wings = [makeWing(1), makeWing(-1)];

// Animation
const LOOP = 8;
const RADIUS = 6;
const HEIGHT = 4;
const OMEGA = (Math.PI * 2) / LOOP;
const FLAP_HZ = 2;
const BANK = 0.45;

function update(t: number): void {
  const th = OMEGA * t;
  // Counter-clockwise from above; left turn.
  bird.position.set(RADIUS * Math.cos(th), HEIGHT, -RADIUS * Math.sin(th));
  const tx = -Math.sin(th);
  const tz = -Math.cos(th);
  bird.rotation.y = Math.atan2(tx, tz);
  bird.rotation.z = -BANK; // bank toward the center (left)

  const phi = Math.PI * 2 * FLAP_HZ * t;
  for (const w of wings) {
    w.inner.rotation.z = w.sign * 0.6 * Math.sin(phi);
    w.outer.rotation.z = w.sign * 0.75 * Math.sin(phi - 0.9);
    // slight sweep so the tip trails
    w.outer.rotation.y = -w.sign * 0.12 * Math.cos(phi - 0.9);
  }
  flyer.position.y = -0.12 * Math.sin(phi); // rises on the downstroke
  tailPivot.rotation.x = 0.1 * Math.sin(phi - 1.2);

  // Chase camera outside the circle, slightly behind the bird.
  const camAng = th - 0.35;
  const camR = RADIUS + 8;
  camera.position.set(camR * Math.cos(camAng), HEIGHT + 3.2, -camR * Math.sin(camAng));
  camera.lookAt(bird.position);
}

function frame(now: number): void {
  const t = (now / 1000) % LOOP;
  update(t);
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
