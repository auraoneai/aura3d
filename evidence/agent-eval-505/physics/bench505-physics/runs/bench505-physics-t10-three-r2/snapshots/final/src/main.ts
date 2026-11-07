import * as THREE from 'three';
import { Body, World } from './physics';

declare global {
  interface Window {
    __TASK_STATE__: {
      readonly phase: 'ready' | 'running' | 'settled';
      readonly total: number;
      readonly toppled: number;
      readonly ballReleased: boolean;
    };
    __EVAL_READY__?: boolean;
  }
}

// ------------------------------------------------------------------ constants
const TILE_COUNT = 30;
const TILE_SIZE = new THREE.Vector3(0.2, 1.0, 0.5); // thickness (along path), height, width
const TILE_SPACING = 0.6;
const TILE_MASS = 0.3;
const BALL_RADIUS = 0.35;
const BALL_MASS = 1.5;
const RAMP_LEN = 1.5;
const RAMP_THICK = 0.16;
const RAMP_WIDTH = 1.0;
const RAMP_ANGLE = (15 * Math.PI) / 180;
const RAMP_TO_FIRST = 1.4; // from ramp foot to first tile centre
const BALL_START_ON_RAMP = 1.2;
const DT = 1 / 240;
const MAX_FRAME = 0.1;
const TOPPLE_COS = Math.cos((60 * Math.PI) / 180);

// ------------------------------------------------------------------ layout
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

interface Placement {
  x: number;
  z: number;
  heading: number;
}

function buildPath(): Placement[] {
  const total = (TILE_COUNT - 1) * TILE_SPACING;
  const heading = (s: number) => 0.95 * Math.sin((2 * Math.PI * s) / total);
  const pts: Placement[] = [];
  let x = 0;
  let z = 0;
  for (let i = 0; i < TILE_COUNT; i++) {
    const s = i * TILE_SPACING;
    pts.push({ x, z, heading: heading(s) });
    const hm = heading(s + TILE_SPACING / 2);
    x += TILE_SPACING * Math.cos(hm);
    z += TILE_SPACING * Math.sin(hm);
  }
  return pts;
}

const path = buildPath();
// ramp occupies -x of first tile (first heading is 0)
const rampFootX = path[0].x - RAMP_TO_FIRST;
const rampTopX = rampFootX - RAMP_LEN * Math.cos(RAMP_ANGLE) - 0.3;
let minX = rampTopX;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (const p of path) {
  maxX = Math.max(maxX, p.x + 0.3);
  minX = Math.min(minX, p.x - 0.3);
  minZ = Math.min(minZ, p.z - 0.4);
  maxZ = Math.max(maxZ, p.z + 0.4);
}
const offX = -(minX + maxX) / 2;
const offZ = -(minZ + maxZ) / 2;
for (const p of path) {
  p.x += offX;
  p.z += offZ;
}
const halfSpanX = (maxX - minX) / 2;

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2230);

const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 100);
{
  const tanH = Math.tan(THREE.MathUtils.degToRad(20)) * (640 / 360);
  const dist = (halfSpanX + 1.2) / tanH;
  const dir = new THREE.Vector3(0, 0.78, 0.63).normalize();
  const target = new THREE.Vector3(0, 0, 0.2);
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.lookAt(target);
}

// lights
scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a3a2a, 0.7));
const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
key.position.set(-6, 12, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -13;
key.shadow.camera.right = 13;
key.shadow.camera.top = 9;
key.shadow.camera.bottom = -9;
key.shadow.camera.near = 1;
key.shadow.camera.far = 40;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 5;
scene.add(key);

// ------------------------------------------------------------------ materials
function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#8a5d38';
  g.fillRect(0, 0, c.width, c.height);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 90; i++) {
    const y = rnd() * c.height;
    g.strokeStyle = `rgba(${50 + rnd() * 40},${25 + rnd() * 25},10,${0.1 + rnd() * 0.18})`;
    g.lineWidth = 1 + rnd() * 3;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(c.width * 0.3, y + rnd() * 10 - 5, c.width * 0.6, y + rnd() * 10 - 5, c.width, y + rnd() * 6 - 3);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

const tableMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.75, metalness: 0.0 });
const rampMat = new THREE.MeshStandardMaterial({ color: 0x3c6e91, roughness: 0.5, metalness: 0.1 });
const ballMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.22, metalness: 0.9 });

// table (visual; physics uses the y = 0 plane)
const table = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 16), tableMat);
table.position.y = -0.2;
table.receiveShadow = true;
scene.add(table);

// ------------------------------------------------------------------ physics bodies
const world = new World();

// ramp
const rampFoot = new THREE.Vector3(rampFootX + offX, 0, path[0].z);
const rampUp = new THREE.Vector3(-Math.cos(RAMP_ANGLE), Math.sin(RAMP_ANGLE), 0);
const rampNormal = new THREE.Vector3(Math.sin(RAMP_ANGLE), Math.cos(RAMP_ANGLE), 0);
const rampCenter = rampFoot
  .clone()
  .addScaledVector(rampUp, RAMP_LEN / 2)
  .addScaledVector(rampNormal, -RAMP_THICK / 2);
const rampQ = new THREE.Quaternion().setFromAxisAngle(AXIS_Z, Math.PI - RAMP_ANGLE);
const rampBody = Body.box(new THREE.Vector3(RAMP_LEN, RAMP_THICK, RAMP_WIDTH), 1, rampCenter, rampQ, true);
rampBody.mu = 0.6;
world.add(rampBody);

const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(RAMP_LEN, RAMP_THICK, RAMP_WIDTH), rampMat);
rampMesh.position.copy(rampCenter);
rampMesh.quaternion.copy(rampQ);
rampMesh.castShadow = true;
rampMesh.receiveShadow = true;
scene.add(rampMesh);

