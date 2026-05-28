import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  diagnostics: { overlay: true },
  scene: scene().add(model(assets.robot)).add(lights.studio())
});
