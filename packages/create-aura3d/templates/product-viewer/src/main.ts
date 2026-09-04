import {
  camera,
  createAuraApp,
  environments,
  interactions,
  material,
  model,
  primitives,
  scene
} from "@aura3d/lean/product";
import { assets } from "./aura-assets";

// PART C2 game-ready adoption: the plinth wears the @aura3d/materials
// "carPaint" preset shell (clearcoat 1 + flake normal scale) in a pearl studio
// base, and the floor carries the "glassThin" preset color/roughness values as
// a glass display deck (transmission itself lives in the full engine API).
const carPaintPlinth = material.clearcoatPaint({ color: "#d7dce2", roughness: 0.3, metallic: 0.55, clearcoat: 1 });
const glassThinDeck = material.pbr({ color: "#9fc6d4", roughness: 0.08, metallic: 0 });

const productScene = scene()
  .background("#071018")
  .add(primitives.plane({ name: "glass deck floor", material: glassThinDeck })
    .position(0, -0.05, -0.62).scale([6.2, 1, 5.2]))
  .add(primitives.box({ name: "carPaint product plinth", material: carPaintPlinth })
    .position(0, 0.06, -0.62).scale([1.82, 0.18, 1.4]))
  .add(model(assets.product, { name: "typed studio product" }).position(0, 1.08, -0.62).scale(0.66))
  .add(environments.studio())
  .add(interactions.orbit())
  .camera(camera.perspective({ position: [2.65, 2.05, 4.55], target: [0, 1.02, -0.62], fov: 32 }));

const app = createAuraApp("#app", { scene: productScene });
void app.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dRuntimeBackend = diagnostics.runtimeBackend;
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
