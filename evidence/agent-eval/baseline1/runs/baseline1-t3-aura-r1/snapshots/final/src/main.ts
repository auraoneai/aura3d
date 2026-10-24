import { camera, createAuraApp, lights, material, model, primitives, scene, unsafeModelUrl } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL__?: { clip: () => string };
    __EVAL_READY__?: boolean;
  }
}

const FADE_SECONDS = 0.4;
const SOLDIER_ID = "soldier";

// The assignment mandates loading /assets/soldier.glb directly (no typed manifest in this project).
const soldierAsset = unsafeModelUrl("/assets/soldier.glb", {
  metadata: { license: "task-provided fixture", animations: ["Idle", "Walk", "Run"] }
});

let currentClip = "Idle";
window.__EVAL__ = { clip: () => currentClip };

const stage = scene()
  .background("#1c2433")
  .add(
    primitives.plane({
      name: "ground",
      size: [14, 1, 14],
      position: [0, 0, 0],
      material: material.pbr({ color: "#7d8696", roughness: 0.92, metallic: 0 }),
      receiveShadow: true
    })
  )
  .add(
    model(soldierAsset, {
      name: "soldier",
      position: [0, 0, 0],
      targetHeight: 1.8,
      castShadow: true,
      receiveShadow: true
    })
      .animate({ clip: "Idle", loop: true, crossFade: false })
      .runtime({ id: SOLDIER_ID })
  )
  .add(lights.hemisphere({ name: "fill", skyColor: "#cfdcff", groundColor: "#3a3f4a", intensity: 0.7 }))
  .add(
    lights.directional({
      name: "key",
      position: [3.5, 6, 4],
      target: [0, 0.9, 0],
      intensity: 2.6,
      color: "#fff4e0",
      shadow: { mapSize: 2048 }
    })
  )
  .camera(camera.perspective({ position: [0, 1.25, 4.4], target: [0, 0.9, 0], fov: 40 }));

const app = createAuraApp("#app", {
  scene: stage,
  resize: false,
  pixelRatio: 1,
  animation: { mixer: "pose" },
  qualityRebuild: { flags: ["animation.skinned_shadows"] }
});

function fadeTo(clip: "Idle" | "Run"): void {
  if (currentClip === clip) return;
  currentClip = clip;
  app.nodes.require(SOLDIER_ID).play(clip, { loop: true, crossFade: FADE_SECONDS });
}

window.addEventListener("keydown", (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "r") fadeTo("Run");
  else if (key === "i") fadeTo("Idle");
});

// Ready once the GLB has produced render items and a frame has been presented
// (with a bounded fallback so a slow load can never leave the flag unset).
let frames = 0;
let signalled = false;
function signalReady(): void {
  if (signalled) return;
  signalled = true;
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
}
app.onFrame(() => {
  if (signalled) return;
  frames += 1;
  const evidence = app.nodes.get(SOLDIER_ID)?.importedAssetEvidence();
  if (evidence !== undefined && evidence.renderItemCount > 0 && frames > 2) signalReady();
  else if (frames > 900) signalReady();
});
void app.ready().catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
