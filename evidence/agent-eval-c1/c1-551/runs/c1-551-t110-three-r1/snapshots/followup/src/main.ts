import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { lightsOn: boolean; pendulumAngleDeg: number };
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x1a120c);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(35, 640 / 360, 0.1, 100);
camera.position.set(0, 3.7, 12.5);
camera.lookAt(0, 3.1, 0);

// ---------- materials ----------
const wood = new THREE.MeshStandardMaterial({ color: 0x7a4422, roughness: 0.6, metalness: 0.05 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x4e2812, roughness: 0.55 });
const brass = new THREE.MeshStandardMaterial({ color: 0xd9a638, roughness: 0.3, metalness: 0.9, emissive: 0x2a1c04 });
const faceMat = new THREE.MeshStandardMaterial({ color: 0xf3e8c8, roughness: 0.8 });
const inkMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.6 });
const redMat = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.5 });
const interiorMat = new THREE.MeshStandardMaterial({
  color: 0x6b3a1c,
  roughness: 0.9,
  emissive: 0x3a1e08,
});
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xcfe6ff,
  transparent: true,
  opacity: 0.12,
  roughness: 0.05,
  metalness: 0,
  depthWrite: false,
});

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------- room ----------
function plankTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    const v = 90 + ((i * 37) % 30);
    g.fillStyle = `rgb(${v + 30},${v - 10},${v - 45})`;
    g.fillRect(i * 32, 0, 32, 256);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(i * 32, 0, 2, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 20),
  new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.7 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, 4);
floor.receiveShadow = true;
scene.add(floor);

const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 14),
  new THREE.MeshStandardMaterial({ color: 0x9c7a55, roughness: 0.95 }),
);
wall.position.set(0, 7, -1.5);
wall.receiveShadow = true;
scene.add(wall);

// wainscot and baseboard
box(30, 1.6, 0.1, darkWood, 0, 0.8, -1.45);
box(30, 0.12, 0.14, wood, 0, 1.64, -1.43);

// ---------- clock case ----------
const clock = new THREE.Group();
scene.add(clock);

// base
box(2.4, 0.7, 1.2, darkWood, 0, 0.35, 0, clock);
box(2.5, 0.12, 1.3, wood, 0, 0.72, 0, clock);
// trunk: sides, rails, back
box(0.2, 2.85, 1.0, wood, -0.9, 2.2, 0, clock);
box(0.2, 2.85, 1.0, wood, 0.9, 2.2, 0, clock);
box(2.0, 0.3, 1.0, wood, 0, 3.4, 0, clock); // top rail y 3.25..3.55
box(2.0, 0.25, 1.0, wood, 0, 0.95, 0, clock); // bottom rail y 0.825..1.075
// opening spans x +-0.8, y ~1.075..3.25
box(1.6, 2.2, 0.05, interiorMat, 0, 2.17, -0.45, clock);
// glass
const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.18), glassMat);
glass.position.set(0, 2.16, 0.47);
glass.renderOrder = 5;
clock.add(glass);
// brass trim around opening
box(1.66, 0.03, 0.04, brass, 0, 1.09, 0.5, clock);
box(1.66, 0.03, 0.04, brass, 0, 3.24, 0.5, clock);
box(0.03, 2.18, 0.04, brass, -0.81, 2.16, 0.5, clock);
box(0.03, 2.18, 0.04, brass, 0.81, 2.16, 0.5, clock);

// hood
box(2.2, 2.0, 1.1, wood, 0, 4.55, 0, clock);
box(2.45, 0.2, 1.25, darkWood, 0, 5.65, 0, clock);
box(1.8, 0.2, 1.0, darkWood, 0, 5.85, 0, clock);
box(2.35, 0.12, 1.2, darkWood, 0, 3.57, 0, clock);
const finial = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), brass);
finial.position.set(0, 6.05, 0);
finial.castShadow = true;
clock.add(finial);

// face
const faceZ = 0.551;
const face = new THREE.Mesh(new THREE.CircleGeometry(0.85, 64), faceMat);
face.position.set(0, 4.55, faceZ);
face.receiveShadow = true;
clock.add(face);
const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.05, 12, 64), brass);
bezel.position.set(0, 4.55, faceZ);
bezel.castShadow = true;
clock.add(bezel);

for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const major = i % 3 === 0;
  const w = major ? 0.07 : 0.045;
  const h = major ? 0.2 : 0.14;
  const r = 0.72;
  const m = box(w, h, 0.01, inkMat, Math.sin(a) * r, 4.55 + Math.cos(a) * r, faceZ + 0.005, clock);
  m.rotation.z = -a;
  m.castShadow = false;
}

function makeHand(len: number, tail: number, width: number, mat: THREE.Material, z: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(width, len + tail, 0.012);
  geo.translate(0, (len - tail) / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  g.add(m);
  g.position.set(0, 4.55, faceZ + z);
  clock.add(g);
  return g;
}
const hourHand = makeHand(0.45, 0.08, 0.06, inkMat, 0.012);
const minuteHand = makeHand(0.68, 0.1, 0.04, inkMat, 0.026);
const secondHand = makeHand(0.74, 0.14, 0.015, redMat, 0.04);
const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), brass);
hub.rotation.x = Math.PI / 2;
hub.position.set(0, 4.55, faceZ + 0.055);
clock.add(hub);

