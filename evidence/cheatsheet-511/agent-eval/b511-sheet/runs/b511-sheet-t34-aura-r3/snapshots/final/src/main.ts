import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

const LOOK = "outdoor-day";
const ROWS = 5;
const BOX = 1;
const GAP = 0.02;
const PITCH = BOX + GAP;
const BALL_RADIUS = 0.6;
const BALL_START: readonly [number, number, number] = [0, 2, 11];
const BALL_VELOCITY: readonly [number, number, number] = [0, 1.6, -24];
const LAUNCH_DELAY = 1.5;

const COLORS = ["#d9534f", "#f0ad4e", "#e8d44d", "#5cb85c", "#4aa3ff"];

function buildScene() {
  let s = scene()
    .add(looks.preset(LOOK, { exposureEv: -1 }))
    .add(
      primitives
        .box({
          name: "floor",
          size: [40, 0.4, 40],
          material: material.pbr({ color: "#8a9484", roughness: 0.9 })
        })
        .position(0, -0.2, 0)
        .runtime({ id: "floor" })
        .physics({ type: "static", shape: "box", halfExtents: [20, 0.2, 20], friction: 0.8 })
    );

  for (let row = 0; row < ROWS; row += 1) {
    const count = ROWS - row;
    for (let i = 0; i < count; i += 1) {
      const name = `box-${row}-${i}`;
      const x = (i - (count - 1) / 2) * PITCH;
      const y = BOX / 2 + 0.001 + row * (BOX + 0.002);
      s = s.add(
        primitives
          .box({
            name,
            size: BOX,
            material: material.pbr({ color: COLORS[row % COLORS.length]!, roughness: 0.55 })
          })
          .position(x, y, 0)
          .runtime({ id: name, mutable: true })
          .physics({
            type: "dynamic",
            shape: "box",
            halfExtents: [BOX / 2, BOX / 2, BOX / 2],
            mass: 1,
            friction: 0.6,
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
        material: material.pbr({ color: "#2b2f3a", metallic: 0.8, roughness: 0.3 })
      })
      .position(BALL_START[0], BALL_START[1], BALL_START[2])
      .runtime({ id: "ball", mutable: true })
      .physics({ type: "dynamic", shape: "sphere", radius: BALL_RADIUS, mass: 8, friction: 0.4, restitution: 0.2 })
  );

  return s.camera(camera.perspective({ position: [11, 5.5, 11], target: [0, 1.6, 3.5], fov: 50 }));
}

const app = createAuraApp("#app", {
  scene: buildScene(),
  physics: { bindNodes: true },
  ...looks.appOptions(LOOK)
});

let elapsed = 0;
let launched = false;
let ready = false;

function launch(): void {
  const ball = app.physics.bodies.require("ball");
  ball.teleport(BALL_START);
  ball.setVelocity(BALL_VELOCITY);
  launched = true;
}

function reset(): void {
  app.setScene(buildScene());
  elapsed = 0;
  launched = false;
  launch();
}

app.onFrame((f) => {
  if (!ready) return;
  elapsed += f.dt;
  if (!launched && elapsed >= LAUNCH_DELAY) launch();
  app.physics.step(Math.min(f.dt, 1 / 30));
});

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();
  if (e.repeat || !ready) return;
  reset();
});

await app.ready();
ready = true;
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  })
);
