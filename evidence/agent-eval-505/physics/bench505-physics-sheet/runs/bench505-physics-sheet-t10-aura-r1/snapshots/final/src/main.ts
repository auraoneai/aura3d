import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

type Phase = "ready" | "running" | "settled";
interface TaskState {
  readonly phase: Phase;
  readonly total: number;
  readonly toppled: number;
  readonly ballReleased: boolean;
}

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    readonly __TASK_STATE__?: TaskState;
  }
}

// ---------- layout ----------
const TILE_COUNT = 30;
const PITCH = 0.5; // centre-to-centre along the path (gap between faces = 0.3)
const TILE_W = 0.2; // thin axis, along the path
const TILE_H = 1.0;
const TILE_D = 0.5; // across the path
const BALL_R = 0.22;
const RAMP_ANGLE = 0.32;
const RAMP_LEN = 2.4;
const RAMP_T = 0.14;
const RAMP_W = 1.0;
const RAMP_LOW_X = -0.95; // x where the ramp surface meets the table (before centring)
const BALL_SLOPE_DIST = 2.0; // distance up the ramp from its low end

// S-shaped path: heading varies as a sine so the line curves left then right.
const headings: number[] = [];
for (let i = 0; i < TILE_COUNT; i += 1) headings.push(1.0 * Math.sin((2 * Math.PI * i) / (TILE_COUNT - 1)));
const rawPoints: Array<[number, number]> = [[0, 0]];
for (let i = 0; i < TILE_COUNT - 1; i += 1) {
  const mid = (headings[i]! + headings[i + 1]!) / 2;
  const [px, pz] = rawPoints[i]!;
  rawPoints.push([px + PITCH * Math.cos(mid), pz + PITCH * Math.sin(mid)]);
}
const rampLeftX = RAMP_LOW_X - Math.cos(RAMP_ANGLE) * RAMP_LEN;
let minX = rampLeftX, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const [x, z] of rawPoints) {
  maxX = Math.max(maxX, x + 0.3);
  minZ = Math.min(minZ, z - 0.3);
  maxZ = Math.max(maxZ, z + 0.3);
  minX = Math.min(minX, x);
}
const OFF_X = -(minX + maxX) / 2;
const OFF_Z = -(minZ + maxZ) / 2;

const tileName = (i: number): string => `tile-${i}`;

function buildScene() {
  let sc = scene({ background: "#161b24" })
    .camera(camera.perspective({ position: [0, 9.2, 7.6], target: [0, 0, 0.1], fov: 45, near: 0.5, far: 80 }))
    .add(environments.neutral({ intensity: 0.45, background: false }))
    .add(lights.hemisphere({ skyColor: "#dbe6f5", groundColor: "#4a3a2a", intensity: 0.7 }))
    .add(lights.directional({
      name: "key",
      position: [5, 11, 6],
      target: [0, 0, 0],
      intensity: 3,
      shadow: { filter: "pcf", softness: 1.6, mapSize: 2048 }
    }));

  // Table
  sc = sc.add(
    primitives.box({
      name: "table",
      size: [20, 0.4, 12],
      material: material.pbr({ color: "#9b6a3c", roughness: 0.65, metallic: 0.02 })
    })
      .position(0, -0.2, 0)
      .physics({ type: "static", shape: "box", halfExtents: [10, 0.2, 6], friction: 0.7, restitution: 0 })
  );

  // Ramp: high end at -x, surface meets the table at RAMP_LOW_X
  const ca = Math.cos(RAMP_ANGLE), sa = Math.sin(RAMP_ANGLE);
  const lowX = RAMP_LOW_X + OFF_X, z0 = OFF_Z;
  const rampCx = lowX - ca * (RAMP_LEN / 2) - sa * (RAMP_T / 2);
  const rampCy = sa * (RAMP_LEN / 2) - ca * (RAMP_T / 2);
  sc = sc.add(
    primitives.box({
      name: "ramp",
      size: [RAMP_LEN, RAMP_T, RAMP_W],
      material: material.pbr({ color: "#566275", roughness: 0.5, metallic: 0.3 })
    })
      .position(rampCx, rampCy, z0)
      .rotate(0, 0, -RAMP_ANGLE)
      .physics({ type: "static", shape: "box", halfExtents: [RAMP_LEN / 2, RAMP_T / 2, RAMP_W / 2], friction: 0.6, restitution: 0 })
  );

  // Ball resting on the ramp
  const ballX = lowX - ca * BALL_SLOPE_DIST + sa * (BALL_R + 0.006);
  const ballY = sa * BALL_SLOPE_DIST + ca * (BALL_R + 0.006);
  sc = sc.add(
    primitives.sphere({
      name: "ball",
      size: BALL_R * 2,
      material: material.pbr({ color: "#d1352b", roughness: 0.25, metallic: 0.85 })
    })
      .position(ballX, ballY, z0)
      .physics({ type: "dynamic", shape: "sphere", radius: BALL_R, mass: 3, friction: 0.5, restitution: 0.05 })
      .runtime({ id: "ball", mutable: true })
  );

  // Dominoes
  for (let i = 0; i < TILE_COUNT; i += 1) {
    const [px, pz] = rawPoints[i]!;
    const hue = Math.round(200 + (i / (TILE_COUNT - 1)) * 150);
    sc = sc.add(
      primitives.box({
        name: tileName(i),
        size: [TILE_W, TILE_H, TILE_D],
        material: material.pbr({ color: `hsl(${hue}, 70%, 82%)`, roughness: 0.3, metallic: 0.05 })
      })
        .position(px + OFF_X, TILE_H / 2 + 0.001, pz + OFF_Z)
        .rotate(0, -headings[i]!, 0)
        .physics({ type: "dynamic", shape: "box", halfExtents: [TILE_W / 2, TILE_H / 2, TILE_D / 2], mass: 0.35, friction: 0.55, restitution: 0 })
        .runtime({ id: tileName(i), mutable: true })
    );
  }
  return sc;
}

