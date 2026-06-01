import {
  camera,
  city,
  createAuraApp,
  effects,
  lights,
  scene,
  ui
} from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <button class="toggle" type="button" aria-pressed="true">
    night mode active; sun/moon markers visible
  </button>
`);

let isNight = true;
const cityState = city.createState({
  timeOfDay: "night",
  blocks: 20,
  litWindows: true
});
let app = createCityApp();

function buildCity() {
  const night = cityState.timeOfDay === "night";

  return scene()
    .background(night ? "#061018" : "#8fc9ff")
    .addMany(cityState.nodes())
    .add(effects.fog({
      density: night ? 0.035 : 0.012,
      color: night ? "#4b5f78" : "#c7e7ff"
    }))
    .add(effects.bloom({ intensity: night ? 0.14 : 0.05 }))
    .add(lights.studio({ intensity: night ? 1.08 : 1.45 }))
    .camera(camera.city());
}

function createCityApp() {
  return createAuraApp("#app", { scene: buildCity() });
}

ui.onClick(".toggle", (button) => {
  cityState.toggleTimeOfDay();
  isNight = cityState.timeOfDay === "night";
  app.dispose();
  app = createCityApp();
  ui.setText(
    button,
    isNight
      ? "night mode active; sky/lights/windows changed"
      : "day mode active; sky/lights/windows changed"
  );
  ui.setPressed(button, isNight);
});
