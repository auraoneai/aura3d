import { createAuraApp, definePromptPlan, promptPlanToScene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const plan = definePromptPlan({
  sceneType: "product-viewer",
  subject: { asset: assets.product, label: "studio product" },
  style: "premium studio product inspection",
  environment: "charcoal sweep, graphite table, reflection cards",
  camera: { preset: "product-orbit" },
  lighting: { preset: "studio-softbox" },
  effects: ["bloom"],
  interaction: "orbit",
  acceptanceCriteria: [
    "product is centered and recognizable",
    "softbox and rim lighting shape the asset",
    "table and reflection cues create a studio product surface"
  ]
} as const);

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: promptPlanToScene(plan)
});