// ---------- app ----------
const app = createAuraApp("#app", { scene: buildScene(), physics: { bindNodes: true } });

const STEP = 1 / 120; // fixed physics timestep
const MAX_STEPS_PER_FRAME = 16;
const MAX_SIM_TIME = 60;
const SETTLE_TIME = 0.8;

let released = false;
let settled = false;
let acc = 0;
let simTime = 0;
let stillTime = 0;
let toppled = 0;

function tiltDegrees(id: string): number {
  const r = app.nodes.require(id).rotation;
  const a = r[0], b = r[1], g = r[2];
  // y component of the rotated up vector for rotation order ZYX (Rz * Ry * Rx)
  const upY = Math.sin(a) * Math.sin(b) * Math.sin(g) + Math.cos(a) * Math.cos(g);
  return (Math.acos(Math.max(-1, Math.min(1, upY))) * 180) / Math.PI;
}

function countToppled(): number {
  let n = 0;
  for (let i = 0; i < TILE_COUNT; i += 1) if (tiltDegrees(tileName(i)) > 60) n += 1;
  return n;
}

function allStill(): boolean {
  const names = ["ball"];
  for (let i = 0; i < TILE_COUNT; i += 1) names.push(tileName(i));
  for (const name of names) {
    const body = app.physics.bodies.require(name);
    if (body.sleeping()) continue;
    const v = body.velocity(), w = body.angularVelocity();
    if (Math.hypot(v[0], v[1], v[2]) > 0.03 || Math.hypot(w[0], w[1], w[2]) > 0.1) return false;
  }
  return true;
}

let state: TaskState = Object.freeze({ phase: "ready" as Phase, total: TILE_COUNT, toppled: 0, ballReleased: false });
Object.defineProperty(window, "__TASK_STATE__", { get: () => state, enumerable: true, configurable: false });

// ---------- UI ----------
const ui = document.createElement("div");
ui.style.cssText = "position:absolute;left:8px;top:8px;z-index:10;display:flex;gap:8px;align-items:center;";
const btnStyle = "font:600 13px system-ui,sans-serif;padding:6px 14px;border:1px solid #fff6;border-radius:6px;background:#1f2a3acc;color:#fff;cursor:pointer;";
const releaseBtn = document.createElement("button");
releaseBtn.id = "release";
releaseBtn.type = "button";
releaseBtn.textContent = "Release";
releaseBtn.style.cssText = btnStyle;
const resetBtn = document.createElement("button");
resetBtn.id = "reset";
resetBtn.type = "button";
resetBtn.textContent = "Reset";
resetBtn.style.cssText = btnStyle;
const status = document.createElement("span");
status.style.cssText = "font:12px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000;";
ui.append(releaseBtn, resetBtn, status);
document.body.appendChild(ui);

function publish(): void {
  const phase: Phase = !released ? "ready" : settled ? "settled" : "running";
  state = Object.freeze({ phase, total: TILE_COUNT, toppled, ballReleased: released });
  releaseBtn.disabled = released;
  releaseBtn.style.opacity = released ? "0.5" : "1";
  status.textContent = `${phase} · toppled ${toppled}/${TILE_COUNT}`;
}

releaseBtn.addEventListener("click", () => {
  if (released) return;
  released = true;
  acc = 0;
  const ball = app.physics.bodies.require("ball");
  ball.applyImpulse([3 * 0.3 * Math.cos(RAMP_ANGLE), -3 * 0.3 * Math.sin(RAMP_ANGLE), 0]);
  publish();
});

resetBtn.addEventListener("click", () => {
  app.setScene(buildScene());
  released = false;
  settled = false;
  acc = 0;
  simTime = 0;
  stillTime = 0;
  toppled = 0;
  publish();
});

app.onFrame((f) => {
  if (released && !settled) {
    acc += Math.min(f.dt, 0.1);
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS_PER_FRAME) {
      app.physics.step(STEP);
      acc -= STEP;
      simTime += STEP;
      n += 1;
    }
    if (acc > STEP) acc = 0; // drop backlog instead of spiralling
    if (n > 0) {
      if (allStill()) stillTime += n * STEP;
      else stillTime = 0;
    }
  }
  toppled = countToppled();
  if (released && !settled && ((simTime > 1 && stillTime >= SETTLE_TIME) || simTime >= MAX_SIM_TIME)) settled = true;
  publish();
});

await app.ready();
publish();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
