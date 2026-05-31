import { camera, createAuraApp, effects, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <button class="toggle" type="button" aria-pressed="true">night mode active; sun/moon markers visible</button>
`);

let isNight = true;
let app = createCityApp(isNight);

function buildCity(night: boolean) {
  return scene()
    .background(night ? "#061018" : "#8fc9ff")
    .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay: night ? "night" : "day" }))
    .add(effects.fog({ density: night ? 0.035 : 0.012, color: night ? "#4b5f78" : "#c7e7ff" }))
    .add(effects.bloom({ intensity: night ? 0.14 : 0.05 }))
    .add(lights.studio({ intensity: night ? 1.08 : 1.45 }))
    .camera(camera.perspective({ position: [0.6, 5.2, 9.2], target: [0, 0.42, -0.4], fov: 58 }));
}

function createCityApp(night: boolean) {
  return createAuraApp("#app", { scene: buildCity(night) });
}

ui.onClick(".toggle", (button) => {
  isNight = !isNight;
  app.dispose();
  app = createCityApp(isNight);
  ui.setText(button, isNight ? "night mode active; sky/lights/windows changed" : "day mode active; sky/lights/windows changed");
  ui.setPressed(button, isNight);
});
