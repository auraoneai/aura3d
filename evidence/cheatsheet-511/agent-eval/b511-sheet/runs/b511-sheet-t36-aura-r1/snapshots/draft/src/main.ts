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
const CROSSFADE = 0.35; // seconds
// Yaw offset if the model's forward axis is not +Z.
const MODEL_YAW_OFFSET = 0;

async function sha256Hex(url: string): Promise<string> {
  const res = await fetch(url);
  const bytes = await res.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function main(): Promise<void> {
  const url = "/assets/soldier.glb";
  const sha256 = await sha256Hex(url);
  const assets = defineModelAssets(
    { soldier: { url, sha256, animations: ["Idle", "Walk", "Run"], license: "provided fixture" } },
    { queryParam: null }
  );

  const startAngle = 0;
  const startPos = (a: number): [number, number, number] => [RADIUS * Math.cos(a), 0, RADIUS * Math.sin(a)];
  // Heading for travel in the direction of increasing angle: tangent (-sin a, 0, cos a).
  const yawFor = (a: number): number => Math.atan2(-Math.sin(a), Math.cos(a)) + MODEL_YAW_OFFSET;

  const app = createAuraApp("#app", {
    scene: scene({ background: "#8fb4d9" })
      .add(environments.neutral({ intensity: 0.7, background: false }))
      .add(
        lights.directional({
          position: [6, 10, 5],
          target: [0, 0, 0],
          intensity: 3,
          shadow: true
        })
      )
      .add(
        primitives.plane({
          name: "ground",
          size: [24, 1, 24],
          material: material.pbr({ color: "#6b7a5a", roughness: 0.95 })
        })
      )
      .add(
        primitives.cylinder({
          name: "path-marker",
          size: [2 * RADIUS + 0.8, 0.02, 2 * RADIUS + 0.8],
          material: material.pbr({ color: "#8c8472", roughness: 1 })
        }).position(0, 0.01, 0)
      )
      .add(
        primitives.cylinder({
          name: "path-inner",
          size: [2 * RADIUS - 0.8, 0.03, 2 * RADIUS - 0.8],
          material: material.pbr({ color: "#6b7a5a", roughness: 0.95 })
        }).position(0, 0.012, 0)
      )
      .add(
        assets
          .node("soldier", { name: "soldier", targetHeight: 1.8 })
          .position(...startPos(startAngle))
          .rotation(0, yawFor(startAngle), 0)
          .animate({ clip: "Walk", loop: true })
          .runtime({ id: "soldier", mutable: true })
      )
      .camera(camera.perspective({ position: [0, 8.5, 9.5], target: [0, 0.6, 0], fov: 48 }))
  });

  let angle = startAngle;
  let speed = WALK_SPEED;
  let targetSpeed = WALK_SPEED;
  let current: "Walk" | "Run" = "Walk";

  const setGait = (gait: "Walk" | "Run"): void => {
    if (gait === current) return;
    current = gait;
    targetSpeed = gait === "Run" ? RUN_SPEED : WALK_SPEED;
    app.nodes.require("soldier").play(gait, { loop: true, crossFade: CROSSFADE });
  };

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === "r") setGait("Run");
    else if (k === "w") setGait("Walk");
  });

  app.onFrame((f) => {
    const dt = Math.min(f.dt, 0.1);
    // Ease the travel speed toward the target over roughly the crossfade time.
    const blend = 1 - Math.exp(-dt / (CROSSFADE * 0.5));
    speed += (targetSpeed - speed) * blend;
    angle += (speed / RADIUS) * dt;
    const [x, y, z] = startPos(angle);
    app.nodes.require("soldier").setPosition(x, y, z).setRotation(0, yawFor(angle), 0);
  });

  await app.ready();
  requestAnimationFrame(() => requestAnimationFrame(() => (window.__EVAL_READY__ = true)));
}

void main();
