import { camera, createAuraApp, effects, lights, prefabs, scene } from "@aura3d/engine";
import { ui } from "@aura3d/engine";
import "./style.css";

type TimeOfDay = "day" | "night";

// Procedural city block: 20 box buildings of varying heights with windows,
// streets, and street lights. The day/night toggle rebuilds the scene so the
// sky (background) and lighting visibly change between states.
function buildScene(timeOfDay: TimeOfDay) {
  const isNight = timeOfDay === "night";
  return scene()
    .background(isNight ? "#061018" : "#9ec9f0")
    .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay }))
    .add(effects.fog({ density: isNight ? 0.035 : 0.014 }))
    .add(effects.bloom({ intensity: isNight ? 0.16 : 0.05 }))
    .add(lights.ambient({
      intensity: isNight ? 0.28 : 0.92,
      color: isNight ? "#22304a" : "#dfeeff"
    }))
    .add(lights.directional({
      position: [6, 9, 4],
      intensity: isNight ? 0.18 : 1.45,
      color: isNight ? "#3a4b6e" : "#fff4e0"
    }))
    .add(lights.studio({ intensity: isNight ? 0.55 : 1.1 }))
    .camera(camera.perspective({ position: [0.6, 5.2, 9.2], target: [0, 0.42, -0.4], fov: 58 }));
}

ui.html("#app", `
  <div id="stage"></div>
  <button class="toggle" type="button" aria-pressed="true">night mode active — switch to day</button>
`);

const stage = ui.root("#stage");

let isNight = true;
let app = createAuraApp(stage, { scene: buildScene("night") });

ui.onClick(".toggle", (button) => {
  isNight = !isNight;
  app.dispose();
  stage.replaceChildren();
  app = createAuraApp(stage, { scene: buildScene(isNight ? "night" : "day") });
  ui.setText(button, isNight ? "night mode active — switch to day" : "day mode active — switch to night");
  ui.setPressed(button, isNight);
});
