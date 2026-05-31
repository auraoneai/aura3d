import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

const initialContacts = 24;
let contacts = initialContacts;

ui.html("#app", `
  <div class="hud">
    <button id="reset" type="button">reset</button>
    <span>contacts: <b id="contacts">${initialContacts}</b></span>
  </div>
`);

ui.onClick("#reset", () => {
  contacts = initialContacts;
  ui.setText("#contacts", String(contacts));
});

window.setInterval(() => {
  contacts = 18 + Math.round((Math.sin(Date.now() / 460) + 1) * 12);
  ui.setText("#contacts", String(contacts));
}, 600);

createAuraApp("#app", {
  scene: scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: 50 }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.2, target: [0, 0.45, -0.75] }))
});
