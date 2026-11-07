import {
  camera,
  createAuraApp,
  environments,
  lights,
  material,
  primitives,
  scene,
  type AuraSceneBuilder
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const BOX = 0.8; // cube edge length
const GAP_X = 0.03; // tiny horizontal gap so the stack starts without interpenetration
const ROWS = 5;
const BALL_RADIUS = 0.45;
const BALL_START: [number, number, number] = [0.25, BALL_RADIUS + 0.01, 9];
const LAUNCH_VELOCITY: [number, number, number] = [-0.08, 3.4, -25];
const FIRST_LAUNCH_DELAY = 1.5; // seconds after load
const RELAUNCH_DELAY = 0.35; // seconds after a Space reset
const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 8;

const ROW_COLORS = ["#d9534f", "#e8833a", "#f0b429", "#5cb85c", "#3d8bd9"];

function buildScene(): AuraSceneBuilder {
  const s = scene({ background: "#a9c4dc" })
    .add(environments.neutral({ intensity: 0.75, background: false }))
    .add(lights.hemisphere({ skyColor: "#dbe8f5", groundColor: "#6b6a64", intensity: 0.6 }))
    .add(
      lights.directional({
        name: "key",
        position: [7, 11, 8],
        target: [0, 1, 1],
        intensity: 3.2,
        color: "#fff1dc",
        shadow: { mapSize: 2048, filter: "pcf", fit: { center: [0, 1, 1], extent: 16, depth: 40 } }
      })
    )
    .add(lights.directional({ name: "fill", position: [-8, 4, 6], target: [0, 1, 0], intensity: 0.9, color: "#a9c4ff" }))
    .add(
      primitives
        .box({
          name: "floor",
          size: [60, 1, 60],
          position: [0, -0.5, 0],
          material: material.pbr({ color: "#7d8a78", roughness: 0.95 }),
          castShadow: false,
          receiveShadow: true,
          physics: { type: "static", friction: 0.8, restitution: 0.05 }
        })
    )
    .camera(camera.perspective({ position: [8.5, 4.6, 11.5], target: [0, 1.5, 1.2], fov: 44 }));

  // Pyramid: 5, 4, 3, 2, 1 boxes.
  for (let row = 0; row < ROWS; row += 1) {
    const count = ROWS - row;
    const pitch = BOX + GAP_X;
    for (let i = 0; i < count; i += 1) {
      const x = (i - (count - 1) / 2) * pitch;
      const y = BOX / 2 + row * (BOX + 0.002);
      const id = `box-${row}-${i}`;
      s.add(
        primitives
          .box({
            name: id,
            size: BOX,
            position: [x, y, 0],
            material: material.pbr({ color: ROW_COLORS[row] ?? "#cccccc", roughness: 0.55, metallic: 0.05 }),
            castShadow: true,
            receiveShadow: true,
            physics: { type: "dynamic", mass: 1, friction: 0.6, restitution: 0.05 }
          })
          .runtime({ id, mutable: true })
      );
    }
  }

  // The wrecking ball.
  s.add(
    primitives
      .sphere({
        name: "ball",
        size: BALL_RADIUS * 2,
        position: BALL_START,
        material: material.pbr({ color: "#2b2f3a", roughness: 0.3, metallic: 0.7 }),
        castShadow: true,
        receiveShadow: true,
        physics: { type: "dynamic", mass: 14, friction: 0.4, restitution: 0.15 }
      })
      .runtime({ id: "ball", mutable: true })
  );

  return s;
}

const app = createAuraApp("#app", {
  scene: buildScene(),
  physics: {
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 8, onSubstepLimit: "clamp" },
    bindNodes: true
  }
});

let accumulator = 0;
let sinceReset = 0;
let launched = false;
let launchDelay = FIRST_LAUNCH_DELAY;

function launch(): void {
  const ball = app.physics.bodies.get("ball");
  if (!ball) return;
  ball.setVelocity(LAUNCH_VELOCITY);
  ball.setAngularVelocity([LAUNCH_VELOCITY[2] / BALL_RADIUS * 0.5, 0, 0]);
  launched = true;
}

function reset(): void {
  app.setScene(buildScene());
  accumulator = 0;
  sinceReset = 0;
  launched = false;
  launchDelay = RELAUNCH_DELAY;
}

app.onFrame((frame) => {
  const dt = Math.min(Math.max(frame.dt, 0), 0.1);
  sinceReset += dt;
  if (!launched && sinceReset >= launchDelay) launch();

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    app.physics.step(FIXED_DT);
    accumulator -= FIXED_DT;
    steps += 1;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (!event.repeat) reset();
  }
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
