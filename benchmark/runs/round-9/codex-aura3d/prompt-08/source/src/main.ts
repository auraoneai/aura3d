import {
  camera,
  createAuraApp,
  effects,
  lights,
  prefabs,
  scene,
  ui,
  type AuraApp
} from "@aura3d/engine";
import "./style.css";

type TimeOfDay = "day" | "night";

ui.html(
  "#app",
  `
    <div id="scene"></div>
    <button class="toggle" type="button" aria-pressed="true">night mode active</button>
  `
);

const makeCityScene = (timeOfDay: TimeOfDay) => {
  const isNight = timeOfDay === "night";

  return scene()
    .background(isNight ? "#061018" : "#8fcdea")
    .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay }))
    .add(effects.fog({ density: isNight ? 0.035 : 0.012 }))
    .add(effects.bloom({ intensity: isNight ? 0.16 : 0.035 }))
    .add(lights.ambient({ color: isNight ? "#6f89bd" : "#d8ecff", intensity: isNight ? 0.26 : 0.62 }))
    .add(
      lights.directional({
        color: isNight ? "#9fb7ff" : "#fff4d8",
        intensity: isNight ? 0.55 : 1.45,
        position: isNight ? [-3.2, 5.4, 2.4] : [4.8, 7.2, 3.8]
      })
    )
    .add(lights.studio({ intensity: isNight ? 1.08 : 0.72 }))
    .camera(camera.perspective({ position: [0.6, 5.2, 9.2], target: [0, 0.42, -0.4], fov: 58 }));
};

let timeOfDay: TimeOfDay = "night";
let app: AuraApp = createAuraApp("#scene", { scene: makeCityScene(timeOfDay) });

ui.onClick(".toggle", (button) => {
  timeOfDay = timeOfDay === "night" ? "day" : "night";
  ui.setText(button, timeOfDay === "night" ? "night mode active" : "day mode active");
  ui.setPressed(button, timeOfDay === "night");

  app.dispose();
  app = createAuraApp("#scene", { scene: makeCityScene(timeOfDay) });
});
