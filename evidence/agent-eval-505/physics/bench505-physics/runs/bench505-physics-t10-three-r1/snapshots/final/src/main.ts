import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// ---------- constants ----------
const TILE_COUNT = 30;
const TILE_W = 0.2; // thickness along the path
const TILE_H = 1.0;
const TILE_D = 0.5; // width across the path
const TILE_SPACING = 0.55; // center to center along the path
const PATH_TURN_RATE = 0.2; // radians of heading change per unit length
const BALL_R = 0.3;
const RAMP_LEN = 2.4;
const RAMP_THICK = 0.2;
const RAMP_WIDTH = 0.9;
const RAMP_ANGLE = (20 * Math.PI) / 180;
const RAMP_BALL_U = 1.7; // ball start distance along the ramp from its lower end
const RAMP_GAP = 0.85; // distance from ramp lower end to first tile
const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 12;
const TOPPLE_COS = Math.cos((60 * Math.PI) / 180);

// ---------- state exposed to the evaluator ----------
type Phase = 'ready' | 'running' | 'settled';
const internal = { phase: 'ready' as Phase, total: TILE_COUNT, toppled: 0, ballReleased: false };
const publicState = {};
for (const key of Object.keys(internal) as (keyof typeof internal)[]) {
  Object.defineProperty(publicState, key, { get: () => internal[key], enumerable: true });
}
Object.defineProperty(window, '__TASK_STATE__', { value: publicState, writable: false, configurable: false });
declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------- layout (computed once, in plain 2D xz coordinates) ----------
interface TilePose {
  x: number;
  z: number;
  yaw: number;
}

function computeLayout() {
  const raw: TilePose[] = [];
  let x = 0;
  let z = 0;
  let heading = 0;
  for (let i = 0; i < TILE_COUNT; i++) {
    raw.push({ x, z, yaw: heading });
    const mid = heading + (PATH_TURN_RATE * TILE_SPACING) / 2;
    x += Math.cos(mid) * TILE_SPACING;
    z += -Math.sin(mid) * TILE_SPACING;
    heading += PATH_TURN_RATE * TILE_SPACING;
  }
  // Ramp lower end sits RAMP_GAP before the first tile, along its direction.
  const d0x = Math.cos(raw[0].yaw);
  const d0z = -Math.sin(raw[0].yaw);
  const endX = raw[0].x - d0x * RAMP_GAP;
  const endZ = raw[0].z - d0z * RAMP_GAP;
  const rampTopX = endX - d0x * RAMP_LEN * Math.cos(RAMP_ANGLE);
  const rampTopZ = endZ - d0z * RAMP_LEN * Math.cos(RAMP_ANGLE);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const pts: [number, number][] = raw.map((t) => [t.x, t.z]);
  pts.push([rampTopX, rampTopZ]);
  for (const [px, pz] of pts) {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minZ = Math.min(minZ, pz);
    maxZ = Math.max(maxZ, pz);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const tiles = raw.map((t) => ({ x: t.x - cx, z: t.z - cz, yaw: t.yaw }));
  return {
    tiles,
    dir: { x: d0x, z: d0z, yaw: raw[0].yaw },
    rampEnd: { x: endX - cx, z: endZ - cz },
    width: maxX - minX,
    depth: maxZ - minZ,
  };
}
const layout = computeLayout();

// ---------- renderer / scene ----------
const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x1b1f27);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x1b1f27, 30, 70);

const tableW = layout.width + 5;
const tableD = layout.depth + 5;
const TABLE_THICK = 0.5;

// Table (felt-green top slab with a wooden edge look via a second, slightly larger slab below)
const tableMat = new THREE.MeshStandardMaterial({ color: 0x2f6b4f, roughness: 0.95, metalness: 0 });
const table = new THREE.Mesh(new THREE.BoxGeometry(tableW, TABLE_THICK, tableD), tableMat);
table.position.y = -TABLE_THICK / 2;
table.receiveShadow = true;
table.castShadow = true;
scene.add(table);

const frameMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.6, metalness: 0.05 });
const frame = new THREE.Mesh(new THREE.BoxGeometry(tableW + 0.4, 0.3, tableD + 0.4), frameMat);
frame.position.y = -TABLE_THICK - 0.15 + 0.0;
frame.receiveShadow = true;
scene.add(frame);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3;
floor.receiveShadow = true;
scene.add(floor);

