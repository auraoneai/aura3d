import {
  camera,
  createAuraApp,
  environments,
  lights,
  material,
  preloadPhysics,
  primitives,
  scene
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const ROWS = 5;
const BOX = 1;
const GAP_X = 0.04;
const BALL_RADIUS = 0.5;
const BALL_START: [number, number, number] = [0.15, BALL_RADIUS + 0.01, 11];
const LAUNCH_DELAY_MS = 1500;
const RELAUNCH_DELAY_MS = 400;
const LAUNCH_VELOCITY: [number, number, number] = [0, 3.6, -21];
const STEP = 1 / 60;

const ROW_COLORS = ["#c0553a", "#d9822b", "#e3b341", "#5aa469", "#3f7fbf"];

function buildScene() {
  const s = scene({ background: "#a9c4e0" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.hemisphere({ skyColor: "#dbe8ff", groundColor: "#6b5f52", intensity: 0.8 }))
    .add(
      lights.directional({
        name: "sun",
        position: [8, 14, 9],
        target: [0, 1, 2],
        intensity: 2.6,
        shadow: { mapSize: 2048, filter: "pcf", fit: { center: [0, 1, 2], extent: 16, depth: 40 } }
      })
    )
    .camera(camera.perspective({ position: [9.5, 5.2, 15], target: [0, 1.8, 2.5], fov: 48, near: 0.5, far: 150 }));

  // Floor: static rigid body.
  s.add(
    primitives
      .box({
        name: "floor",
        size: [60, 1, 60],
        position: [0, -0.5, 0],
        material: material.pbr({ color: "#8e9a86", roughness: 0.92 }),
        castShadow: false,
        receiveShadow: true,
        physics: { type: "static", friction: 0.8, restitution: 0 }
      })
  );

  // Pyramid: 5, 4, 3, 2, 1 boxes.
  for (let r = 0; r < ROWS; r++) {
    const count = ROWS - r;
    const pitch = BOX + GAP_X;
    for (let c = 0; c < count; c++) {
      const x = (c - (count - 1) / 2) * pitch;
      const y = BOX / 2 + r * BOX + 0.002 * r;
      const id = `box-${r}-${c}`;
      s.add(
        primitives
          .box({
            name: id,
            size: BOX,
            position: [x, y, 0],
            material: material.pbr({ color: ROW_COLORS[r] ?? "#cccccc", roughness: 0.6 }),
            castShadow: true,
            receiveShadow: true,
            physics: { type: "dynamic", mass: 1, friction: 0.6, restitution: 0.05 }
          })
          .runtime({ id, mutable: true })
      );
    }
  }

  // Ball.
  s.add(
    primitives
      .sphere({
        name: "ball",
        size: BALL_RADIUS * 2,
        position: BALL_START,
        material: material.pbr({ color: "#2b2f38", metallic: 0.6, roughness: 0.3 }),
        castShadow: true,
        receiveShadow: true,
        physics: { type: "dynamic", mass: 30, friction: 0.4, restitution: 0.1 }
      })
      .runtime({ id: "ball", mutable: true })
  );

  return s;
}

async function main(): Promise<void> {
  await preloadPhysics();

  const app = createAuraApp("#app", {
    scene: buildScene(),
    physics: { bindNodes: true, gravity: [0, -9.81, 0] }
  });
  await app.ready();

  let accumulator = 0;
  let launched = false;
  let launchAt = performance.now() + LAUNCH_DELAY_MS;

  const launch = (): void => {
    const ball = app.physics.bodies.require("ball");
    ball.wake();
    ball.setVelocity(LAUNCH_VELOCITY);
    ball.setAngularVelocity([-LAUNCH_VELOCITY[2] / BALL_RADIUS * 0.3, 0, 0]);
    launched = true;
  };

  app.onFrame((frame) => {
    accumulator = Math.min(accumulator + frame.dt, 0.1);
    while (accumulator >= STEP) {
      app.physics.step(STEP);
      accumulator -= STEP;
    }
    if (!launched && performance.now() >= launchAt) launch();
  });

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;
    event.preventDefault();
    if (event.repeat) return;
    app.setScene(buildScene());
    accumulator = 0;
    launched = false;
    launchAt = performance.now() + RELAUNCH_DELAY_MS;
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  });
}

void main();
