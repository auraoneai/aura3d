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
const WALK_SPEED = 1.4; // metres per second
const RUN_SPEED = 3.6;
const FADE = 0.4; // seconds, clip crossfade and speed blend

const app = createAuraApp("#app", {
  scene: scene({ background: "#9fb4c8" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.hemisphere({ skyColor: "#dbe6f5", groundColor: "#5a5648", intensity: 0.6 }))
    .add(lights.directional({ position: [6, 10, 5], target: [0, 0, 0], intensity: 3, shadow: true }))
    .add(
      primitives.plane({
        name: "ground",
        size: [30, 1, 30],
        material: material.pbr({ color: "#6f7d5a", roughness: 0.95 }),
        castShadow: false
      })
    )
    .add(
      primitives.torus({
        name: "path-ring",
        size: [RADIUS * 2, RADIUS * 2, RADIUS * 2],
        material: material.pbr({ color: "#b9a98a", roughness: 1 }),
        castShadow: false
      })
        .position(0, 0, 0)
        .scale([1, 0.004, 1])
    )
    .add(
      assets
        .node("soldier", { name: "soldier-model", targetHeight: 1.8 })
        .animate({ clip: "Walk", loop: true })
        .position(0, 0, RADIUS)
        .runtime({ id: "soldier", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 8.5, 10.5], target: [0, 0.6, 0], fov: 50 }))
});

let mode: "Walk" | "Run" = "Walk";
let speed = WALK_SPEED;
let theta = 0;
let ready = false;

function setMode(next: "Walk" | "Run"): void {
  if (next === mode) return;
  mode = next;
  app.nodes.require("soldier").play(next, { loop: true, crossFade: FADE });
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "r") setMode("Run");
  else if (key === "w") setMode("Walk");
});

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  const target = mode === "Run" ? RUN_SPEED : WALK_SPEED;
  const k = 1 - Math.exp(-dt / (FADE * 0.5));
  speed += (target - speed) * k;
  theta += (speed / RADIUS) * dt;

  // Position on the circle; velocity is d/dtheta = (cos, 0, -sin). Model forward is +Z.
  const x = RADIUS * Math.sin(theta);
  const z = RADIUS * Math.cos(theta);
  const yaw = theta + Math.PI / 2;
  app.nodes.require("soldier").setPosition(x, 0, z).setRotation(0, yaw, 0);

  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();
