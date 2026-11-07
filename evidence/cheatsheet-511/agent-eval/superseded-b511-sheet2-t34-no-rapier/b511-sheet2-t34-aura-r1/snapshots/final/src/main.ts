import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const ROWS = 5;
const BOX = 1;
const GAP = 0.02;
const BALL_RADIUS = 0.5;
const BALL_START: [number, number, number] = [-11, BALL_RADIUS + 0.01, 0];
const LAUNCH_VELOCITY: [number, number, number] = [22, 3.5, 0];
const LAUNCH_DELAY = 1.5;
const STEP = 1 / 60;

const COLORS = ["#d9534f", "#f0ad4e", "#e8d44d", "#5cb85c", "#3d9bd9"];

function buildScene() {
  let s = scene({ background: "#9ec3e6" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.directional({ position: [-8, 14, 10], target: [-2, 0, 0], intensity: 3, shadow: true }))
    .add(
      primitives
        .box({ name: "floor", size: [60, 0.4, 40], material: material.pbr({ color: "#7d8a6e", roughness: 0.95 }) })
        .position(0, -0.2, 0)
        .runtime({ id: "floor" })
        .physics({ type: "static", shape: "box", halfExtents: [30, 0.2, 20], friction: 0.8, restitution: 0 })
    );

  for (let row = 0; row < ROWS; row += 1) {
    const count = ROWS - row;
    for (let j = 0; j < count; j += 1) {
      const id = `box${row}_${j}`;
      const x = (j - (count - 1) / 2) * (BOX + GAP);
      const y = BOX / 2 + row * (BOX + GAP / 2) + 0.01;
      s = s.add(
        primitives
          .box({ name: id, size: [BOX, BOX, BOX], material: material.pbr({ color: COLORS[row % COLORS.length]!, roughness: 0.6 }) })
          .position(x, y, 0)
          .runtime({ id, mutable: true })
          .physics({ type: "dynamic", shape: "box", halfExtents: [BOX / 2, BOX / 2, BOX / 2], mass: 1, friction: 0.6, restitution: 0.05 })
      );
    }
  }

  s = s.add(
    primitives
      .sphere({ name: "ball", size: BALL_RADIUS * 2, material: material.pbr({ color: "#2b2f3a", metalness: 0.5, roughness: 0.3 }) })
      .position(...BALL_START)
      .runtime({ id: "ball", mutable: true })
      .physics({ type: "dynamic", shape: "sphere", radius: BALL_RADIUS, mass: 12, friction: 0.4, restitution: 0.15 })
  );

  return s.camera(camera.perspective({ position: [-3, 5.5, 16], target: [-3, 1.6, 0], fov: 46 }));
}

async function main() {
  const app = createAuraApp("#app", {
    scene: buildScene(),
    physics: { bindNodes: true }
  });

  let simTime = 0;
  let launchAt = LAUNCH_DELAY;
  let launched = false;
  let accumulator = 0;

  const launch = () => {
    const ball = app.physics.bodies.require("ball");
    ball.teleport(BALL_START);
    ball.setVelocity(LAUNCH_VELOCITY);
    ball.setAngularVelocity([0, 0, -LAUNCH_VELOCITY[0] / BALL_RADIUS]);
    launched = true;
  };

  app.onFrame((f) => {
    const dt = Math.min(f.dt, 0.1);
    simTime += dt;
    if (!launched && simTime >= launchAt) {
      try {
        launch();
      } catch {
        // Scene still mounting after a reset; retry on the next frame.
      }
    }
    accumulator += dt;
    let n = 0;
    while (accumulator >= STEP && n < 6) {
      app.physics.step(STEP);
      accumulator -= STEP;
      n += 1;
    }
    if (n === 6) accumulator = 0;
  });

  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;
    e.preventDefault();
    if (e.repeat) return;
    // Rebuild the scene: this restores every box to its start pose and orientation.
    app.setScene(buildScene());
    accumulator = 0;
    launched = false;
    launchAt = simTime + STEP * 2;
  });

  await app.ready();
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
}

void main();
