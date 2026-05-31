import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

const initialContacts = "24";

ui.html(
  "#app",
  `
    <div class="hud" aria-label="physics controls">
      <button id="reset" type="button">Reset</button>
      <span>contacts: <b id="contacts">${initialContacts}</b></span>
    </div>
  `,
);

ui.onClick("#reset", () => {
  ui.setText("#contacts", initialContacts);
});

createAuraApp("#app", {
  scene: scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: 50 }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.2, target: [0, 0.45, -0.75] })),
});
