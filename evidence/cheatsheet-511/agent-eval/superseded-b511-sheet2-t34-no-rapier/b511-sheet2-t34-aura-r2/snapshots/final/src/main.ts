import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";

const LOOK = "outdoor-day";
const BOX = 0.8;
const GAP = 0.03;
const STEP = BOX + GAP;
const ROWS = 5;
const BALL_RADIUS = 0.5;
const BALL_START: [number, number, number] = [0, BALL_RADIUS + 0.02, 9];
const BALL_VELOCITY: [number, number, number] = [0, 2.5, -21];
const LAUNCH_DELAY = 1.5;
const COLORS = ["#d9534f", "#f0ad4e", "#e8d44d", "#5cb85c", "#3b8fd9"];

function buildScene() {
  let s = scene()
    .add(looks.preset(LOOK, { exposureEv: -0.8 }))
    .add(
      primitives
        .box({
          name: "floor",
          size: [40, 0.4, 40],
          material: material.pbr({ color: "#8a9179", roughness: 0.9 }),
          castShadow: false,
          receiveShadow: true
        })
        .position(0, -0.2, 0)
        .runtime({ id: "floor" })
        .physics({ type: "static", shape: "box", halfExtents: [20, 0.2, 20], friction: 0.8, restitution: 0.1 })
    );

  for (let row = 0; row < ROWS; row += 1) {
    const count = ROWS - row;
    for (let i = 0; i < count; i += 1) {
      const id = `box-${row}-${i}`;
      const x = (i - (count - 1) / 2) * STEP;
      const y = BOX / 2 + 0.01 + row * (BOX + 0.005);
      s = s.add(
        primitives
          .box({
            name: id,
            size: BOX,
            material: material.pbr({ color: COLORS[row % COLORS.length]!, roughness: 0.55 }),
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
      .position(BALL_START[0], BALL_START[1], BALL_START[2])
      .runtime({ id: "ball", mutable: true })
      .physics({ type: "dynamic", shape: "sphere", radius: BALL_RADIUS, mass: 12, friction: 0.4, restitution: 0.2 })
  );

  return s.camera(camera.perspective({ position: [10, 4.6, 6.5], target: [0, 1.1, 3.2], fov: 46 }));
}

const canvas = document.getElementById("app") as HTMLCanvasElement;

const app = createAuraApp(canvas, {
  scene: buildScene(),
  physics: { bindNodes: true },
  ...looks.appOptions(LOOK)
});

let elapsed = 0;
let launched = false;

app.onFrame((f) => {
  const dt = Math.min(f.dt, 1 / 30);
  elapsed += dt;
  if (!launched && elapsed >= LAUNCH_DELAY) {
    launched = true;
    app.physics.bodies.require("ball").setVelocity(BALL_VELOCITY);
  }
  app.physics.step(dt);
});

function resetShot(): void {
  // Remounting the scene recreates every declared body at its starting pose.
  app.setScene(buildScene());
  elapsed = 0;
  launched = false;
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) resetShot();
  }
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  });
});
