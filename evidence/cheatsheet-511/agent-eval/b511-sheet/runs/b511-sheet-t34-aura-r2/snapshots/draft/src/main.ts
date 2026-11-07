import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const LOOK = "outdoor-day";
const ROWS = 5;
const BALL_START: [number, number, number] = [0.15, 0.5, 9];
const LAUNCH_VELOCITY: [number, number, number] = [0, 4, -22];
const LAUNCH_DELAY = 1.5;
const ROW_COLORS = ["#d9534f", "#f0ad4e", "#e8d44d", "#5cb85c", "#3b9bd9"];

function buildScene() {
  let s = scene().add(looks.preset(LOOK, { exposureEv: -1 }));

  s = s.add(
    primitives
      .box({ name: "floor", size: [40, 0.5, 40], material: material.pbr({ color: "#8a9078", roughness: 0.95 }) })
      .position(0, -0.25, 0)
      .runtime({ id: "floor" })
      .physics({ type: "static", shape: "box", halfExtents: [20, 0.25, 20], friction: 0.8 })
  );

  for (let row = 0; row < ROWS; row += 1) {
    const count = ROWS - row;
    for (let i = 0; i < count; i += 1) {
      const x = (i - (count - 1) / 2) * 1.02;
      const y = 0.5 + row * 1.0 + 0.005;
      const id = `box-${row}-${i}`;
      s = s.add(
        primitives
          .box({
            name: id,
            size: 1,
            material: material.pbr({ color: ROW_COLORS[row % ROW_COLORS.length] ?? "#cccccc", roughness: 0.6 })
          })
          .position(x, y, 0)
          .runtime({ id, mutable: true })
          .physics({ type: "dynamic", shape: "box", halfExtents: [0.5, 0.5, 0.5], mass: 1, friction: 0.6, restitution: 0.05 })
      );
    }
  }

  s = s.add(
    primitives
      .sphere({ name: "ball", size: 1, material: material.pbr({ color: "#2a2d34", metallic: 0.8, roughness: 0.3 }) })
      .position(...BALL_START)
      .runtime({ id: "ball", mutable: true })
      .physics({ type: "dynamic", shape: "sphere", radius: 0.5, mass: 6, friction: 0.4, restitution: 0.2 })
  );

  return s.camera(camera.perspective({ position: [8, 5.5, 14], target: [0, 1.4, 3.5], fov: 45 }));
}

const app = createAuraApp("#app", {
  scene: buildScene(),
  physics: { bindNodes: true },
  ...looks.appOptions(LOOK)
});

let clock = 0;
let launched = false;
let accumulator = 0;
const STEP = 1 / 60;

function launch(): void {
  if (!app.physics.bodies.has("ball")) return;
  app.physics.bodies.require("ball").setVelocity(LAUNCH_VELOCITY);
  launched = true;
}

function resetShot(): void {
  app.setScene(buildScene());
  clock = 0;
  accumulator = 0;
  launched = false;
  launch();
}

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  clock += dt;
  if (!launched && clock >= LAUNCH_DELAY) launch();
  accumulator += dt;
  let steps = 0;
  while (accumulator >= STEP && steps < 5) {
    app.physics.step(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 5) accumulator = 0;
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) resetShot();
  }
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
