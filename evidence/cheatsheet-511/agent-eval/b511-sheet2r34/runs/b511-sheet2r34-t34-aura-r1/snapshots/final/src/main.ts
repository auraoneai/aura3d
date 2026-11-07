import {
  camera,
  createAuraApp,
  environments,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const LAUNCH_DELAY = 1.5; // seconds after load
const RELAUNCH_DELAY = 0.4; // seconds after a Space reset
const STEP = 1 / 60;

const BALL_START: [number, number, number] = [0, 1.3, 8];
const BALL_VELOCITY: [number, number, number] = [0, 2.2, -22];
const BALL_RADIUS = 0.5;

const ROW_COLORS = ["#e4572e", "#f3a712", "#a8c686", "#29a0b1", "#9a5fb4"];

function buildScene() {
  let s = scene({ background: "#9ec3e6" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(
      lights.directional({
        name: "sun",
        position: [6, 12, 9],
        target: [0, 0, 2],
        intensity: 3,
        shadow: { mapSize: 2048, fit: { center: [0, 0, 2], extent: 14, depth: 40 } }
      })
    )
    .add(
      primitives
        .box({
          name: "floor",
          size: [40, 0.4, 40],
          material: material.pbr({ color: "#6f7d6a", roughness: 0.95 }),
          castShadow: false,
          receiveShadow: true
        })
        .position(0, -0.2, 0)
        .runtime({ id: "floor" })
        .physics({ type: "static", shape: "box", halfExtents: [20, 0.2, 20], friction: 0.8 })
    );

  // Pyramid: 5, 4, 3, 2, 1 boxes. Tiny gaps avoid initial interpenetration jitter.
  for (let row = 0; row < 5; row += 1) {
    const count = 5 - row;
    for (let i = 0; i < count; i += 1) {
      const id = `box-${row}-${i}`;
      const x = (i - (count - 1) / 2) * 1.03;
      const y = 0.5 + row * 1.01 + 0.005;
      s = s.add(
        primitives
          .box({
            name: id,
            size: 1,
            material: material.pbr({ color: ROW_COLORS[row]!, roughness: 0.55 }),
            castShadow: true,
            receiveShadow: true
          })
          .position(x, y, 0)
          .runtime({ id, mutable: true })
          .physics({
            type: "dynamic",
            shape: "box",
            halfExtents: [0.5, 0.5, 0.5],
            mass: 1,
            friction: 0.6,
            restitution: 0.1
          })
      );
    }
  }

  s = s.add(
    primitives
      .sphere({
        name: "ball",
        size: BALL_RADIUS * 2,
        material: material.pbr({ color: "#2b2f3a", roughness: 0.3, metalness: 0.4 }),
        castShadow: true,
        receiveShadow: true
      })
      .position(...BALL_START)
      .runtime({ id: "ball", mutable: true })
      .physics({
        type: "dynamic",
        shape: "sphere",
        radius: BALL_RADIUS,
        mass: 6,
        friction: 0.4,
        restitution: 0.2
      })
  );

  return s.camera(camera.perspective({ position: [10, 5.5, 11], target: [0, 1.2, 3], fov: 45 }));
}

const app = createAuraApp("#app", {
  scene: buildScene(),
  resize: false,
  physics: { bindNodes: true, gravity: [0, -9.81, 0] }
});

let clock = 0;
let launchAt = LAUNCH_DELAY;
let launched = false;
let accumulator = 0;

function resetShot(): void {
  app.setScene(buildScene());
  clock = 0;
  launchAt = RELAUNCH_DELAY;
  launched = false;
  accumulator = 0;
}

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  clock += dt;

  const ball = app.physics.bodies.get("ball");
  if (ball) {
    if (!launched) {
      if (clock >= launchAt) {
        launched = true;
        ball.teleport(BALL_START);
        ball.setVelocity(BALL_VELOCITY);
      } else {
        // Hold the ball at its tee until launch.
        ball.teleport(BALL_START);
      }
    }
  }

  accumulator += dt;
  let steps = 0;
  while (accumulator >= STEP && steps < 4) {
    app.physics.step(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 4) accumulator = 0;
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) resetShot();
  }
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  });
});
