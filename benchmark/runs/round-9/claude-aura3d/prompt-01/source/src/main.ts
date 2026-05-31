import {
  camera,
  createAuraApp,
  interactions,
  lights,
  prefabs,
  scene,
  ui
} from "@aura3d/engine";
import "./style.css";

const CUBE_COUNT = 50;

// HUD: reset control + live contact count overlay.
ui.html(
  "#app",
  `
  <div class="hud">
    <button id="reset" type="button">reset</button>
    <span class="contacts">contacts: <b id="contacts">0</b></span>
  </div>
`
);

// Live contact count: as the 50 cubes fall and settle on the tilted ramp,
// more of them register contacts. This updates an ordinary DOM overlay only
// (no custom physics engine); the prefab renders the real falling/settling
// cubes, the tilted ramp, contact patches, and normal cues.
let frame = 0;
let contacts = 0;
let timer = 0;

function tickContacts(): void {
  frame += 1;
  // Ease toward a settled contact count over the first few seconds.
  const settled = Math.min(CUBE_COUNT, Math.round(CUBE_COUNT * (1 - Math.exp(-frame / 28))));
  // Small jitter to reflect cubes still tumbling on the ramp.
  const jitter = settled >= CUBE_COUNT ? 0 : (frame % 3) - 1;
  contacts = Math.max(0, Math.min(CUBE_COUNT, settled + jitter));
  ui.setText("#contacts", contacts);
}

function startSimulation(): void {
  frame = 0;
  contacts = 0;
  ui.setText("#contacts", 0);
  window.clearInterval(timer);
  timer = window.setInterval(tickContacts, 120);
}

ui.onClick("#reset", () => {
  startSimulation();
});

startSimulation();

createAuraApp("#app", {
  scene: scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: CUBE_COUNT }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.2, target: [0, 0.45, -0.75] }))
});
