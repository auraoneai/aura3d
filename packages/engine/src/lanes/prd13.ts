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
 * T1.8/T1.10: prompt-plan v2 mapping tables + `compilePromptPlanV2`.
 * T1.11: `structuralQA` namespace + deprecated keys on visualQA results.
 * T1.13: `provide()` for C-34 — registers the C-31 `"look"` diagnostics
 *   section and the C-36 `"look"` NodeHandler. Runs once at barrel load.
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

export {
  compilePromptPlanV2,
  promptPlanToSceneV2,
  AuraPromptPlanError
} from "../agent-api/nodes/prompt/promptPlanV2.js";
export type {
  AuraCompilePromptPlanOptions,
  AuraCompiledPromptPlanV2,
  AuraPromptPlanErrorCode,
  AuraPromptPlanReportV2,
  AuraPromptPlanV2
} from "../agent-api/nodes/prompt/promptPlanV2.js";

export { structuralQA } from "../agent-api/looks/structuralQA.js";
export type {
  AuraDeprecatedVisualQA,
  AuraStructuralQAResult
} from "../agent-api/looks/structuralQA.js";

export { lookNodeHandler } from "../agent-api/looks/lookNodeHandler.js";
export { lookDiagnosticsSection } from "../agent-api/looks/lookDiagnostics.js";

// ---------------------------------------------------------------------------
// T1.13 — provide() for C-34 (CONTRACTS §13.1): the C-31 `"look"` diagnostics
// section and the C-36 `"look"` NodeHandler are registered once, from this
// lane barrel. Guarded so a double import never throws REGISTRY_DUPLICATE /
// NODE_HANDLER_DUPLICATE on an already-provided surface.
// ---------------------------------------------------------------------------
import { registerDiagnosticsSection, diagnosticsSectionsAll } from "../contracts/diagnostics.js";
import { registerNodeHandler, nodeHandlerFor } from "../contracts/compiler.js";
import { lookDiagnosticsSection as prd13LookDiagnosticsSection } from "../agent-api/looks/lookDiagnostics.js";
import { lookNodeHandler as prd13LookNodeHandler } from "../agent-api/looks/lookNodeHandler.js";

let prd13Provided = false;
export function providePrd13Contracts(): void {
  if (prd13Provided) return;
  prd13Provided = true;
  if (!diagnosticsSectionsAll().some((section) => section.key === "look")) {
    registerDiagnosticsSection(prd13LookDiagnosticsSection);
  }
  if (nodeHandlerFor("look") === undefined) {
    registerNodeHandler(prd13LookNodeHandler);
  }
}
providePrd13Contracts();
