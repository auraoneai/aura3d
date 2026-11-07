import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Body, World } from './physics';

interface TaskState {
  phase: 'ready' | 'running' | 'settled';
  total: number;
  toppled: number;
  ballReleased: boolean;
}

declare global {
  interface Window {
    __TASK_STATE__: Readonly<TaskState>;
    __EVAL_READY__?: boolean;
  }
}

const DT = 1 / 240;
const TILE_COUNT = 30;
const TILE_W = 0.2;
const TILE_H = 1.0;
const TILE_D = 0.5;
const SPACING = 0.55;
const BALL_R = 0.28;
const RAMP_ANGLE = (25 * Math.PI) / 180;
const RAMP_LEN = 1.8;
const RAMP_THICK = 0.2;
const RAMP_WIDTH = 1.0;

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
renderer.setClearColor(new Color(0x1b2230));

const scene = new Scene();
const world = new World();
const Y = new Vector3(0, 1, 0);

// ---------- layout ----------
interface TilePose { x: number; z: number; heading: number }
const poses: TilePose[] = [];
{
  const total = (TILE_COUNT - 1) * SPACING;
  const amp = 1.0;
  const ds = 0.005;
  const headingAt = (s: number): number => amp * Math.sin((2 * Math.PI * s) / total);
  let x = 0, z = 0, s = 0;
  for (let i = 0; i < TILE_COUNT; i++) {
    const target = i * SPACING;
    while (s < target - 1e-9) {
      const step = Math.min(ds, target - s);
      const h = headingAt(s + step / 2);
      x += Math.cos(h) * step;
      z += Math.sin(h) * step;
      s += step;
    }
    poses.push({ x, z, heading: headingAt(s) });
  }
}

// ---------- table ----------
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const p of poses) {
  minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
  minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
}
const rampTip = new Vector3(-1.2, 0, 0); // where the ramp's top surface meets the table
const rampDir = new Vector3(Math.cos(RAMP_ANGLE), -Math.sin(RAMP_ANGLE), 0); // downhill
const rampUp = new Vector3(Math.sin(RAMP_ANGLE), Math.cos(RAMP_ANGLE), 0);
minX = Math.min(minX, rampTip.x - Math.cos(RAMP_ANGLE) * RAMP_LEN);
const margin = 1.2;
const tableX0 = minX - margin, tableX1 = maxX + margin;
const tableZ0 = minZ - margin - 0.4, tableZ1 = maxZ + margin + 0.4;
const tableCx = (tableX0 + tableX1) / 2, tableCz = (tableZ0 + tableZ1) / 2;
const tableW = tableX1 - tableX0, tableD = tableZ1 - tableZ0;
const TABLE_T = 0.6;

const tableMat = new MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.85, metalness: 0.0 });
const tableShape = { kind: 'box', hx: tableW / 2, hy: TABLE_T / 2, hz: tableD / 2 } as const;
world.add(new Body(tableShape, 0, new Vector3(tableCx, -TABLE_T / 2, tableCz), new Quaternion()));
const tableMesh = new Mesh(new BoxGeometry(tableW, TABLE_T, tableD), tableMat);
tableMesh.position.set(tableCx, -TABLE_T / 2, tableCz);
tableMesh.receiveShadow = true;
tableMesh.castShadow = true;
scene.add(tableMesh);

// ---------- ramp ----------
const rampQ = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -RAMP_ANGLE);
const rampCenter = rampTip.clone()
  .addScaledVector(rampDir, -RAMP_LEN / 2)
  .addScaledVector(rampUp, -RAMP_THICK / 2);
world.add(new Body(
  { kind: 'box', hx: RAMP_LEN / 2, hy: RAMP_THICK / 2, hz: RAMP_WIDTH / 2 },
  0, rampCenter, rampQ,
));
const rampMat = new MeshStandardMaterial({ color: 0x4a7fb5, roughness: 0.6, metalness: 0.1 });
const rampMesh = new Mesh(new BoxGeometry(RAMP_LEN, RAMP_THICK, RAMP_WIDTH), rampMat);
rampMesh.position.copy(rampCenter);
rampMesh.quaternion.copy(rampQ);
rampMesh.castShadow = true;
rampMesh.receiveShadow = true;
scene.add(rampMesh);

// ---------- tiles ----------
interface Visual { body: Body; mesh: Mesh }
const tileGeo = new BoxGeometry(TILE_W, TILE_H, TILE_D);
const tiles: Visual[] = [];
for (let i = 0; i < TILE_COUNT; i++) {
  const p = poses[i];
  const q = new Quaternion().setFromAxisAngle(Y, -p.heading);
  const body = new Body(
    { kind: 'box', hx: TILE_W / 2, hy: TILE_H / 2, hz: TILE_D / 2 },
    0.5,
    new Vector3(p.x, TILE_H / 2, p.z),
    q,
    0.02,
    0.02,
  );
  body.sleeping = true;
  world.add(body);
  const mat = new MeshStandardMaterial({
    color: new Color().setHSL(0.02 + (i / TILE_COUNT) * 0.1, 0.1, 0.92 - 0.1 * (i % 2)),
    roughness: 0.35,
    metalness: 0.05,
  });
  const mesh = new Mesh(tileGeo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  tiles.push({ body, mesh });
}

// ---------- ball ----------
const ballStart = rampTip.clone()
  .addScaledVector(rampDir, -1.45)
  .addScaledVector(rampUp, BALL_R);
const ballBody = new Body({ kind: 'sphere', r: BALL_R }, 1.5, ballStart, new Quaternion(), 0.3, 0.6);
ballBody.held = true;
world.add(ballBody);
const ballMesh = new Mesh(
  new SphereGeometry(BALL_R, 32, 20),
  new MeshStandardMaterial({ color: 0xc23b3b, roughness: 0.3, metalness: 0.6 }),
);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);

