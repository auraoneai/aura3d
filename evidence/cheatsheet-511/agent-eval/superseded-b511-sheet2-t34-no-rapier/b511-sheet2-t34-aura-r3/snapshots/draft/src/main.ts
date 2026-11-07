import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const BOX = 0.8;
const GAP = 0.03;
const ROWS = 5;
const BALL_RADIUS = 0.45;
const BALL_START: [number, number, number] = [0, BALL_RADIUS + 0.02, 11];
const BALL_SPEED = 24;
const LAUNCH_DELAY = 1.5;
const STEP = 1 / 60;

const PALETTE = ["#e4572e", "#f3a712", "#a8c686", "#29a0b1", "#669bbc"];

function buildScene() {
  let s = scene({ background: "#9ec3e6" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.directional({ position: [6, 10, 7], target: [0, 1, 2], intensity: 3, shadow: true }))
    .add(
      primitives
        .box({
          name: "floor",
          size: [40, 0.4, 40],
          material: material.pbr({ color: "#7d8a70", roughness: 0.9 }),
          castShadow: false,
          receiveShadow: true
        })
        .position(0, -0.2, 0)
        .runtime({ id: "floor" })
        .physics({ type: "static", shape: "box", halfExtents: [20, 0.2, 20], friction: 0.8, restitution: 0 })
    );

  let n = 0;
  for (let row = 0; row < ROWS; row += 1) {
    const count = ROWS - row;
    const y = BOX / 2 + row * (BOX + 0.005);
    for (let i = 0; i < count; i += 1) {
      const x = (i - (count - 1) / 2) * (BOX + GAP);
      s = s.add(
        primitives
          .box({
            name: `crate${n}`,
            size: BOX,
            material: material.pbr({ color: PALETTE[row % PALETTE.length]!, roughness: 0.6 }),
            castShadow: true,
            receiveShadow: true
          })
          .position(x, y, 0)
          .runtime({ id: `crate${n}`, mutable: true })
          .physics({
            type: "dynamic",
            shape: "box",
            halfExtents: [BOX / 2, BOX / 2, BOX / 2],
            mass: 1,
            friction: 0.6,
            restitution: 0.05
          })
      );
      n += 1;
    }
  }

  s = s.add(
    primitives
      .sphere({
        name: "ball",
        size: BALL_RADIUS * 2,
        material: material.pbr({ color: "#2b2d42", metalness: 0.3, roughness: 0.35 }),
        castShadow: true,
        receiveShadow: true
      })
      .position(...BALL_START)
      .runtime({ id: "ball", mutable: true })
      .physics({ type: "dynamic", shape: "sphere", radius: BALL_RADIUS, mass: 12, friction: 0.4, restitution: 0.2 })
  );

  return s.camera(camera.perspective({ position: [8.5, 4.2, 10], target: [0, 1.3, 3.5], fov: 48 }));
}

const app = createAuraApp("#app", {
  scene: buildScene(),
  physics: { bindNodes: true }
});

let elapsed = 0;
let launched = false;
let acc = 0;

function launch(): void {
  try {
    app.physics.bodies.require("ball").setVelocity([0, 0.4, -BALL_SPEED]);
    launched = true;
  } catch {
    // Body registry not ready yet; retry on the next frame.
  }
}

function reset(): void {
  elapsed = 0;
  acc = 0;
  launched = false;
  app.setScene(buildScene());
}

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  elapsed += dt;
  if (!launched && elapsed >= LAUNCH_DELAY) launch();
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 6) {
    app.physics.step(STEP);
    acc -= STEP;
    steps += 1;
  }
  if (steps === 6) acc = 0;
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) reset();
  }
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
