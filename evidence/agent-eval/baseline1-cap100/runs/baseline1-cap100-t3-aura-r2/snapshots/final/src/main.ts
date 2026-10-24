import { camera, createAuraApp, defineAuraAssets, lights, material, model, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL__?: { clip: () => string };
    __EVAL_READY__?: boolean;
  }
}

const assets = defineAuraAssets({
  soldier: {
    type: "model",
    format: "glb",
    url: "/assets/soldier.glb",
    metadata: { animations: ["Idle", "Run", "TPose", "Walk"] }
  }
} as const);

const FADE_SECONDS = 0.4;
const CHARACTER_HEIGHT = 1.8;

let currentClip = "Idle";
window.__EVAL__ = { clip: () => currentClip };

const stage = scene({ background: "#8fa6bd" })
  .add(
    primitives.plane({
      name: "ground",
      size: [16, 1, 16],
      position: [0, 0, 0],
      material: material.pbr({ color: "#6f7a68", roughness: 0.95, metalness: 0 }),
      receiveShadow: true,
      castShadow: false
    })
  )
  .add(
    model(assets.soldier, {
      name: "soldier",
      position: [0, 0, 0],
      targetHeight: CHARACTER_HEIGHT,
      castShadow: true,
      receiveShadow: true
    })
      .animate({ clip: "Idle", loop: true, crossFade: FADE_SECONDS })
      .runtime({ id: "soldier" })
  )
  .add(lights.hemisphere({ name: "fill", skyColor: "#dbe7ff", groundColor: "#5b5f55", intensity: 0.7 }))
  .add(lights.ambient({ name: "ambient", intensity: 0.25 }))
  .add(
    lights.directional({
      name: "sun",
      position: [3.5, 6, 4],
      target: [0, 0.9, 0],
      intensity: 2.6,
      color: "#fff4e0",
      shadow: { mapSize: 2048 }
    })
  )
  .camera(camera.perspective({ position: [0, 1.35, 5.2], target: [0, 0.88, 0], fov: 38 }));

const app = createAuraApp("#app", {
  scene: stage,
  resize: false,
  pixelRatio: 1
});

const soldier = app.nodes.require("soldier");

function fadeTo(clip: "Idle" | "Run"): void {
  if (currentClip === clip) return;
  currentClip = clip;
  soldier.play(clip, { loop: true, crossFade: FADE_SECONDS });
}

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "KeyR") fadeTo("Run");
  else if (event.code === "KeyI") fadeTo("Idle");
});

function markReadyWhenLoaded(): void {
  const started = performance.now();
  const check = (): void => {
    const states = app.diagnostics().assets;
    const loaded = states.length > 0 && states.every((state) => state.status === "ready" || state.status === "error");
    const timedOut = performance.now() - started > 15000;
    if ((loaded && app.runtime.frame >= 3) || timedOut) {
      window.__EVAL_READY__ = true;
      return;
    }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

void app.ready().then(markReadyWhenLoaded, markReadyWhenLoaded);
