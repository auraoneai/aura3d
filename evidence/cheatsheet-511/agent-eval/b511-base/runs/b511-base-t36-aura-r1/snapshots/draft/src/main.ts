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
const WALK_SPEED = 1.5; // m/s along the circle
const RUN_SPEED = 3.6;
const CROSSFADE = 0.4; // seconds
// The model faces +Z in its local space; adjust if it turns out to face the other way.
const FACING_OFFSET = 0;

const app = createAuraApp("#app", {
  scene: scene({ background: "#8fa6bd" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.hemisphere({ skyColor: "#d6e4f5", groundColor: "#575a52", intensity: 0.8 }))
    .add(
      lights.directional({
        name: "sun",
        position: [5, 9, 4],
        target: [0, 0.8, 0],
        intensity: 2.8,
        shadow: true
      })
    )
    .camera(camera.perspective({ position: [0, 8.5, 10.5], target: [0, 0.6, 0], fov: 45 }))
    .add(
      primitives.plane({
        name: "ground",
        material: material.pbr({ color: "#7d8a6a", roughness: 0.95 }),
        castShadow: false,
        receiveShadow: true
      }).scale([20, 1, 20])
    )
    .add(
      primitives.ring({
        name: "path-marker",
        material: material.pbr({ color: "#b9ae94", roughness: 1 }),
        size: [RADIUS * 2 + 0.5, 1, RADIUS * 2 + 0.5],
        params: { innerRadius: 0.9, outerRadius: 1 },
        position: [0, 0.01, 0],
        rotation: [-Math.PI / 2, 0, 0],
        castShadow: false,
        receiveShadow: true
      })
    )
    .add(
      assets
        .node("soldier", { name: "soldier-model", targetHeight: 1.8 })
        .animate({ clip: "Walk", loop: true })
        .runtime({ id: "soldier", mutable: true })
    )
});

type Gait = "Walk" | "Run";
let gait: Gait = "Walk";
let speed = WALK_SPEED;
let angle = 0;
let ready = false;

window.addEventListener("keydown", (event) => {
  if (!ready) return;
  const key = event.key.toLowerCase();
  const next: Gait | null = key === "r" ? "Run" : key === "w" ? "Walk" : null;
  if (!next || next === gait) return;
  gait = next;
  app.nodes.require("soldier").play(gait, { loop: true, crossFade: CROSSFADE });
});

function place(): void {
  const soldier = app.nodes.require("soldier");
  const x = RADIUS * Math.sin(angle);
  const z = RADIUS * Math.cos(angle);
  soldier.setPosition(x, 0, z);
  // Tangent of increasing angle is (cos a, -sin a); a +Z-facing model yaws by a + PI/2 to match.
  soldier.setRotation(0, angle + Math.PI / 2 + FACING_OFFSET, 0);
}

let frames = 0;
app.onFrame((frame) => {
  if (!ready) return;
  const dt = Math.min(frame.dt, 0.1);
  const target = gait === "Run" ? RUN_SPEED : WALK_SPEED;
  // Ease the ground speed toward the target over roughly the crossfade time.
  speed += (target - speed) * (1 - Math.exp(-dt / (CROSSFADE * 0.6)));
  angle = (angle + (speed / RADIUS) * dt) % (Math.PI * 2);
  place();
  frames += 1;
  if (frames === 2) window.__EVAL_READY__ = true;
});

app.ready().then(() => {
  ready = true;
  place();
});
