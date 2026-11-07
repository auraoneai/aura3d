import {
  camera,
  createAuraApp,
  defineModelAssets,
  environments,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

const RADIUS = 4;
const WALK_SPEED = 1.4; // metres per second along the circle
const RUN_SPEED = 3.6;

const assets = defineModelAssets(
  {
    soldier: {
      url: "/assets/soldier.glb",
      sha256: "dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b",
      animations: ["Idle", "Run", "TPose", "Walk"],
      license: "fixture"
    }
  },
  { queryParam: null }
);

const app = createAuraApp("#app", {
  scene: scene({ background: "#2a2e36" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(lights.hemisphere({ skyColor: "#cfd8ea", groundColor: "#4a4640", intensity: 0.8 }))
    .add(lights.directional({ position: [5, 10, 6], target: [0, 0, 0], intensity: 2.6, shadow: true }))
    .camera(camera.perspective({ position: [0, 8.5, 10.5], target: [0, 0.6, 0], fov: 45 }))
    .add(
      primitives.plane({
        name: "ground",
        size: [16, 1, 16],
        material: material.pbr({ color: "#7b7f86", roughness: 0.9 })
      })
    )
    .add(
      assets
        .node("soldier", { name: "soldier-model", targetHeight: 1.8 })
        .animate({ clip: "Walk", loop: true })
        .runtime({ id: "soldier", mutable: true })
    )
});

let angle = 0;
let speed = WALK_SPEED;
let targetSpeed = WALK_SPEED;
let mode: "Walk" | "Run" = "Walk";

function setMode(next: "Walk" | "Run"): void {
  if (next === mode) return;
  mode = next;
  targetSpeed = next === "Run" ? RUN_SPEED : WALK_SPEED;
  app.nodes.require("soldier").play?.(next, { loop: true, crossFade: 0.4 });
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "r") setMode("Run");
  else if (key === "w") setMode("Walk");
});

function place(): void {
  const x = Math.cos(angle) * RADIUS;
  const z = Math.sin(angle) * RADIUS;
  // Travel direction for increasing angle is (-sin, cos); the model faces +Z, so yaw = -angle.
  app.nodes.require("soldier").setPosition(x, 0, z).setRotation(0, -angle, 0);
}

place();

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  // Ease the ground speed toward the target so it follows the animation crossfade.
  speed += (targetSpeed - speed) * Math.min(1, dt * 4);
  angle += (speed / RADIUS) * dt;
  place();
});

await app.ready();
requestAnimationFrame(() => {
  (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
});
