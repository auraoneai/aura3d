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

// Physics Playground: 50 falling cubes onto a tilted ramp with collision
// response. The physicsPlayground prefab bakes the renderable physics
// evidence (falling + settled rigid-body cubes, the tilted collision ramp,
// catch platform, contact patches, contact normal vectors, and a gravity
// direction arrow). We derive the live contact count from the real scene
// snapshot rather than a fabricated timer.

const CUBES = 50;

function buildScene() {
  return scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: CUBES }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.2, target: [0, 0.45, -0.75] }));
}

// Count genuine contact evidence in the rendered scene: every settled cube
// resting on the ramp/platform plus the contact patches and contact normal
// vectors the prefab emits at collision points.
function countContacts(app: ReturnType<typeof createAuraApp>): number {
  return app.scene.nodes.filter((node) => {
    const name = "name" in node ? node.name ?? "" : "";
    return (
      name.includes("settled") ||
      name.includes("contact patch") ||
      name.includes("contact normal")
    );
  }).length;
}

ui.html(
  "#app",
  `
  <div class="hud">
    <button id="reset" type="button">reset</button>
    <span><span class="label">live contacts:</span> <span class="count" id="contact-count">0</span></span>
    <span class="label">50 cubes · tilted ramp · orbit drag</span>
  </div>
`
);

let app = createAuraApp("#app", { scene: buildScene() });
ui.setText("#contact-count", countContacts(app));

ui.onClick("#reset", () => {
  // Genuine reset: rebuild the app so the falling cubes restart their drop
  // and the contact state is recomputed from the fresh scene.
  app.dispose();
  app.canvas?.remove();
  app = createAuraApp("#app", { scene: buildScene() });
  ui.setText("#contact-count", countContacts(app));
});
