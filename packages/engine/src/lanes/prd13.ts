/**
 * Lane prd13 barrel — owned by lane 13 (CONTRACTS.md §3.8). `provide()` calls
 * for that lane's real implementations live here; none exist yet (looks expand
 * through consumers once the slots land).
 *
 * T1.1: v0 look preset data (`agent-api/looks/lookPresets.ts`). Pure frozen
 * data — no behaviour is gated here; `A3D_QR_LOOKS` gates consumers in
 * T1.6 (generatedCodeWarnings) and T1.13 (the C-36 NodeHandler).
 * T1.2/T1.3: the `looks` authoring surface (looks.ts) + override clamps.
 * T1.4/T1.5: lookLint default rules + the fake-effect name list.
 * T1.8: prompt-plan v2 mapping tables (nodes/prompt/promptPlanMappings.ts).
 */
export { lookPresets, lookPresetIds } from "../agent-api/looks/lookPresets.js";
export type { AuraLookPreset, AuraLookV0Expansion } from "../agent-api/looks/lookPresets.js";

export {
  looks,
  clampLookOverrides,
  resolveLookExpansion,
  stubLookContractRequirements
} from "../agent-api/looks/looks.js";
export type {
  AuraLookBuildOptions,
  LooksApi,
  ResolvedLookExpansion
} from "../agent-api/looks/looks.js";

export {
  installLookLintDefaults,
  authoredLookIds
} from "../agent-api/looks/lookLint.js";
export {
  lookLint,
  registerLookLintRule,
  registerLookLintDefaults,
  setLookLintDefaultsProvider,
  lookLintRegisteredCodes
} from "../contracts/looks.js";
export { isFakeEffectName } from "../agent-api/looks/fakeEffectNames.js";
export { FAKE_EFFECT_NAMES, FAKE_EFFECT_STEMS, FAKE_EFFECT_PATTERN } from "../agent-api/looks/fakeEffectNames.js";
export { collectGeneratedCodeWarnings } from "../agent-api/looks/generatedCodeWarnings.js";
export type { GeneratedCodeWarningsContext } from "../agent-api/looks/generatedCodeWarnings.js";

export {
  PROMPT_PLAN_CAMERA_TO_RIG,
  PROMPT_PLAN_EFFECT_MAP,
  PROMPT_PLAN_ENVIRONMENT_KEYWORDS,
  PROMPT_PLAN_LIGHTING_TO_LOOK,
  PROMPT_PLAN_SCENE_DEFAULT_LOOK,
  PROMPT_PLAN_STYLE_TO_GRADE
} from "../agent-api/nodes/prompt/promptPlanMappings.js";
export type {
  PromptPlanCameraMapping,
  PromptPlanEffectKind,
  PromptPlanEffectMapping,
  PromptPlanEnvironmentKeywordRow,
  PromptPlanLightingMapping,
  PromptPlanStyleGrade,
  PromptPlanStyleRow
} from "../agent-api/nodes/prompt/promptPlanMappings.js";
