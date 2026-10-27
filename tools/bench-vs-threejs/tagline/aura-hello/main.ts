import { createAuraApp, looks, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(looks.preset("product-studio")).add(model(assets.product)),
  ...looks.appOptions("product-studio")
});
