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
    "reject a lone model with rain-line decoration",
    "reject flat grids without alley depth or wet cues"
  ]
} as const);

const evidenceMode = navigator.webdriver;
const app = createAuraApp("#app", {
  autoStart: !evidenceMode,
  scene: promptPlanToScene(plan)
});

// Browser evidence needs one completed production frame, then a stable GPU.
// A generated app outside WebDriver keeps the normal continuous render loop.
if (evidenceMode) {
  // Keep module evaluation complete while the production renderer loads its
  // typed-GLB chunk. A top-level await here can deadlock the bundled module
  // graph because that dynamic chunk imports engine modules from this graph.
  void app.ready().then(() => app.step(0)).catch((error: unknown) => {
    document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
  });
}
