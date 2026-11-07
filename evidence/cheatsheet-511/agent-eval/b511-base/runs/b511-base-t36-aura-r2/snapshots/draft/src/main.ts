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
  scene: scene({ background: "#8fa7bf" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.hemisphere({ skyColor: "#d6e2f2", groundColor: "#4d5240", intensity: 0.8 }))
    .add(lights.directional({ name: "key", position: [5, 9, 4], target: [0, 0.8, 0], intensity: 2.8, shadow: true }))
    .add(lights.directional({ name: "fill", position: [-6, 3, -4], target: [0, 0.8, 0], intensity: 0.8, color: "#a9c0ff" }))
    .camera(camera.perspective({ position: [0, 8.5, 9.5], target: [0, 0.6, 0], fov: 48 }))
    .add(
      primitives
        .plane({ name: "ground", material: material.pbr({ color: "#6f8059", roughness: 0.95 }), castShadow: false, receiveShadow: true })
        .scale([22, 1, 22])
    )
    .add(
      primitives.torus({
        name: "track",
        size: [RADIUS * 2, RADIUS * 2, 0.06],
        rotation: [Math.PI / 2, 0, 0],
        position: [0, 0.01, 0],
        material: material.pbr({ color: "#b9a77f", roughness: 1 }),
        castShadow: false
      })
    )
    .add(
      assets
        .node("soldier", { name: "soldier-model", targetHeight: 1.8 })
        .animate({ clip: "Walk", loop: true })
        .runtime({ id: "soldier", mutable: true })
    )
});

let angle = 0; // position on the circle, radians
let speed = WALK_SPEED; // current linear speed, eased toward the target
let targetSpeed = WALK_SPEED;
let clip: "Walk" | "Run" = "Walk";

function setGait(next: "Walk" | "Run"): void {
  if (next === clip) return;
  clip = next;
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
  const x = Math.sin(angle) * RADIUS;
  const z = Math.cos(angle) * RADIUS;
  // Tangent of increasing angle is (cos a, 0, -sin a); the model faces +Z at yaw 0.
  const yaw = Math.atan2(Math.cos(angle), -Math.sin(angle));
  app.nodes.require("soldier").setPosition(x, 0, z).setRotation(0, yaw, 0);
}

let first = true;
app.onFrame((frame) => {
  const dt = Math.min(frame.dt, 0.1);
  speed += (targetSpeed - speed) * Math.min(1, dt / CROSSFADE * 2);
  angle = (angle + (speed / RADIUS) * dt) % (Math.PI * 2);
  place();
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});

place();
await app.ready();
