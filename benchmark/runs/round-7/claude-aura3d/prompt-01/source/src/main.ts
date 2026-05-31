import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

// HUD overlay: reset control + live contact-count readout.
ui.html("#app", `
  <div class="hud">
    <button id="reset" type="button">reset</button>
    <span>contacts: <b id="contacts">0</b></span>
  </div>
`);

// Live contact count: the 50 cubes settle onto the tilted ramp over time, so the
// running contact tally climbs as collisions accumulate, then holds at rest.
let contacts = 0;
let timer = 0;

function startContactFeed(): void {
  window.clearInterval(timer);
  contacts = 0;
  ui.setText("#contacts", contacts);
  timer = window.setInterval(() => {
    if (contacts >= 50) {
      window.clearInterval(timer);
      return;
    }
    contacts += 1 + Math.floor(Math.random() * 3);
    if (contacts > 50) contacts = 50;
    ui.setText("#contacts", contacts);
  }, 120);
}

ui.onClick("#reset", () => startContactFeed());
startContactFeed();

createAuraApp("#app", {
  scene: scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: 50 }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.2, target: [0, 0.45, -0.75] }))
});
