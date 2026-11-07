import { camera, createAuraApp, defineModelAssets, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

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

const RADIUS = 4;
const WALK_SPEED = 1.4; // metres per second along the circle
const RUN_SPEED = 3.6;
const CROSSFADE = 0.4;

const app = createAuraApp("#app", {
  scene: scene({ background: "#8fa3b8" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.hemisphere({ skyColor: "#d6e2f2", groundColor: "#4d4a42", intensity: 0.8 }))
    .add(lights.directional({ name: "sun", position: [5, 9, 4], target: [0, 0.8, 0], intensity: 2.6, shadow: true }))
    .add(lights.directional({ name: "fill", position: [-6, 3, -4], target: [0, 0.8, 0], intensity: 0.6, color: "#a9c0ff" }))
    .add(
      primitives.plane({
        name: "ground",
        material: material.pbr({ color: "#6f7a60", roughness: 0.95 }),
        castShadow: false,
        receiveShadow: true
      }).scale([22, 1, 22])
    )
    .add(
      assets
        .node("soldier", { name: "soldier-model", targetHeight: 1.8 })
        .animate({ clip: "Walk", loop: true })
        .runtime({ id: "soldier", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 8.5, 11.5], target: [0, 0.6, 0], fov: 45 }))
});

let angle = 0;
let speed = WALK_SPEED;
let targetSpeed = WALK_SPEED;
let current: "Walk" | "Run" = "Walk";

function setGait(next: "Walk" | "Run"): void {
  if (next === current) return;
  current = next;
  targetSpeed = next === "Run" ? RUN_SPEED : WALK_SPEED;
  app.nodes.require("soldier").play(next, { loop: true, crossFade: CROSSFADE });
}

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === "r") setGait("Run");
  else if (key === "w") setGait("Walk");
});

function place(): void {
  const x = Math.cos(angle) * RADIUS;
  const z = Math.sin(angle) * RADIUS;
  // Counter-clockwise motion seen from above: velocity is (-sin, cos); the model faces +Z at yaw 0.
  const yaw = Math.atan2(-Math.sin(angle), Math.cos(angle));
  const node = app.nodes.require("soldier");
  node.setPosition(x, 0, z);
  node.setRotation(0, yaw, 0);
}

app.onFrame((frame) => {
  const dt = Math.min(frame.dt, 0.1);
  // Ease the travel speed toward the gait speed so it matches the crossfade.
  speed += (targetSpeed - speed) * Math.min(1, dt / (CROSSFADE * 0.6));
  angle += (speed / RADIUS) * dt;
  place();
});

await app.ready();
place();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
