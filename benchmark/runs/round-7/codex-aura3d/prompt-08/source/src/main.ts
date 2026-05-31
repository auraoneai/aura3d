import {
  camera,
  createAuraApp,
  effects,
  lights,
  prefabs,
  scene,
  ui
} from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <div id="scene"></div>
  <button class="toggle" type="button" aria-pressed="false">switch to night</button>
`);

let isNight = false;
let app = createCityScene(isNight);

ui.onClick(".toggle", (button) => {
  isNight = !isNight;
  ui.setText(button, isNight ? "switch to day" : "switch to night");
  ui.setPressed(button, isNight);

  app.dispose();
  app = createCityScene(isNight);
});

function createCityScene(night: boolean) {
  const sky = night ? "#07111f" : "#87ceeb";
  const fogColor = night ? "#111827" : "#d7efff";

  return createAuraApp("#scene", {
    scene: scene()
      .background(sky)
      .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true }))
      .add(effects.fog({ density: night ? 0.075 : 0.04, color: fogColor }))
      .add(effects.bloom({ intensity: night ? 0.34 : 0.1 }))
      .add(lights.ambient({ intensity: night ? 0.22 : 0.48, color: night ? "#8fb4ff" : "#ffffff" }))
      .add(lights.directional({
        position: night ? [-2.4, 4.2, 1.6] : [2.8, 5.0, 2.2],
        intensity: night ? 0.5 : 1.35,
        color: night ? "#b7c9ff" : "#fff4d6"
      }))
      .add(lights.studio({ intensity: night ? 0.46 : 1.08 }))
      .camera(camera.perspective({ position: [0, 3.6, 7.2], target: [0, 0.55, -0.8], fov: 48 }))
  });
}
