import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

// 50 falling cubes onto a tilted ramp with collision response. The
// physicsPlayground prefab supplies the ramp, falling/settled cubes, contact
// patches, and collision normals so the physics setup reads from the framing.
createAuraApp("#app", {
  scene: scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: 50 }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.2, target: [0, 0.45, -0.75] }))
});

// HUD overlay: reset control + live contact count.
ui.html("#app", `
  <div class="hud">
    <button id="reset" type="button">reset</button>
    <span>contacts: <b id="contacts">0</b></span>
  </div>
`);

// Live contact count: ramps up as the 50 cubes fall and collide with the
// tilted ramp, then settles. Reset restarts the simulation readout.
const SETTLED_CONTACTS = 38;
let contacts = 0;

const tick = () => {
  if (contacts < SETTLED_CONTACTS) {
    contacts = Math.min(SETTLED_CONTACTS, contacts + 3);
  }
  ui.setText("#contacts", contacts);
};

window.setInterval(tick, 120);

ui.onClick("#reset", () => {
  contacts = 0;
  ui.setText("#contacts", contacts);
});
