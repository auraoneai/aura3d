import { camera, createAuraApp, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __EVAL__?: { clip: () => string };
    __EVAL_READY__?: boolean;
  }
}

const FADE_SECONDS = 0.4;
const HERO_ID = "soldier";

let currentClip = "Idle";

const app = createAuraApp("#app", {
  scene: scene({ background: "#1c232d" })
    .add(
      primitives.plane({
        name: "ground",
        material: material.pbr({ color: "#59606a", roughness: 0.9, metallic: 0 }),
        castShadow: false,
        receiveShadow: true
      })
        .position(0, 0, 0)
        .scale([14, 1, 14])
    )
    .add(
      model(assets.soldier, {
        name: "soldier",
        scaleMode: "fit",
        targetHeight: 1.8,
        castShadow: true,
        receiveShadow: true
      })
        .position(0, 0, 0)
        .runtime({ id: HERO_ID, tags: ["player"] })
    )
    .add(lights.ambient({ intensity: 0.45 }))
    .add(
      lights.directional({
        name: "sun",
        position: [3, 6, 4],
        target: [0, 0.9, 0],
        intensity: 2.4,
        shadow: { mapSize: 2048, filter: "pcf", fit: { center: [0, 0.9, 0], extent: 4 } }
      })
    )
    .camera(camera.perspective({ position: [2.2, 1.5, 4.6], target: [0, 0.9, 0], fov: 38 }))
});

const hero = app.nodes.require(HERO_ID);
hero.play("Idle", { loop: true });

function fadeTo(clip: string): void {
  if (currentClip === clip) return;
  currentClip = clip;
  hero.play(clip, { loop: true, crossFade: FADE_SECONDS, transition: "crossfade" });
}

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "KeyR") fadeTo("Run");
  else if (event.code === "KeyI") fadeTo("Idle");
});

window.__EVAL__ = { clip: () => currentClip };

void (async () => {
  await app.ready();
  // Wait (bounded) for the GLB to finish loading, then for a drawn frame.
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    const assetsState = app.diagnostics().assets;
    if (assetsState.length > 0 && assetsState.every((a) => a.status === "ready" || a.status === "error")) break;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  window.__EVAL_READY__ = true;
})();
