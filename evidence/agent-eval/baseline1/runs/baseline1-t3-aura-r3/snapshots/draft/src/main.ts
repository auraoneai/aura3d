import { camera, createAuraApp, lights, material, model, primitives, scene } from "@aura3d/engine";
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

// The clip we are playing, or fading towards once a fade has started.
let currentClip = "Idle";

const appScene = scene({ background: "#1b2230" })
  // Ground plane the character stands on (receives the shadow).
  .add(
    primitives.plane({
      name: "ground",
      size: [10, 10],
      material: material.pbr({ color: "#7d8794", roughness: 0.9, metalness: 0 }),
      castShadow: false,
      receiveShadow: true
    }).position(0, 0, 0)
  )
  // Skinned character: height fitted to 1.8 units, feet on y = 0, starting on Idle.
  .add(
    model(assets.soldier, {
      name: "soldier",
      scaleMode: "fit",
      targetHeight: CHARACTER_HEIGHT,
      castShadow: true,
      receiveShadow: true
    })
      .position(0, 0, 0)
      .runtime({ id: SOLDIER_ID })
      .animate({ clip: currentClip, loop: true })
  )
  // Non-shadowing fill so the shadow-casting key stays the only shadow light.
  .add(lights.hemisphere({ skyColor: "#c9d6ff", groundColor: "#3a3f4a", intensity: 0.55 }))
  // The single shadow-casting light.
  .add(
    lights.directional({
      name: "key",
      position: [3, 5, 3.5],
      target: [0, 0.9, 0],
      intensity: 2.2,
      shadow: { mapSize: 2048 }
    })
  )
  .camera(camera.perspective({ position: [0, 1.25, 4.6], target: [0, 0.9, 0], fov: 38 }));

const app = createAuraApp("#app", {
  scene: appScene,
  animation: { mixer: "pose" }
});

function crossFadeTo(clip: string): void {
  if (clip === currentClip) return;
  currentClip = clip;
  app.nodes.require(SOLDIER_ID).play(clip, { loop: true, crossFade: FADE_SECONDS });
}

window.addEventListener("keydown", (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "r") crossFadeTo("Run");
  else if (key === "i") crossFadeTo("Idle");
});

window.__EVAL__ = { clip: () => currentClip };

// Ready = model asset loaded and a frame drawn with geometry.
let frames = 0;
let signalled = false;
function signalReady(): void {
  if (signalled) return;
  signalled = true;
  window.__EVAL_READY__ = true;
}
app.onFrame(() => {
  frames += 1;
  if (signalled || frames < 2) return;
  const d = app.diagnostics();
  const loaded = d.assets.length > 0 && d.assets.every((a) => a.status === "ready");
  if (loaded && d.drawCalls > 1) signalReady();
});
// Safety net so a slow/failed load never leaves the harness waiting forever.
window.setTimeout(() => {
  if (frames > 0) signalReady();
}, 15000);
