import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Body, World } from './physics';

type Phase = 'ready' | 'swinging' | 'settled';

interface TaskState {
  phase: Phase;
  crates: number;
  displaced: number;
  ballAngleDeg: number;
}

declare global {
  interface Window {
    readonly __TASK_STATE__: TaskState;
    __EVAL_READY__?: boolean;
  }
}

// ------------------------------------------------------------------ constants
const DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 12;
const ROWS = 5;
const PIVOT = new THREE.Vector3(0, 6.85, 0);
const ROPE_LENGTH = 6;
const BALL_RADIUS = 0.8;
const BALL_MASS = 12;
const PULL_ANGLE = THREE.MathUtils.degToRad(60);
const PULL_DURATION = 0.9;
const PYRAMID_CENTER_X = 3.4;
const DISPLACED_DISTANCE = 0.75;

// --------------------------------------------------------------- deterministic rng
let seed = 12345;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [c, ctx];
}

function srgbTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ----------------------------------------------------------------- textures
function makeConcreteTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = makeCanvas(S, S);
  g.fillStyle = '#a4a39c';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 30 + rand() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() < 0.5;
    grd.addColorStop(0, dark ? 'rgba(70,70,66,0.10)' : 'rgba(210,210,204,0.10)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9000; i++) {
    const v = rand() < 0.5 ? 40 : 230;
    g.fillStyle = `rgba(${v},${v},${v - 4},${0.04 + rand() * 0.1})`;
    g.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
  }
  // expansion joints on the tile border
  g.fillStyle = 'rgba(40,40,38,0.55)';
  g.fillRect(0, 0, S, 3);
  g.fillRect(0, 0, 3, S);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(0, 3, S, 2);
  g.fillRect(3, 0, 2, S);
  const t = srgbTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(20, 20);
  return t;
}

function makeCrateTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = makeCanvas(S, S);
  const planks = 5;
  const ph = S / planks;
  for (let i = 0; i < planks; i++) {
    const l = 52 + rand() * 10;
    g.fillStyle = `hsl(32, 48%, ${l}%)`;
    g.fillRect(0, i * ph, S, ph);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(90,52,20,${0.1 + rand() * 0.15})`;
      g.lineWidth = 1;
      const y = i * ph + 3 + rand() * (ph - 6);
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(S * 0.3, y + (rand() - 0.5) * 4, S * 0.6, y + (rand() - 0.5) * 4, S, y + (rand() - 0.5) * 3);
      g.stroke();
    }
    g.fillStyle = 'rgba(50,28,10,0.7)';
    g.fillRect(0, i * ph, S, 2);
  }
  // frame
  const B = 26;
  g.fillStyle = '#8a5a2b';
  g.fillRect(0, 0, S, B);
  g.fillRect(0, S - B, S, B);
  g.fillRect(0, 0, B, S);
  g.fillRect(S - B, 0, B, S);
  g.strokeStyle = 'rgba(40,22,8,0.8)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, S - 2, S - 2);
  g.strokeRect(B, B, S - 2 * B, S - 2 * B);
  // diagonal brace
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(Math.PI / 4);
  const diag = Math.hypot(S - 2 * B, S - 2 * B);
  g.fillStyle = '#7d4f24';
  g.fillRect(-diag / 2, -14, diag, 28);
  g.strokeStyle = 'rgba(40,22,8,0.8)';
  g.strokeRect(-diag / 2, -14, diag, 28);
  g.restore();
  // nails
  g.fillStyle = '#3a3a3a';
  for (const [x, y] of [
    [13, 13],
    [S - 13, 13],
    [13, S - 13],
    [S - 13, S - 13],
  ]) {
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }
  return srgbTexture(c);
}

function makeSkyTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(4, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#4f88cc');
  grd.addColorStop(0.55, '#8fbbe6');
  grd.addColorStop(1, '#d6e6f0');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// -------------------------------------------------------------------- renderer
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = makeSkyTexture();
scene.fog = new THREE.Fog(0xd2e3ee, 35, 90);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(42, 640 / 360, 0.1, 200);
camera.position.set(0.5, 5.2, 17.5);
camera.lookAt(-1.8, 4.0, 0);

// ---------------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x8a8478, 1.1);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff2dc, 3.0);
key.position.set(-5, 16, 10);
key.target.position.set(-1, 0, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -16;
key.shadow.camera.right = 16;
key.shadow.camera.top = 14;
key.shadow.camera.bottom = -14;
key.shadow.camera.near = 1;
key.shadow.camera.far = 45;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.03;
key.shadow.radius = 4;
scene.add(key);
scene.add(key.target);

// ---------------------------------------------------------------------- yard
const groundMat = new THREE.MeshStandardMaterial({ map: makeConcreteTexture(), roughness: 0.95, metalness: 0 });
const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x9b9b95, roughness: 0.95 });
const wall = new THREE.Mesh(new THREE.BoxGeometry(46, 2.2, 0.5), wallMat);
wall.position.set(-2, 1.1, -9);
wall.castShadow = true;
wall.receiveShadow = true;
scene.add(wall);
for (let i = -4; i <= 4; i++) {
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.7, 0.9), wallMat);
  p.position.set(-2 + i * 5.5, 1.35, -9);
  p.castShadow = true;
  p.receiveShadow = true;
  scene.add(p);
}

// ---------------------------------------------------------------------- crane
const paint = new THREE.MeshStandardMaterial({ color: 0xe3a712, roughness: 0.55, metalness: 0.2 });
const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.7 });
const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8c8c88, roughness: 0.95 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x3b5f7a, roughness: 0.2, metalness: 0.3 });

function beam(a: THREE.Vector3, b: THREE.Vector3, t: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, len), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.lookAt(b);
  m.castShadow = true;
  scene.add(m);
  return m;
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

function buildCrane(): void {
  const MX = -7.5;
  const W = 0.6;
  const baseY = 0.5;
  const topY = 8.8;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  box(2.6, 0.5, 2.6, MX, 0.25, 0, concreteMat);

  const corners: [number, number][] = [
    [-W, -W],
    [W, -W],
    [W, W],
    [-W, W],
  ];
  for (const [cx, cz] of corners) beam(V(MX + cx, baseY, cz), V(MX + cx, topY, cz), 0.16, paint);

  const levels: number[] = [];
  for (let y = baseY; y < topY - 0.01; y += 1.4) levels.push(y);
  levels.push(topY);
  for (let li = 0; li < levels.length; li++) {
    const y = levels[li];
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = corners[i];
      const [x2, z2] = corners[(i + 1) % 4];
      beam(V(MX + x1, y, z1), V(MX + x2, y, z2), 0.09, paint);
      if (li + 1 < levels.length) {
        const y2 = levels[li + 1];
        if (li % 2 === 0) beam(V(MX + x1, y, z1), V(MX + x2, y2, z2), 0.07, paint);
        else beam(V(MX + x2, y, z2), V(MX + x1, y2, z1), 0.07, paint);
      }
    }
  }

  // jib (working arm) and rear counter-jib
  const jibY = 7.25;
  const tipX = 1.2;
  const rearX = -10;
  for (const z of [-0.3, 0.3]) beam(V(rearX, jibY, z), V(tipX, jibY, z), 0.12, paint);
  for (let x = rearX; x <= tipX; x += 0.8) beam(V(x, jibY, -0.3), V(x, jibY, 0.3), 0.07, paint);
  const topAt = (x: number) => 7.9 - (0.65 * (x - MX)) / (tipX - MX);
  beam(V(MX, 7.9, 0), V(tipX, jibY, 0), 0.1, paint);
  for (let x = MX; x + 1 <= tipX + 0.01; x += 1) {
    for (const z of [-0.3, 0.3]) {
      beam(V(x, jibY, z), V(x + 0.5, topAt(x + 0.5), 0), 0.06, paint);
      beam(V(x + 0.5, topAt(x + 0.5), 0), V(x + 1, jibY, z), 0.06, paint);
    }
  }
  // A-frame apex and tie cables
  const apex = V(MX, 9.7, 0);
  for (const [cx, cz] of corners) beam(V(MX + cx, topY, cz), apex, 0.1, paint);
  beam(apex, V(tipX, jibY, 0), 0.05, darkSteel);
  beam(apex, V(rearX, jibY, 0), 0.05, darkSteel);

  box(1.1, 1.0, 1.0, rearX + 0.7, jibY - 0.6, 0, concreteMat);
  box(0.95, 0.95, 0.95, MX + 0.2, 6.55, 1.0, glassMat);
  box(0.7, 0.3, 0.7, PIVOT.x, PIVOT.y + 0.19, 0, darkSteel);
  const pulley = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), darkSteel);
  pulley.position.copy(PIVOT);
  scene.add(pulley);
}
buildCrane();

// --------------------------------------------------------------------- physics
const world = new World();

const ball = new Body(1, 'sphere');
ball.radius = BALL_RADIUS;
ball.invMass = 1 / BALL_MASS;
ball.invInertia = 1 / (0.4 * BALL_MASS * BALL_RADIUS * BALL_RADIUS);
ball.friction = 0.35;
ball.restitution = 0.2;
ball.linDamp = 0.05;
ball.angDamp = 0.5;
ball.canSleep = false;
world.add(ball);
world.pendulum = { body: ball, pivot: PIVOT, length: ROPE_LENGTH };

const crates: Body[] = [];
const crateStart: THREE.Vector3[] = [];
let nextId = 2;
for (let row = 0; row < ROWS; row++) {
  const count = ROWS - row;
  for (let i = 0; i < count; i++) {
    const b = new Body(nextId++, 'box');
    b.invMass = 1;
    b.invInertia = 6; // unit cube, mass 1: I = m/6
    b.friction = 0.6;
    b.restitution = 0.1;
    b.linDamp = 0.02;
    b.angDamp = 0.15;
    b.pos.set(PYRAMID_CENTER_X + (i - (count - 1) / 2), 0.5 + row, 0);
    crateStart.push(b.pos.clone());
    crates.push(b);
    world.add(b);
  }
}

// ---------------------------------------------------------------------- meshes
const crateTex = makeCrateTexture();
const crateGeo = new THREE.BoxGeometry(1, 1, 1);
const crateMeshes = crates.map((_, i) => {
  const tint = 0.88 + 0.12 * ((i * 37) % 11) / 10;
  const mat = new THREE.MeshStandardMaterial({
    map: crateTex,
    color: new THREE.Color(tint, tint * 0.98, tint * 0.95),
    roughness: 0.85,
    metalness: 0,
  });
  const m = new THREE.Mesh(crateGeo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  return m;
});

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_RADIUS, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.3, metalness: 0.95 }),
);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);

const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 8), darkSteel);
ropeMesh.castShadow = true;
scene.add(ropeMesh);
const eyeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), darkSteel);
eyeMesh.castShadow = true;
scene.add(eyeMesh);

// ------------------------------------------------------------------ game state
let phase: Phase = 'ready';
let pulling = false;
let pullTime = 0;
let pullFrom = 0;
let released = false;
let releaseTime = 0;
let hit = false;
let quietTime = 0;

function setBallAngle(rad: number): void {
  ball.pos.set(PIVOT.x - ROPE_LENGTH * Math.sin(rad), PIVOT.y - ROPE_LENGTH * Math.cos(rad), 0);
  ball.vel.set(0, 0, 0);
  ball.ang.set(0, 0, 0);
}

function currentBallAngle(): number {
  return Math.atan2(PIVOT.x - ball.pos.x, PIVOT.y - ball.pos.y);
}

function resetScene(): void {
  crates.forEach((b, i) => {
    b.pos.copy(crateStart[i]);
    b.quat.identity();
    b.vel.set(0, 0, 0);
    b.ang.set(0, 0, 0);
    b.sleeping = true;
    b.sleepTimer = 0;
  });
  ball.quat.identity();
  ball.kinematic = true;
  setBallAngle(0);
  world.clearCache();
  pulling = false;
  released = false;
  hit = false;
  quietTime = 0;
  releaseTime = 0;
  phase = 'ready';
}

function startSwing(): void {
  if (pulling) return;
  pulling = true;
  pullTime = 0;
  pullFrom = currentBallAngle();
  released = false;
  hit = false;
  quietTime = 0;
  ball.kinematic = true;
  phase = 'swinging';
}

function simStep(): void {
  if (pulling) {
    pullTime += DT;
    const u = Math.min(pullTime / PULL_DURATION, 1);
    const s = u * u * (3 - 2 * u);
    setBallAngle(pullFrom + (PULL_ANGLE - pullFrom) * s);
    if (u >= 1) {
      pulling = false;
      ball.kinematic = false;
      released = true;
      releaseTime = 0;
    }
  }

  world.step(DT);

  if (released) {
    releaseTime += DT;
    let maxSpeed = 0;
    for (const c of crates) {
      if (!c.sleeping) maxSpeed = Math.max(maxSpeed, c.vel.length());
    }
    if (maxSpeed > 0.5) hit = true;
    quietTime = maxSpeed < 0.15 ? quietTime + DT : 0;
    phase = (hit || releaseTime > 9) && quietTime >= 1.0 ? 'settled' : 'swinging';
  } else if (pulling) {
    phase = 'swinging';
  } else {
    phase = 'ready';
  }
}

// -------------------------------------------------------------------------- UI
const ui = document.createElement('div');
ui.style.cssText = 'position:absolute;left:10px;top:318px;display:flex;gap:8px;align-items:center;';
function makeButton(id: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.id = id;
  b.textContent = label;
  b.type = 'button';
  b.style.cssText =
    'font:600 14px system-ui,sans-serif;padding:5px 14px;border:0;border-radius:4px;color:#fff;background:#c0392b;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.4);';
  b.addEventListener('click', onClick);
  ui.appendChild(b);
  return b;
}
makeButton('swing', 'Swing', startSwing);
const resetBtn = makeButton('reset', 'Reset', resetScene);
resetBtn.style.background = '#34495e';
document.body.appendChild(ui);

const hud = document.createElement('div');
hud.style.cssText =
  'position:absolute;left:500px;top:8px;padding:3px 8px;border-radius:4px;background:rgba(0,0,0,.45);color:#fff;font:12px system-ui,sans-serif;pointer-events:none;';
document.body.appendChild(hud);

// ------------------------------------------------------------------ state export
let taskState: TaskState = { phase: 'ready', crates: crates.length, displaced: 0, ballAngleDeg: 0 };
Object.defineProperty(window, '__TASK_STATE__', {
  get: () => taskState,
  enumerable: true,
  configurable: false,
});

let lastHud = '';
function updateState(): void {
  let displaced = 0;
  for (let i = 0; i < crates.length; i++) {
    if (crates[i].pos.distanceTo(crateStart[i]) > DISPLACED_DISTANCE) displaced++;
  }
  taskState = Object.freeze({
    phase,
    crates: crates.length,
    displaced,
    ballAngleDeg: THREE.MathUtils.radToDeg(currentBallAngle()),
  });
  const text = `Displaced ${displaced}/${crates.length}`;
  if (text !== lastHud) {
    hud.textContent = text;
    lastHud = text;
  }
}

// --------------------------------------------------------------------- render
const up = new THREE.Vector3(0, 1, 0);
const ropeDir = new THREE.Vector3();
const ropeEnd = new THREE.Vector3();

function syncMeshes(): void {
  crates.forEach((b, i) => {
    crateMeshes[i].position.copy(b.pos);
    crateMeshes[i].quaternion.copy(b.quat);
  });
  ballMesh.position.copy(ball.pos);
  ballMesh.quaternion.copy(ball.quat);

  ropeDir.subVectors(ball.pos, PIVOT).normalize();
  ropeEnd.copy(ball.pos).addScaledVector(ropeDir, -BALL_RADIUS);
  const len = ropeEnd.distanceTo(PIVOT);
  ropeMesh.scale.set(1, len, 1);
  ropeMesh.position.copy(PIVOT).add(ropeEnd).multiplyScalar(0.5);
  ropeMesh.quaternion.setFromUnitVectors(up, ropeDir);
  eyeMesh.position.copy(ropeEnd);
}

resetScene();
updateState();

let lastTime = -1;
let acc = 0;
let firstFrame = true;

function frame(t: number): void {
  requestAnimationFrame(frame);
  if (lastTime < 0) lastTime = t;
  const delta = Math.min(0.1, Math.max(0, (t - lastTime) / 1000));
  lastTime = t;
  acc += delta;
  let steps = 0;
  while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
    simStep();
    acc -= DT;
    steps++;
  }
  if (steps >= MAX_STEPS_PER_FRAME) acc = 0;

  // ball rotation integration is done by the physics body; keep orientation in sync
  syncMeshes();
  updateState();
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__EVAL_READY__ = true;
  }
}
requestAnimationFrame(frame);