// ramp support post under the high end
{
  const topPt = rampFoot.clone().addScaledVector(rampUp, RAMP_LEN - 0.15);
  const underY = topPt.y - RAMP_THICK / Math.cos(RAMP_ANGLE);
  const postH = Math.max(underY, 0.05);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, postH, RAMP_WIDTH * 0.8), rampMat);
  post.position.set(topPt.x, postH / 2, topPt.z);
  post.castShadow = true;
  post.receiveShadow = true;
  scene.add(post);
}

// ball
const ballStart = rampFoot
  .clone()
  .addScaledVector(rampUp, BALL_START_ON_RAMP)
  .addScaledVector(rampNormal, BALL_RADIUS + 0.001);
const ball = Body.sphere(BALL_RADIUS, BALL_MASS, ballStart);
ball.mu = 0.6;
ball.linDamp = 0.05;
ball.angDamp = 0.4;
ball.asleep = true;
ball.locked = true;
ball.saveInitial();
world.add(ball);

const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 20), ballMat);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);

// tiles
const tiles: Body[] = [];
const tileMeshes: THREE.Mesh[] = [];
const tileGeom = new THREE.BoxGeometry(TILE_SIZE.x, TILE_SIZE.y, TILE_SIZE.z);
for (let i = 0; i < TILE_COUNT; i++) {
  const p = path[i];
  const q = new THREE.Quaternion().setFromAxisAngle(AXIS_Y, -p.heading);
  const pos = new THREE.Vector3(p.x, TILE_SIZE.y / 2, p.z);
  const body = Body.box(TILE_SIZE, TILE_MASS, pos, q, false);
  body.mu = 0.5;
  body.asleep = true;
  body.saveInitial();
  world.add(body);
  tiles.push(body);

  const color = new THREE.Color().setHSL((i / TILE_COUNT) * 0.8, 0.6, 0.62);
  const mesh = new THREE.Mesh(
    tileGeom,
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.0 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  tileMeshes.push(mesh);
}

// ------------------------------------------------------------------ state
let ballReleased = false;
let phase: 'ready' | 'running' | 'settled' = 'ready';
let toppled = 0;
let tilesTouched = false;
let simTimeSinceRelease = 0;

const internal: { phase: 'ready' | 'running' | 'settled'; total: number; toppled: number; ballReleased: boolean } = { phase, total: TILE_COUNT, toppled, ballReleased };
const publicState = {} as Window['__TASK_STATE__'];
Object.defineProperties(publicState, {
  phase: { get: () => internal.phase, enumerable: true },
  total: { get: () => internal.total, enumerable: true },
  toppled: { get: () => internal.toppled, enumerable: true },
  ballReleased: { get: () => internal.ballReleased, enumerable: true },
});
Object.defineProperty(window, '__TASK_STATE__', { value: publicState, writable: false, configurable: false });

// ------------------------------------------------------------------ UI
const ui = document.createElement('div');
ui.style.cssText =
  'position:absolute;left:10px;top:318px;display:flex;gap:8px;align-items:center;z-index:10;';
function makeButton(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    'font:600 13px system-ui,sans-serif;padding:6px 14px;border:0;border-radius:5px;background:#f2c14e;color:#222;cursor:pointer;';
  return b;
}
const releaseBtn = makeButton('Release');
const resetBtn = makeButton('Reset');
resetBtn.style.background = '#d9dee7';
const label = document.createElement('span');
label.style.cssText = 'font:12px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000;margin-left:6px;';
ui.append(releaseBtn, resetBtn, label);
document.body.appendChild(ui);

function release(): void {
  if (ballReleased) return;
  ballReleased = true;
  phase = 'running';
  ball.locked = false;
  ball.wake();
}

function reset(): void {
  world.reset();
  ballReleased = false;
  phase = 'ready';
  tilesTouched = false;
  simTimeSinceRelease = 0;
  accumulator = 0;
  syncMeshes();
  updateState();
}

releaseBtn.addEventListener('click', release);
resetBtn.addEventListener('click', reset);

// ------------------------------------------------------------------ loop
function syncMeshes(): void {
  for (let i = 0; i < TILE_COUNT; i++) {
    tileMeshes[i].position.copy(tiles[i].pos);
    tileMeshes[i].quaternion.copy(tiles[i].q);
  }
  ballMesh.position.copy(ball.pos);
  ballMesh.quaternion.copy(ball.q);
}

const upTmp = new THREE.Vector3();
function updateState(): void {
  let count = 0;
  let allAsleep = true;
  for (const t of tiles) {
    upTmp.set(0, 1, 0).applyQuaternion(t.q);
    if (upTmp.y < TOPPLE_COS) count++;
    if (!t.asleep) allAsleep = false;
  }
  toppled = count;
  if (ballReleased) {
    if (!allAsleep) tilesTouched = true;
    if (phase === 'running' && ((tilesTouched && allAsleep) || simTimeSinceRelease > 60)) {
      phase = 'settled';
    }
  }
  internal.phase = phase;
  internal.toppled = toppled;
  internal.ballReleased = ballReleased;
  label.textContent = `Toppled ${toppled} / ${TILE_COUNT}`;
}

let accumulator = 0;
let last = performance.now();
let firstFrame = true;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  accumulator += dt;
  while (accumulator >= DT) {
    world.step(DT);
    accumulator -= DT;
    if (ballReleased && phase === 'running') simTimeSinceRelease += DT;
  }
  syncMeshes();
  updateState();
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}

syncMeshes();
updateState();
requestAnimationFrame(frame);
