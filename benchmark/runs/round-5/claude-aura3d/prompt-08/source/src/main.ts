import { camera, createAuraApp, effects, lights, prefabs, scene } from "@aura3d/engine";
import type { AuraApp } from "@aura3d/engine";
import "./style.css";

// Day/night toggle button overlay (CSS overlay only; 3D stays in the canvas).
document.querySelector<HTMLDivElement>("#app")!.insertAdjacentHTML("afterend", `
  <button class="toggle" type="button">switch to night</button>
`);

// One procedural city block reused across both lighting moods.
const cityBlock = prefabs.cityBlock({ blocks: 20, litWindows: true });

const cityCamera = camera.perspective({
  position: [0, 3.6, 7.2],
  target: [0, 0.55, -0.8]
});

function daySnapshot() {
  return scene()
    .background("#87ceeb")
    .addMany(cityBlock)
    .add(effects.fog({ density: 0.04 }))
    .add(lights.studio({ intensity: 1.08 }))
    .camera(cityCamera);
}

function nightSnapshot() {
  return scene()
    .background("#05070f")
    .addMany(cityBlock)
    .add(effects.fog({ density: 0.07 }))
    .add(effects.bloom({ intensity: 0.32 }))
    .add(lights.ambient({ intensity: 0.18, color: "#1b2740" }))
    .add(lights.point({ position: [0, 4.2, 1.6], intensity: 1.9, color: "#ffd27f" }))
    .camera(cityCamera);
}

let mode: "day" | "night" = "day";
let app: AuraApp = createAuraApp("#app", { scene: daySnapshot() });

const toggle = document.querySelector<HTMLButtonElement>(".toggle")!;
toggle.addEventListener("click", () => {
  mode = mode === "day" ? "night" : "day";
  toggle.textContent = mode === "day" ? "switch to night" : "switch to day";
  // Rebuild once per click (not per frame) to swap sky + lighting.
  app.dispose();
  app = createAuraApp("#app", {
    scene: mode === "day" ? daySnapshot() : nightSnapshot()
  });
});
