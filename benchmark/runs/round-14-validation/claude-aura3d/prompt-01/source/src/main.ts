import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  interactions,
  lights,
  physics,
  prefabs,
  scene,
  ui,
} from "@aura3d/engine";
import "./style.css";

// HUD overlay: reset control + live contact count readout.
ui.html(
  "#app",
  `
  <div class="hud">
    <button id="reset" type="button">Reset</button>
    <div class="readout">
      <span class="label">Contacts</span>
      <span id="contacts">0</span>
    </div>
    <span class="hint">50 cubes drop onto a tilted ramp — live collision response</span>
  </div>
`
);

// Visible physics scene: 50 falling cubes, a tilted ramp, contact patches,
// studio lighting, and an orbit camera framed on the setup.
const physicsScene = scene()
  .background("#070b12")
  .addMany(prefabs.physicsPlayground({ cubes: 50 }))
  .add(lights.studio({ intensity: 1.15 }))
  .add(interactions.orbit())
  .camera(camera.physics());

// Simulation world derived from the scene geometry for real contact evidence.
const world = physics.worldFromScene(physicsScene);

function showContacts(): void {
  ui.setText("#contacts", String(world.snapshot().contacts));
}

ui.resetButton("#reset", () => {
  world.reset();
  showContacts();
});

// Live contact count: step the simulation and refresh the overlay from the
// real per-frame snapshot (not a faked timer counter).
showContacts();
window.setInterval(() => {
  world.step(1 / 60);
  showContacts();
}, 1000 / 30);

console.log(
  collectAuraSceneEvidence(
    scene().physics(world).addMany(physicsScene.toJSON().nodes)
  ).physics
);

createAuraApp("#app", { scene: physicsScene });