// lights
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3328, 0.7));
const key = new THREE.DirectionalLight(0xfff2de, 2.4);
key.position.set(-5, 13, 7);
key.target.position.set(0, 0, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
const shadowExtent = Math.max(tableW, tableD) * 0.75 + 2;
key.shadow.camera.left = -shadowExtent;
key.shadow.camera.right = shadowExtent;
key.shadow.camera.top = shadowExtent;
key.shadow.camera.bottom = -shadowExtent;
key.shadow.camera.near = 1;
key.shadow.camera.far = 40;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 3;
scene.add(key, key.target);

// camera: pick the closest distance at which the whole path (and ramp) is in view
const camera = new THREE.PerspectiveCamera(40, 640 / 360, 0.1, 200);
{
  const target = new THREE.Vector3(0, 0.3, 0.3);
  const elev = (58 * Math.PI) / 180;
  const corners: THREE.Vector3[] = [];
  const hx = layout.width / 2 + 0.9;
  const hz = layout.depth / 2 + 0.9;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const y of [0, 1.3]) corners.push(new THREE.Vector3(sx * hx, y, sz * hz));
    }
  }
  let dist = 8;
  for (; dist < 80; dist += 0.25) {
    camera.position.set(0, target.y + Math.sin(elev) * dist, target.z + Math.cos(elev) * dist);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    let ok = true;
    for (const c of corners) {
      const p = c.clone().project(camera);
      if (Math.abs(p.x) > 0.94 || p.y > 0.92 || p.y < -0.78) {
        ok = false;
        break;
      }
    }
    if (ok) break;
  }
}

// ---------- visual meshes ----------
const tileMeshes: THREE.Mesh[] = [];
const tileGeo = new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D);
for (let i = 0; i < TILE_COUNT; i++) {
  const color = new THREE.Color().setHSL(0.08 + (i / TILE_COUNT) * 0.05, 0.25, 0.86 - (i % 2) * 0.08);
  const m = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.0 }));
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  tileMeshes.push(m);
}
const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 32, 20),
  new THREE.MeshStandardMaterial({ color: 0xb02a2a, roughness: 0.25, metalness: 0.7 }),
);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);

// ramp pose
const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), layout.dir.yaw);
const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -RAMP_ANGLE);
const rampQ = yawQ.clone().multiply(tiltQ);
const rampAlong = -(RAMP_LEN / 2) * Math.cos(RAMP_ANGLE) - (RAMP_THICK / 2) * Math.sin(RAMP_ANGLE);
const rampPos = new THREE.Vector3(
  layout.rampEnd.x + layout.dir.x * rampAlong,
  (RAMP_LEN / 2) * Math.sin(RAMP_ANGLE) - (RAMP_THICK / 2) * Math.cos(RAMP_ANGLE),
  layout.rampEnd.z + layout.dir.z * rampAlong,
);
const rampMesh = new THREE.Mesh(
  new THREE.BoxGeometry(RAMP_LEN, RAMP_THICK, RAMP_WIDTH),
  new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.7 }),
);
rampMesh.position.copy(rampPos);
rampMesh.quaternion.copy(rampQ);
rampMesh.castShadow = true;
rampMesh.receiveShadow = true;
scene.add(rampMesh);

// ball start pose
const ballStart = new THREE.Vector3(
  layout.rampEnd.x + layout.dir.x * (-RAMP_BALL_U * Math.cos(RAMP_ANGLE) + BALL_R * Math.sin(RAMP_ANGLE)),
  RAMP_BALL_U * Math.sin(RAMP_ANGLE) + BALL_R * Math.cos(RAMP_ANGLE) + 0.002,
  layout.rampEnd.z + layout.dir.z * (-RAMP_BALL_U * Math.cos(RAMP_ANGLE) + BALL_R * Math.sin(RAMP_ANGLE)),
);

// ---------- physics ----------
let world: RAPIER.World;
let tileBodies: RAPIER.RigidBody[] = [];
let ballBody: RAPIER.RigidBody;
let stepCount = 0;
let calmSteps = 0;
let releasePending = false;
let acc = 0;

