import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

const BOX_W = 0.8;
const BOX_H = 0.5;
const GAP = 0.03;
const ROWS = 5;
const BALL_R = 0.4;
const BALL_START: [number, number, number] = [-7, BALL_R + 0.02, 0];
const LAUNCH_DELAY = 1.5;
const LAUNCH_VELOCITY: [number, number, number] = [19, 1.2, 0];

const PALETTE = ["#e4572e", "#f3a712", "#a8c686", "#29a0b1", "#669bbc"];

interface BoxSpec {
  id: string;
  row: number;
  position: [number, number, number];
}

const boxes: BoxSpec[] = [];
for (let row = 0; row < ROWS; row += 1) {
  const count = ROWS - row;
  for (let i = 0; i < count; i += 1) {
    boxes.push({
      id: `box-${row}-${i}`,
      row,
      position: [(i - (count - 1) / 2) * (BOX_W + GAP), BOX_H / 2 + 0.005 + row * (BOX_H + 0.005), 0]
    });
  }
}

function buildScene() {
  let s = scene()
    .add(looks.preset("outdoor-day", { exposureEv: -0.6 }))
    .add(
      primitives
        .box({ name: "floor", size: [30, 0.4, 20], material: material.pbr({ color: "#8a9078", roughness: 0.9 }) })
        .position(0, -0.2, 0)
        .runtime({ id: "floor" })
        .physics({ type: "static", shape: "box", halfExtents: [15, 0.2, 10], friction: 0.8, restitution: 0.05 })
    );
  for (const b of boxes) {
    s = s.add(
      primitives
        .box({ name: b.id, size: [BOX_W, BOX_H, BOX_W], material: material.pbr({ color: PALETTE[b.row % PALETTE.length]!, roughness: 0.55 }) })
        .position(b.position[0], b.position[1], b.position[2])
        .runtime({ id: b.id, mutable: true })
        .physics({ type: "dynamic", shape: "box", halfExtents: [BOX_W / 2, BOX_H / 2, BOX_W / 2], mass: 1, friction: 0.6, restitution: 0.1 })
    );
  }
  s = s.add(
    primitives
      .sphere({ name: "ball", size: BALL_R * 2, material: material.pbr({ color: "#2b2d33", roughness: 0.25, metalness: 0.6 }) })
      .position(BALL_START[0], BALL_START[1], BALL_START[2])
      .runtime({ id: "ball", mutable: true })
      .physics({ type: "dynamic", shape: "sphere", radius: BALL_R, mass: 12, friction: 0.5, restitution: 0.2 })
  );
  return s.camera(camera.perspective({ position: [-1.5, 4.2, 12.5], target: [-0.5, 1.0, 0], fov: 45 }));
}

const app = createAuraApp("#app", {
  scene: buildScene(),
  physics: { bindNodes: true },
  ...looks.appOptions("outdoor-day")
});

let elapsed = 0;
let launched = false;

function launch(): void {
  const ball = app.physics.bodies.require("ball");
  ball.wake();
  ball.setVelocity(LAUNCH_VELOCITY);
  launched = true;
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) {
      elapsed = 0;
      launched = false;
      // Rebuilding the scene is the only public way to restore body orientations.
      app.setScene(buildScene());
    }
  }
});

app.onFrame((f) => {
  const dt = Math.min(f.dt, 1 / 30);
  elapsed += dt;
  if (!launched && elapsed >= LAUNCH_DELAY) launch();
  app.physics.step(dt);
});

await app.ready();
requestAnimationFrame(() => {
  (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
});
