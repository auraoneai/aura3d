import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  interactions,
  lights,
  physics,
  prefabs,
  scene,
  ui
} from "@aura3d/engine";
import "./style.css";

ui.html(
  "#app",
  `
    <div class="hud" aria-label="physics playground status">
      <button id="reset" type="button">reset</button>
      <span>contacts: <strong id="contact-count">0</strong></span>
      <span class="evidence">50 cubes, tilted ramp, contact patches, orbit camera</span>
    </div>
  `
);

const physicsScene = scene()
  .background("#070b12")
  .addMany(prefabs.physicsPlayground({ cubes: 50 }))
  .add(lights.studio({ intensity: 1.15 }))
  .add(interactions.orbit())
  .camera(camera.physics());

const world = physics.worldFromScene(physicsScene);

function refreshContactCount() {
  physics.step(world, { dt: 1 / 60, steps: 1 });
  ui.setText("#contact-count", physics.liveContactCount(world));
  requestAnimationFrame(refreshContactCount);
}

ui.onClick("#reset", (button) => {
  world.reset();
  ui.setText("#contact-count", physics.liveContactCount(world));
  ui.setText(button, `reset ${world.snapshot().resets}`);
});

console.log(
  collectAuraSceneEvidence(scene().physics(world).addMany(physicsScene.toJSON().nodes)).physics
);

createAuraApp("#app", {
  scene: physicsScene
});

refreshContactCount();