// ---------- pendulum ----------
const pivotY = 3.25;
const rodLen = 2.0;
const pendulum = new THREE.Group();
pendulum.position.set(0, pivotY, 0.1);
clock.add(pendulum);
box(0.03, rodLen, 0.02, brass, 0, -rodLen / 2, 0, pendulum);
const bobGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.07, 40);
bobGeo.rotateX(Math.PI / 2);
const bob = new THREE.Mesh(bobGeo, brass);
bob.position.set(0, -rodLen, 0);
bob.castShadow = true;
pendulum.add(bob);
const bobCore = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), darkWood);
bobCore.position.set(0, -rodLen, 0.05);
pendulum.add(bobCore);
const pivotCap = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), brass);
pendulum.add(pivotCap);

// ---------- weights ----------
const weightH = 0.7;
const weightTopStart = 2.95;
const chainTop = pivotY;
interface Weight {
  group: THREE.Group;
  chain: THREE.Mesh;
}
function makeWeight(x: number): Weight {
  const group = new THREE.Group();
  group.position.set(x, 0, -0.2);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, weightH, 20), brass);
  body.position.y = -weightH / 2;
  body.castShadow = true;
  group.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, 0.08, 20), brass);
  cap.position.y = 0.04;
  group.add(cap);
  clock.add(group);
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.015, 1, 0.015), inkMat);
  chain.position.x = x;
  chain.position.z = -0.2;
  clock.add(chain);
  return { group, chain };
}
const weights = [makeWeight(-0.55), makeWeight(0.55)];
const bottomLimit = 1.2 + weightH; // lowest allowed weight top

function updateWeights(t: number): void {
  const top = Math.max(bottomLimit, weightTopStart - t * 0.01);
  for (const w of weights) {
    w.group.position.y = top;
    const len = chainTop - top;
    w.chain.scale.y = len;
    w.chain.position.y = top + len / 2;
  }
}

// ---------- lights ----------
const ambient = new THREE.AmbientLight(0xffe2bd, 0.9);
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0xffe0b0, 0x4a2c14, 0.6);
scene.add(hemi);

const key = new THREE.SpotLight(0xffd29a, 260, 40, Math.PI / 5, 0.6, 1.6);
key.position.set(4, 9, 9);
key.target.position.set(0, 2.5, 0);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0005;
scene.add(key, key.target);

// warm interior light behind the glass
const interior = new THREE.PointLight(0xffa850, 6, 5, 1.5);
interior.position.set(0, 2.4, 0.3);
clock.add(interior);
const faceLight = new THREE.PointLight(0xffc880, 4, 3, 1.5);
faceLight.position.set(0, 4.6, 1.4);
clock.add(faceLight);

// ---------- lights on/off ----------
let lightsOn = true;
interface LightLevels {
  ambient: number;
  hemi: number;
  key: number;
  interior: number;
  face: number;
  ambientColor: number;
  clear: number;
}
const dayLevels: LightLevels = { ambient: 0.9, hemi: 0.6, key: 260, interior: 6, face: 4, ambientColor: 0xffe2bd, clear: 0x1a120c };
const nightLevels: LightLevels = { ambient: 0.22, hemi: 0.1, key: 12, interior: 3, face: 4.5, ambientColor: 0x6f86c8, clear: 0x05070d };

function applyLights(): void {
  const l = lightsOn ? dayLevels : nightLevels;
  ambient.intensity = l.ambient;
  ambient.color.setHex(l.ambientColor);
  hemi.intensity = l.hemi;
  key.intensity = l.key;
  key.color.setHex(lightsOn ? 0xffd29a : 0x8fa4e0);
  interior.intensity = l.interior;
  faceLight.intensity = l.face;
  renderer.setClearColor(l.clear);
}

const button = document.createElement('button');
button.id = 'lights-toggle';
button.type = 'button';
button.textContent = 'Lights off';
button.style.cssText = 'display:block;margin:8px 0 0 8px;padding:6px 14px;font:inherit;cursor:pointer;';
button.addEventListener('click', () => {
  lightsOn = !lightsOn;
  button.textContent = lightsOn ? 'Lights off' : 'Lights on';
  applyLights();
});
canvas.insertAdjacentElement('afterend', button);

// ---------- animation ----------
const PERIOD = 2; // seconds
const AMPLITUDE = 0.17; // radians

function frame(): void {
  const now = new Date();
  const ms = now.getTime();
  const t = ms / 1000;

  // eased swing: sinusoid, slowest at the extremes
  pendulum.rotation.z = AMPLITUDE * Math.sin((2 * Math.PI * t) / PERIOD);

  const sec = now.getSeconds();
  const min = now.getMinutes() + sec / 60;
  const hr = (now.getHours() % 12) + min / 60;
  secondHand.rotation.z = -(sec / 60) * Math.PI * 2; // one tick per second
  minuteHand.rotation.z = -(min / 60) * Math.PI * 2;
  hourHand.rotation.z = -(hr / 12) * Math.PI * 2;

  updateWeights(performance.now() / 1000);

  window.__TASK_STATE__ = {
    lightsOn,
    pendulumAngleDeg: THREE.MathUtils.radToDeg(pendulum.rotation.z),
  };

  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
