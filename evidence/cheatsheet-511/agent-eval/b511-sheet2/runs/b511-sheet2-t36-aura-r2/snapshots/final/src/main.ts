import { camera, createAuraApp, defineModelAssets, lights, material, primitives, scene } from "@aura3d/engine";

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
const WALK_SPEED = 1.5; // m/s along the circle
const RUN_SPEED = 4.0;
const FADE = 0.4; // seconds

const app = createAuraApp("#app", {
  scene: scene({ background: "#8fa6bf" })
    .add(lights.hemisphere({ skyColor: "#dbe6f5", groundColor: "#5a5648", intensity: 0.9 }))
    .add(lights.directional({ position: [5, 9, 4], target: [0, 0, 0], intensity: 2.6, shadow: true }))
    .camera(camera.perspective({ position: [0, 8, 10.5], target: [0, 0.6, 0], fov: 42 }))
    .add(
      primitives.plane({
        name: "ground",
        size: [24, 1, 24],
        material: material.pbr({ color: "#7d8a6a", roughness: 0.95 }),
        castShadow: false
      })
    )
    .add(
      assets
        .node("soldier", { name: "soldier-model", targetHeight: 1.8 })
        .position(RADIUS, 0, 0)
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
  app.nodes.require("soldier").play(next, { loop: true, crossFade: FADE });
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "r") setMode("Run");
  else if (key === "w") setMode("Walk");
});

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  // Ease the travel speed toward the target so it follows the crossfade.
  const k = 1 - Math.exp(-dt / (FADE * 0.5));
  speed += (targetSpeed - speed) * k;
  angle += (speed / RADIUS) * dt;

  const x = Math.cos(angle) * RADIUS;
  const z = Math.sin(angle) * RADIUS;
  // Tangent of travel is (-sin, 0, cos); the model faces +Z at yaw 0.
  const yaw = Math.atan2(-Math.sin(angle), Math.cos(angle));
  app.nodes.require("soldier").setPosition(x, 0, z).setRotation(0, yaw, 0);
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
