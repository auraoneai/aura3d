import { camera, createAuraApp, looks, material, physics, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type Vec3 = [number, number, number];

// ---- Layout -------------------------------------------------------------
const ROWS = 5; // 5 + 4 + 3 + 2 + 1 = 15 boxes
const BOX = 1; // box edge length
const GAP = 0.02; // small gap so the stack starts without interpenetration
const BALL_RADIUS = 0.6;
const BALL_START: Vec3 = [0.15, BALL_RADIUS + 0.01, 11];
const LAUNCH_VELOCITY: Vec3 = [-0.1, 4.2, -21];
const LAUNCH_DELAY = 1.5; // seconds after load
const STEP = 1 / 60;
const FLOOR_SIZE = 44;

const ROW_COLORS = ["#d9534f", "#f0a030", "#e8d34a", "#5cb85c", "#4aa3df"];

interface BoxSpec {
  id: string;
  position: Vec3;
  color: string;
}

const boxes: BoxSpec[] = [];
for (let row = 0; row < ROWS; row += 1) {
  const count = ROWS - row;
  for (let i = 0; i < count; i += 1) {
    boxes.push({
      id: `box${boxes.length}`,
      position: [(i - (count - 1) / 2) * (BOX + GAP), BOX / 2 + row * (BOX + GAP) + 0.001, 0],
      color: ROW_COLORS[row] ?? "#cccccc"
    });
  }
}

// ---- Scene --------------------------------------------------------------
let sceneBuilder = scene()
  .add(looks.preset("outdoor-day", { exposureEv: -1 }))
  .add(
    primitives
      .box({
        name: "floor",
        size: [FLOOR_SIZE, 1, FLOOR_SIZE],
        material: material.pbr({ color: "#8a9078", roughness: 0.95 })
      })
      .position(0, -0.5, 0)
  );

for (const b of boxes) {
  sceneBuilder = sceneBuilder.add(
    primitives
      .box({ name: b.id, size: BOX, material: material.pbr({ color: b.color, roughness: 0.55 }) })
      .position(...b.position)
      .runtime({ id: b.id, mutable: true })
  );
}

sceneBuilder = sceneBuilder
  .add(
    primitives
      .sphere({
        name: "ball",
        size: BALL_RADIUS * 2,
        material: material.pbr({ color: "#2b2f3a", metallic: 0.8, roughness: 0.3 })
      })
      .position(...BALL_START)
      .runtime({ id: "ball", mutable: true })
  )
  .camera(camera.perspective({ position: [12, 5.5, 17], target: [0, 1.8, 4], fov: 45 }));

const app = createAuraApp("#app", {
  scene: sceneBuilder,
  ...looks.appOptions("outdoor-day")
});

// ---- Physics (standalone world, reset restores every body exactly) --------
const world = await physics.worldAsync({
  gravity: [0, -9.81, 0],
  fixedDelta: STEP,
  enableSleeping: true,
  continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 16, onSubstepLimit: "clamp" }
});

world.createBody({
  type: "static",
  position: [0, -0.5, 0],
  shape: physics.box(FLOOR_SIZE / 2, 0.5, FLOOR_SIZE / 2),
  friction: 0.8,
  material: { friction: 0.8, restitution: 0 }
});

const boxBodies = boxes.map((b) => ({
  id: b.id,
  body: world.createBody({
    type: "dynamic",
    position: b.position,
    mass: 1,
    shape: physics.box(BOX / 2, BOX / 2, BOX / 2),
    friction: 0.6,
    restitution: 0.05,
    linearDamping: 0.02,
    angularDamping: 0.05,
    material: { friction: 0.6, restitution: 0.05 }
  })
}));

const ballBody = world.createBody({
  type: "dynamic",
  position: BALL_START,
  mass: 12,
  shape: physics.sphere(BALL_RADIUS),
  friction: 0.4,
  restitution: 0.15,
  linearDamping: 0.01,
  angularDamping: 0.1,
  material: { friction: 0.4, restitution: 0.15 }
});

// ---- Scene sync -----------------------------------------------------------
/** Quaternion (x, y, z, w) to Euler angles in the renderer's default ZYX order. */
function quatToEulerZYX(q: readonly number[]): Vec3 {
  const x = q[0] ?? 0, y = q[1] ?? 0, z = q[2] ?? 0, w = q[3] ?? 1;
  const m11 = 1 - 2 * (y * y + z * z);
  const m21 = 2 * (x * y + w * z);
  const m22 = 1 - 2 * (x * x + z * z);
  const m31 = 2 * (x * z - w * y);
  const m32 = 2 * (y * z + w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const m12 = 2 * (x * y - w * z);
  const ey = Math.asin(-Math.min(1, Math.max(-1, m31)));
  if (Math.abs(m31) >= 0.9999999) return [0, ey, Math.atan2(-m12, m22)];
  return [Math.atan2(m32, m33), ey, Math.atan2(m21, m11)];
}

function syncNode(id: string, body: { position: readonly number[]; rotation: readonly number[] }): void {
  const node = app.nodes.require(id);
  const p = body.position;
  node.setPosition(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
  const e = quatToEulerZYX(body.rotation);
  node.setRotation(e[0], e[1], e[2]);
}

function syncAll(): void {
  for (const b of boxBodies) syncNode(b.id, b.body);
  syncNode("ball", ballBody);
}

// ---- Shot control ----------------------------------------------------------
let clock = 0; // seconds since the shot was armed
let launched = false;

function launch(): void {
  ballBody.setVelocity(LAUNCH_VELOCITY);
  ballBody.setAngularVelocity([-LAUNCH_VELOCITY[2] / BALL_RADIUS * 0.15, 0, 0]);
  launched = true;
}

function resetShot(): void {
  world.reset();
  clock = 0;
  launched = false;
  syncAll();
  launch(); // Space relaunches straight away
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.key === " ") {
    event.preventDefault();
    if (!event.repeat) resetShot();
  }
});

// ---- HUD (DOM overlay) -----------------------------------------------------
const hud = document.createElement("div");
hud.textContent = "Space: reset and relaunch";
hud.style.cssText =
  "position:fixed;left:8px;top:8px;padding:2px 8px;background:rgba(0,0,0,.45);border-radius:4px;pointer-events:none;font:12px system-ui,sans-serif;color:#fff";
document.body.appendChild(hud);

// ---- Loop ------------------------------------------------------------------
let last = performance.now();
let accumulator = 0;

app.onFrame(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  accumulator += dt;

  let steps = 0;
  while (accumulator >= STEP && steps < 6) {
    if (!launched && clock >= LAUNCH_DELAY) launch();
    world.step({ dt: STEP });
    clock += STEP;
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 6) accumulator = 0;
  syncAll();
});

await app.ready();
syncAll();
last = performance.now();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
