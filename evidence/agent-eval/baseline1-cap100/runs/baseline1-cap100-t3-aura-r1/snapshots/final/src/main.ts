import { camera, createAuraApp, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __EVAL__?: { clip: () => string };
    __EVAL_READY__?: boolean;
  }
}

const NODE_ID = "soldier";
const FADE_SECONDS = 0.4;
const CHARACTER_HEIGHT = 1.8;

// Name of the clip currently playing (the target clip once a fade starts).
let currentClip = "Idle";

const stage = scene()
  .background("#20252e")
  .camera(
    camera.perspective({
      position: [0, 1.25, 4.6],
      target: [0, 0.9, 0],
      fov: 38
    })
  )
  // Ground plane the character stands on (XZ plane, top surface at y = 0).
  .add(
    primitives.plane({
      name: "ground",
      size: [14, 1, 14],
      position: [0, 0, 0],
      material: material.pbr({ color: "#7d8794", roughness: 0.95, metallic: 0 }),
      receiveShadow: true
    })
  )
  // The skinned soldier: feet at y = 0, normalised to CHARACTER_HEIGHT.
  .add(
    model(assets.soldier, {
      name: "soldier-model",
      role: "primaryCharacter",
      targetHeight: CHARACTER_HEIGHT,
      position: [0, 0, 0],
      castShadow: true,
      receiveShadow: true
    })
      .animate({ clip: currentClip, loop: true, crossFade: 0 })
      .runtime({ id: NODE_ID, tags: ["player"] })
  )
  // Soft non-shadowing fill so the shaded side stays readable.
  .add(lights.hemisphere({ name: "fill", skyColor: "#b8c7e6", groundColor: "#4a4f58", intensity: 0.55 }))
  // The single shadow-casting light.
  .add(
    lights.directional({
      name: "key",
      position: [3, 5.5, 4],
      target: [0, 0.8, 0],
      intensity: 2.4,
      color: "#fff4e0",
      shadow: { mapSize: 2048, filter: "pcf", fit: { center: [0, 0.8, 0], extent: 4 } }
    })
  );

const app = createAuraApp("#app", {
  scene: stage,
  resize: false,
  pixelRatio: 1,
  // The pose mixer is the path that honours `crossFade` between clips.
  animation: { mixer: "pose" }
});

function fadeTo(clip: "Idle" | "Run"): void {
  if (clip === currentClip) return;
  currentClip = clip;
  app.nodes.require(NODE_ID).play(clip, { loop: true, crossFade: FADE_SECONDS });
}

window.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "r") fadeTo("Run");
  else if (key === "i") fadeTo("Idle");
});

window.__EVAL__ = { clip: () => currentClip };

// Ready once the GLB is loaded (clips known) and a frame has been drawn.
let frames = 0;
const startedAt = performance.now();
const stopWatching = app.onFrame(() => {
  frames += 1;
  if (window.__EVAL_READY__) return;
  let loaded = false;
  try {
    const evidence = app.nodes.require(NODE_ID).importedAssetEvidence();
    loaded = evidence !== undefined && evidence.renderItemCount > 0;
  } catch {
    loaded = false;
  }
  const timedOut = performance.now() - startedAt > 15000;
  if ((loaded && frames >= 2) || timedOut) {
    // Defer to after the frame that just ran has been presented.
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
    stopWatching();
  }
});

void app.ready();
