import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const ROWS = 5;
const BOX = 1;
const STEP = 1 / 120;
const BALL_RADIUS = 0.45;
const BALL_START: [number, number, number] = [0, 1.8, 8];
const BALL_VELOCITY: [number, number, number] = [0, 0.4, -24];
const FIRST_LAUNCH_MS = 1500;
const RELAUNCH_MS = 600;

const ROW_COLORS = ["#d9534f", "#f0a030", "#e8d44d", "#5cb85c", "#4a90d9"];

function buildScene() {
  let s = scene({ background: "#9ec5e8" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.directional({ name: "sun", position: [6, 11, 9], target: [0, 0.5, 1], intensity: 3, shadow: true }))
    .add(lights.directional({ name: "fill", position: [-6, 4, 5], target: [0, 1, 0], intensity: 0.8, color: "#bcd4ff" }))
    .add(
      primitives
        .box({
          name: "floor",
          size: [40, 0.4, 40],
          material: material.pbr({ color: "#8a9a7b", roughness: 0.9 }),
          castShadow: false,
          receiveShadow: true
        })
        .position(0, -0.2, 0)
        .runtime({ id: "floor" })
        .physics({ type: "static", shape: "box", halfExtents: [20, 0.2, 20], friction: 0.8, restitution: 0 })
    );

  for (let row = 0; row < ROWS; row += 1) {
    const count = ROWS - row;
    for (let i = 0; i < count; i += 1) {
      const x = (i - (count - 1) / 2) * BOX;
      const y = BOX / 2 + row * BOX;
      const id = `box-${row}-${i}`;
      s = s.add(
        primitives
          .box({
            name: id,
            size: BOX,
            material: material.pbr({ color: ROW_COLORS[row] ?? "#cccccc", roughness: 0.55 }),
            castShadow: true,
            receiveShadow: true
          })
          .position(x, y, 0)
          .runtime({ id, mutable: true })
          .physics({
            type: "dynamic",
            shape: "box",
            halfExtents: [BOX / 2, BOX / 2, BOX / 2],
            mass: 1,
            friction: 0.7,
            restitution: 0.05
          })
      );
    }
  }

  s = s.add(
    primitives
      .sphere({
        name: "ball",
        size: BALL_RADIUS * 2,
        material: material.pbr({ color: "#2b2f3a", metallic: 0.6, roughness: 0.3 }),
        castShadow: true,
        receiveShadow: true
      })
      .position(...BALL_START)
      .runtime({ id: "ball", mutable: true })
      .physics({ type: "dynamic", shape: "sphere", radius: BALL_RADIUS, mass: 6, friction: 0.4, restitution: 0.2 })
  );

  return s.camera(camera.perspective({ position: [9, 4.5, 12], target: [0, 1.6, 2], fov: 40 }));
}

const app = createAuraApp("#app", {
  scene: buildScene(),
  physics: { bindNodes: true }
});

let launched = false;
let launchAt = Number.POSITIVE_INFINITY;
let accumulator = 0;

function launchBall(): void {
  const ball = app.physics.bodies.require("ball");
  ball.teleport(BALL_START);
  ball.setVelocity(BALL_VELOCITY);
  launched = true;
}

app.onFrame((f) => {
  accumulator += Math.min(f.dt, 0.05);
  let guard = 0;
  while (accumulator >= STEP && guard < 12) {
    if (!launched && app.physics.bodies.has("ball")) {
      // Hold the ball in place until the shot starts so gravity does not drop it.
      app.physics.bodies.require("ball").teleport(BALL_START);
    }
    app.physics.step(STEP);
    accumulator -= STEP;
    guard += 1;
  }
  if (!launched && performance.now() >= launchAt) launchBall();
});

function resetShot(): void {
  launched = false;
  accumulator = 0;
  app.setScene(buildScene());
  launchAt = performance.now() + RELAUNCH_MS;
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (!e.repeat) resetShot();
  }
});

await app.ready();
launchAt = performance.now() + FIRST_LAUNCH_MS;

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