// ---------- lights ----------
scene.add(new AmbientLight(0xffffff, 0.25));
scene.add(new HemisphereLight(0xcfe0ff, 0x4a3a2a, 0.5));
const key = new DirectionalLight(0xfff2e0, 2.6);
key.position.set(tableCx - 4, 13, tableCz + 7);
key.target.position.set(tableCx, 0, tableCz);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
const half = Math.hypot(tableW, tableD) / 2 + 1;
key.shadow.camera.left = -half;
key.shadow.camera.right = half;
key.shadow.camera.top = half;
key.shadow.camera.bottom = -half;
key.shadow.camera.near = 1;
key.shadow.camera.far = 40;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
scene.add(key);
scene.add(key.target);

// ---------- camera ----------
const camera = new PerspectiveCamera(35, 640 / 360, 0.1, 100);
{
  const pts: Vector3[] = [];
  for (const p of poses) {
    pts.push(new Vector3(p.x, 0, p.z), new Vector3(p.x, TILE_H, p.z));
  }
  const hiEnd = rampTip.clone().addScaledVector(rampDir, -RAMP_LEN);
  pts.push(hiEnd, hiEnd.clone().add(new Vector3(0, BALL_R * 2, 0)));
  const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const p of pts) {
    bb.x0 = Math.min(bb.x0, p.x); bb.x1 = Math.max(bb.x1, p.x);
    bb.z0 = Math.min(bb.z0, p.z); bb.z1 = Math.max(bb.z1, p.z);
  }
  const target = new Vector3((bb.x0 + bb.x1) / 2, 0.2, (bb.z0 + bb.z1) / 2);
  const elev = (58 * Math.PI) / 180;
  const dir = new Vector3(0, Math.sin(elev), Math.cos(elev));
  const tmp = new Vector3();
  let dist = 4;
  for (; dist < 80; dist += 0.25) {
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    let ok = true;
    for (const p of pts) {
      tmp.copy(p).project(camera);
      if (Math.abs(tmp.x) > 0.9 || Math.abs(tmp.y) > 0.88) { ok = false; break; }
    }
    if (ok) break;
  }
}

// ---------- UI ----------
function makeButton(label: string, left: number): HTMLButtonElement {
  const b = document.createElement('button');
  b.id = `btn-${label.toLowerCase()}`;
  b.textContent = label;
  b.type = 'button';
  b.style.cssText =
    `position:absolute;top:8px;left:${left}px;z-index:10;padding:6px 14px;` +
    'font:600 14px system-ui,sans-serif;color:#fff;background:#2f6fdb;border:1px solid #9bbcf5;' +
    'border-radius:6px;cursor:pointer;';
  document.body.appendChild(b);
  return b;
}
document.body.style.position = 'relative';
const releaseBtn = makeButton('Release', 8);
const resetBtn = makeButton('Reset', 94);
const hud = document.createElement('div');
hud.style.cssText =
  'position:absolute;top:12px;left:490px;z-index:10;' +
  'font:600 13px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none;';
document.body.appendChild(hud);

// ---------- state ----------
let released = false;
let settled = false;
let stepsSinceRelease = 0;
let acc = 0;
let snapshot: Readonly<TaskState> = Object.freeze({
  phase: 'ready' as const,
  total: TILE_COUNT,
  toppled: 0,
  ballReleased: false,
});
Object.defineProperty(window, '__TASK_STATE__', {
  get: () => snapshot,
  set: () => { /* read-only */ },
  configurable: false,
  enumerable: true,
});

releaseBtn.addEventListener('click', () => {
  if (released) return;
  released = true;
  settled = false;
  stepsSinceRelease = 0;
  ballBody.held = false;
  ballBody.wake();
});

resetBtn.addEventListener('click', () => {
  for (const b of world.bodies) {
    if (b.isStatic) continue;
    b.reset();
    b.sleeping = false;
  }
  for (const t of tiles) t.body.sleeping = true;
  ballBody.held = true;
  released = false;
  settled = false;
  stepsSinceRelease = 0;
  acc = 0;
});

function countToppled(): number {
  let n = 0;
  for (const t of tiles) {
    const q = t.body.q;
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    if (upY < 0.5) n++; // more than 60 degrees from vertical
  }
  return n;
}

function allAtRest(): boolean {
  for (const b of world.bodies) {
    if (b.isStatic) continue;
    if (!b.sleeping && !b.frozen) return false;
  }
  return true;
}

function syncMeshes(): void {
  for (const t of tiles) {
    t.mesh.position.copy(t.body.pos);
    t.mesh.quaternion.copy(t.body.q);
  }
  ballMesh.position.copy(ballBody.pos);
  ballMesh.quaternion.copy(ballBody.q);
}

let last = performance.now();
let first = true;
const MAX_STEPS_PER_FRAME = 30;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const elapsed = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (released && !settled) {
    acc += elapsed;
    let n = 0;
    while (acc >= DT && n < MAX_STEPS_PER_FRAME) {
      world.step(DT);
      acc -= DT;
      n++;
      stepsSinceRelease++;
      if (stepsSinceRelease > 240 * 3 && (allAtRest() || stepsSinceRelease > 240 * 40)) {
        settled = true;
        break;
      }
    }
    if (n === MAX_STEPS_PER_FRAME) acc = 0;
  }

  syncMeshes();
  const toppled = countToppled();
  snapshot = Object.freeze({
    phase: !released ? ('ready' as const) : settled ? ('settled' as const) : ('running' as const),
    total: TILE_COUNT,
    toppled,
    ballReleased: released,
  });
  hud.textContent = `Toppled ${toppled} / ${TILE_COUNT}`;

  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
}
requestAnimationFrame(frame);
