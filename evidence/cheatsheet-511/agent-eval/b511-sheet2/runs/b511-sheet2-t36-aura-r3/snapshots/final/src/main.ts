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

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const RADIUS = 4;
const WALK_SPEED = 1.4; // metres per second along the circle
const RUN_SPEED = 3.6;
const SPEED_BLEND = 4; // 1/s, how quickly the ground speed follows the clip change
const MODEL_YAW_OFFSET = 0; // radians; the soldier model faces +Z

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
    .add(lights.hemisphere({ skyColor: "#cfd8ea", groundColor: "#4a4640", intensity: 0.7 }))
    .add(lights.directional({ name: "sun", position: [5, 9, 4], target: [0, 0, 0], intensity: 2.6, shadow: true }))
    .add(
      primitives
        .plane({ name: "ground", size: [30, 1, 30], material: material.pbr({ color: "#7b8088", roughness: 0.9 }), castShadow: false })
        .runtime({ id: "ground" })
    )
    .add(
      primitives
        .plane({ name: "track", size: [9.4, 1, 9.4], material: material.pbr({ color: "#5c616a", roughness: 1 }), castShadow: false })
        .position(0, 0.005, 0)
    )
    .add(
      assets
        .node("soldier", { name: "soldier-model", targetHeight: 1.8 })
        .animate({ clip: "Walk", loop: true })
        .position(RADIUS, 0, 0)
        .runtime({ id: "soldier", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 8.5, 9.5], target: [0, 0.6, 0], fov: 45 }))
});

type Gait = "Walk" | "Run";
let gait: Gait = "Walk";
let speed = WALK_SPEED;
let angle = 0;

function setGait(next: Gait): void {
  if (next === gait) return;
  gait = next;
  app.nodes.require("soldier").play(next, { loop: true, crossFade: 0.4 });
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (key === "r") setGait("Run");
  else if (key === "w") setGait("Walk");
});

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  const target = gait === "Run" ? RUN_SPEED : WALK_SPEED;
  speed += (target - speed) * Math.min(1, SPEED_BLEND * dt);
  angle = (angle + (speed / RADIUS) * dt) % (Math.PI * 2);

  const x = RADIUS * Math.cos(angle);
  const z = RADIUS * Math.sin(angle);
  // Travel direction is the derivative of (cos a, sin a) with respect to a.
  const vx = -Math.sin(angle);
  const vz = Math.cos(angle);
  const yaw = Math.atan2(vx, vz) + MODEL_YAW_OFFSET;

  app.nodes.require("soldier").setPosition(x, 0, z).setRotation(0, yaw, 0);
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
