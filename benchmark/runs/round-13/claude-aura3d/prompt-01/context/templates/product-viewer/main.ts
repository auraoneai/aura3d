import { createAuraApp, definePromptPlan, promptPlanToScene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const plan = definePromptPlan({
  sceneType: "product-viewer",
  subject: { asset: assets.product, label: "studio product" },
  style: "premium studio product inspection with visible fit and turntable cues",
  environment: "studio sweep, round plinth, contact shadow, softboxes, reflection cards",
  camera: { preset: "product-orbit" },
  lighting: { preset: "studio-softbox" },
  effects: ["bloom"],
  interaction: "orbit",
  acceptanceCriteria: [
    "product is centered, normalized, and seated on the plinth",
    "softboxes, reflection cards, and contact shadow shape the asset",
    "turntable and orbit cues are visible without reading diagnostics"
  ],
  negativeCriteria: [
    "Do not use string asset ids or invented product URLs",
    "Do not ship a lone GLB without plinth, contact, fit, and rotation evidence"
  ]
} as const);

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: promptPlanToScene(plan)
});
