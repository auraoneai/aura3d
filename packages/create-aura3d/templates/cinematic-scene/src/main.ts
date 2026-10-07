import { compilePromptPlanV2, createAuraApp, definePromptPlan } from "@aura3d/engine";
import { assets } from "./aura-assets";

// PRD-13 T3.8: a plan whose every field resolves through the v2 mapping
// tables. `compilePromptPlanV2(plan, { unsupported: "reject" })` throws
// AuraPromptPlanError on any field the engine cannot apply — a successful
// compile proves the report's `rejected` list is empty and `visualSystems` is
// a census of the compiled snapshot, never an echo of the plan text.
const plan = definePromptPlan({
  sceneType: "cinematic-scene",
  subject: { asset: assets.hero, label: "rain hero asset" },
  style: "rainy neon alley hero shot with vibrant neon contrast",
  environment: "rainy neon alley at night",
  camera: { preset: "cinematic-dolly" },
  lighting: { preset: "neon-practicals" },
  // Flag-off census applies fog (look-fog) and bloom (look post pipeline);
  // pixel-backed emitters and C-21/C-13 contracts are intentionally absent.
  effects: ["fog", "bloom"],
  interaction: "orbit",
  acceptanceCriteria: [
    "hero asset is framed in a neon alley",
    "fog and bloom come from the look's pipeline, not symbolic decoration",
    "camera uses a slow dolly toward the subject"
  ],
  negativeCriteria: [
    "reject a lone model with rain-line decoration",
    "reject flat grids without alley depth or wet cues"
  ]
} as const);

const compiled = compilePromptPlanV2(plan, { unsupported: "reject" });
const report = compiled.report;

const evidenceMode = navigator.webdriver;
const app = createAuraApp("#app", {
  autoStart: !evidenceMode,
  scene: compiled.scene
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

(window as unknown as { __AURA3D_CINEMATIC_SCENE__?: unknown }).__AURA3D_CINEMATIC_SCENE__ = {
  schema: report.schema,
  look: report.look,
  camera: report.camera,
  lightingPreset: report.lightingPreset,
  appliedEffects: report.appliedEffects,
  rejected: report.rejected,
  visualSystems: report.visualSystems,
  styleGrade: report.styleGrade,
  warnings: report.warnings,
  repairHints: report.repairHints
};
