import {
  camera,
  createAuraApp,
  groundedRenderedAssetPlacement,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __EVAL__?: { clip: () => string };
    __EVAL_READY__?: boolean;
  }
}

const SOLDIER_ID = "soldier";
const FADE_SECONDS = 0.4;
const CHARACTER_HEIGHT = 1.8;

// Rendered scale/position that puts the soldier's feet on y = 0.
const placement = groundedRenderedAssetPlacement(assets.soldier, {
  targetHeight: CHARACTER_HEIGHT,
  floorY: 0
});

const stage = scene()
  .add(lights.hemisphere({ name: "fill", skyColor: "#dbe7ff", groundColor: "#4a4a4a", intensity: 0.7 }))
  .add(
    lights.directional({
      name: "key light",
      position: [3.5, 6, 4],
      target: [0, 0.9, 0],
      intensity: 2.4,
      shadow: { mapSize: 2048 }
    })
  )
  .add(
    primitives
      .plane({
        name: "ground",
        material: material.pbr({ color: "#8d949c", roughness: 0.9, metalness: 0 }),
        receiveShadow: true
      })
      .position(0, 0, 0)
      .scale([14, 1, 14])
  )
  .add(
    model(assets.soldier, { name: "soldier", castShadow: true, receiveShadow: true })
      .position(...placement.position)
      .scale(placement.scale)
      .animate({ clip: "Idle", loop: true, crossFade: FADE_SECONDS })
      .runtime({ id: SOLDIER_ID })
  )
  .camera(camera.perspective({ position: [1.3, 1.25, 3.7], target: [0, 0.9, 0], fov: 40 }));

const app = createAuraApp("#app", { scene: stage });

let currentClip = "Idle";

function fadeTo(clip: "Idle" | "Run"): void {
  if (clip === currentClip) return;
  currentClip = clip;
  app.nodes.require(SOLDIER_ID).play(clip, { loop: true, crossFade: FADE_SECONDS });
}

window.addEventListener("keydown", (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "r") fadeTo("Run");
  else if (key === "i") fadeTo("Idle");
});

window.__EVAL__ = { clip: () => currentClip };

void app
  .ready()
  .then(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  )
  .then(() => {
    const errors = app.diagnostics().errors;
    if (errors.length > 0) console.error("Aura3D diagnostics errors", errors);
    window.__EVAL_READY__ = true;
  })
  .catch((error: unknown) => {
    console.error(error);
    window.__EVAL_READY__ = true;
  });
