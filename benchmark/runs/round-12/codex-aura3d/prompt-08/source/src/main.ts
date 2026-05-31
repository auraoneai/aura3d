import { camera, createAuraApp, effects, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <button class="toggle" type="button" aria-pressed="true">
    night mode active; sun/moon markers visible
  </button>
`);

let isNight = true;

ui.onClick(".toggle", (button) => {
  isNight = !isNight;
  ui.setText(
    button,
    isNight
      ? "night mode active; sun/moon markers visible"
      : "day mode requested; sun/moon markers visible",
  );
  ui.setPressed(button, isNight);
});

createAuraApp("#app", {
  scene: scene()
    .background("#061018")
    .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay: "night" }))
    .add(effects.fog({ density: 0.035 }))
    .add(effects.bloom({ intensity: 0.14 }))
    .add(lights.studio({ intensity: 1.08 }))
    .camera(camera.perspective({ position: [0.6, 5.2, 9.2], target: [0, 0.42, -0.4], fov: 58 })),
});