function buildWorld(): void {
  if (world) world.free();
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_DT;
  world.integrationParameters.numSolverIterations = 8;

  // table
  const tb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -TABLE_THICK / 2, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(tableW / 2, TABLE_THICK / 2, tableD / 2).setFriction(0.7).setRestitution(0),
    tb,
  );

  // ramp
  const rb = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(rampPos.x, rampPos.y, rampPos.z)
      .setRotation({ x: rampQ.x, y: rampQ.y, z: rampQ.z, w: rampQ.w }),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(RAMP_LEN / 2, RAMP_THICK / 2, RAMP_WIDTH / 2).setFriction(0.6).setRestitution(0),
    rb,
  );

  // tiles
  tileBodies = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const t of layout.tiles) {
    const q = new THREE.Quaternion().setFromAxisAngle(up, t.yaw);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(t.x, TILE_H / 2 + 0.0005, t.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setCanSleep(true),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(TILE_W / 2, TILE_H / 2, TILE_D / 2)
        .setDensity(1)
        .setFriction(0.5)
        .setRestitution(0),
      body,
    );
    tileBodies.push(body);
  }

  // ball: held fixed on the ramp until released
  ballBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(ballStart.x, ballStart.y, ballStart.z)
      .setLinearDamping(0.05)
      .setAngularDamping(0.4),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_R).setDensity(8).setFriction(0.6).setRestitution(0),
    ballBody,
  );

  stepCount = 0;
  calmSteps = 0;
  releasePending = false;
  acc = 0;
  internal.phase = 'ready';
  internal.ballReleased = false;
  internal.toppled = 0;
}

function physicsStep(): void {
  if (releasePending) {
    releasePending = false;
    ballBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    internal.ballReleased = true;
    internal.phase = 'running';
    stepCount = 0;
    calmSteps = 0;
  }
  world.step();
  if (!internal.ballReleased) return;
  stepCount++;

  let calm = true;
  const check = (b: RAPIER.RigidBody) => {
    const lv = b.linvel();
    const av = b.angvel();
    if (lv.x * lv.x + lv.y * lv.y + lv.z * lv.z > 0.03 * 0.03) calm = false;
    if (av.x * av.x + av.y * av.y + av.z * av.z > 0.1 * 0.1) calm = false;
  };
  for (const b of tileBodies) check(b);
  if (ballBody.translation().y > -1) check(ballBody);
  calmSteps = calm ? calmSteps + 1 : 0;
  if (internal.phase === 'running' && stepCount > 120 && calmSteps >= 90) internal.phase = 'settled';
}

function syncVisuals(): void {
  let toppled = 0;
  for (let i = 0; i < TILE_COUNT; i++) {
    const b = tileBodies[i];
    const p = b.translation();
    const q = b.rotation();
    tileMeshes[i].position.set(p.x, p.y, p.z);
    tileMeshes[i].quaternion.set(q.x, q.y, q.z, q.w);
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    if (upY < TOPPLE_COS) toppled++;
  }
  internal.toppled = toppled;
  const bp = ballBody.translation();
  const bq = ballBody.rotation();
  ballMesh.position.set(bp.x, bp.y, bp.z);
  ballMesh.quaternion.set(bq.x, bq.y, bq.z, bq.w);
}

// ---------- UI ----------
function makeButton(label: string, left: number): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    `position:absolute;left:${left}px;top:318px;width:90px;height:32px;font:600 14px system-ui,sans-serif;` +
    'color:#fff;background:#c0392b;border:2px solid #fff;border-radius:6px;cursor:pointer;z-index:10;';
  document.body.appendChild(b);
  return b;
}
const releaseBtn = makeButton('Release', 10);
const resetBtn = makeButton('Reset', 110);
resetBtn.style.background = '#2c6fb0';

releaseBtn.addEventListener('click', () => {
  if (!internal.ballReleased && !releasePending) releasePending = true;
});
resetBtn.addEventListener('click', () => {
  buildWorld();
  syncVisuals();
});

// ---------- main loop ----------
async function main(): Promise<void> {
  await RAPIER.init();
  buildWorld();
  syncVisuals();

  let last = performance.now();
  let first = true;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt;
    let steps = 0;
    while (acc >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      physicsStep();
      acc -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
    syncVisuals();
    renderer.render(scene, camera);
    if (first) {
      first = false;
      window.__EVAL_READY__ = true;
    }
  };
  requestAnimationFrame(frame);
}

void main();
