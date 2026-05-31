import { camera, createAuraApp, effects, lights, prefabs, scene, ui } from "@aura3d/engine";
import type { AuraApp } from "@aura3d/engine";
import "./style.css";

// Procedural city block: 20 varied-height box buildings with windows, streets,
// and street lights via prefabs.cityBlock, plus a day/night toggle that
// rebuilds the scene so lighting and sky actually change.

let isNight = true;
let app: AuraApp | null = null;

function label(): string {
  return isNight
    ? "night mode active; tap for day"
    : "day mode active; tap for night";
}

function buildScene(night: boolean) {
  return scene()
    .background(night ? "#061018" : "#9ec9f2")
    .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay: night ? "night" : "day" }))
    .add(effects.fog({ density: night ? 0.035 : 0.018 }))
    .add(effects.bloom({ intensity: night ? 0.16 : 0.05 }))
    .add(lights.studio({ intensity: night ? 1.08 : 1.7 }))
    .camera(camera.perspective({ position: [0.6, 5.2, 9.2], target: [0, 0.42, -0.4], fov: 58 }));
}

function render(): void {
  app?.dispose();
  const container = document.querySelector("#app");
  if (container) container.innerHTML = "";

  ui.html(
    "#app",
    `<button class="toggle" type="button" aria-pressed="${isNight}">${label()}</button>`
  );
  ui.onClick(".toggle", () => {
    isNight = !isNight;
    render();
  });

  app = createAuraApp("#app", { scene: buildScene(isNight) });
}

render();
