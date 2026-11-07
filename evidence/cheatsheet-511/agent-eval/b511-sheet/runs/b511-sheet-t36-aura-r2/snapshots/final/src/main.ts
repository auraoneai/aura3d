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
const WALK_SPEED = 1.4; // metres per second along the circle
const RUN_SPEED = 3.6;
const SPEED_BLEND = 3; // 1/s, how fast ground speed follows the active clip
const CROSSFADE = 0.4;

const app = createAuraApp("#app", {
  scene: scene({ background: "#8fa6bd" })
    .add(lights.hemisphere({ skyColor: "#d6e2f2", groundColor: "#5a5648", intensity: 1.0 }))
    .add(lights.directional({ position: [6, 10, 5], target: [0, 0.8, 0], intensity: 2.8, shadow: true }))
    .add(primitives.plane({ name: "ground", size: [40, 1, 40], material: material.pbr({ color: "#6f7a68", roughness: 0.95 }), castShadow: false }))
    .add(
      primitives
        .cylinder({ name: "path-marker", size: [RADIUS * 2 + 1.2, 0.02, RADIUS * 2 + 1.2], material: material.pbr({ color: "#a39a86", roughness: 1 }), castShadow: false })
        .position(0, 0.01, 0)
    )
    .add(
      primitives
        .cylinder({ name: "path-inner", size: [RADIUS * 2 - 1.2, 0.03, RADIUS * 2 - 1.2], material: material.pbr({ color: "#6f7a68", roughness: 0.95 }), castShadow: false })
        .position(0, 0.015, 0)
    )
    .add(assets.node("soldier", { name: "soldier-model", targetHeight: 1.8 }).animate({ clip: "Walk", loop: true }).runtime({ id: "soldier", mutable: true }))
    .camera(camera.perspective({ position: [0, 8.5, 11.5], target: [0, 0.6, 0], fov: 45 }))
});

let angle = 0;
let speed = WALK_SPEED;
let targetSpeed = WALK_SPEED;
let mode: "Walk" | "Run" = "Walk";

function placeSoldier(): void {
  // Travel direction for increasing angle is (-sin a, cos a); the model faces +Z, so yaw = -angle.
  app.nodes
    .require("soldier")
    .setPosition(RADIUS * Math.cos(angle), 0, RADIUS * Math.sin(angle))
    .setRotation(0, -angle, 0);
}

function setMode(next: "Walk" | "Run"): void {
  if (next === mode) return;
  mode = next;
  targetSpeed = next === "Run" ? RUN_SPEED : WALK_SPEED;
  app.nodes.require("soldier").play(next, { loop: true, crossFade: CROSSFADE });
}

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === "r") setMode("Run");
  else if (key === "w") setMode("Walk");
});

let ready = false;
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  speed += (targetSpeed - speed) * Math.min(1, SPEED_BLEND * dt);
  angle = (angle + (speed / RADIUS) * dt) % (Math.PI * 2);
  placeSoldier();
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();
placeSoldier();
