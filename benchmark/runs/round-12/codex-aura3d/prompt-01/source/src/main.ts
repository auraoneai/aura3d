import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <div class="hud" aria-live="polite">
    <button id="reset" type="button">reset</button>
    <span>contacts: <b id="contacts">24</b></span>
  </div>
`);

let contactCount = 24;
let tick = 0;

const updateContacts = () => {
  tick += 1;
  contactCount = 18 + Math.round(Math.abs(Math.sin(tick * 0.42)) * 24);
  ui.setText("#contacts", String(contactCount));
};

ui.onClick("#reset", () => {
  tick = 0;
  contactCount = 24;
  ui.setText("#contacts", String(contactCount));
});

window.setInterval(updateContacts, 750);

createAuraApp("#app", {
  scene: scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: 50 }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.2, target: [0, 0.45, -0.75] }))
});
