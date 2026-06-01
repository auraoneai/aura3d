import { createAuraApp, definePromptPlan, promptPlanToScene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const plan = definePromptPlan({
  sceneType: "cinematic-scene",
  subject: { asset: assets.hero, label: "rain hero asset" },
  style: "rainy neon alley hero shot",
  environment: "wet asphalt, alley walls, cyan and amber practical lights",
  camera: { preset: "cinematic-dolly" },
  lighting: { preset: "neon-practicals" },
  effects: ["rain", "fog", "bloom", "wet-reflection"],
  interaction: "orbit",
  acceptanceCriteria: [
    "hero asset is framed in a rainy alley",
    "rain, fog, neon practicals, and wet reflections are visible",
    "camera uses a slow dolly toward the subject"
  ],
  negativeCriteria: [
    "do not accept a single model with only rain-line decoration",
    "do not accept a flat grid without alley depth or wet surface cues"
  ]
} as const);

createAuraApp("#app", {
  diagnostics: { overlay: true, assetPanel: true, performancePanel: true },
  scene: promptPlanToScene(plan)
});
