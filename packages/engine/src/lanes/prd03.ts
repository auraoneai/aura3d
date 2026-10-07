/**
 * Lane prd03 barrel — owned by lane 03 (CONTRACTS.md §3.8). Registers:
 *  - C-31 diagnostics sections `post` and `exposure` (report the executed
 *    legacy chain today; flag-gated membership, truthful values either way).
 *  - C-38 `post` extension (`app.post` → AuraPostSurface; flag-off behaves
 *    exactly like StubPostSurface).
 *  - C-36 diagnostic-only fields + option-coverage rows for post builders.
 * Loaded through `packages/engine/src/index.ts` (`export * from "./lanes/index.js"`).
 */

import { registerDiagnosticsSection } from "../contracts/diagnostics.js";
import { registerAppExtension } from "../contracts/app.js";
import { DIAGNOSTIC_ONLY_FIELDS, registerOptionCoverage } from "../contracts/compiler.js";
import { PRD03_DIAGNOSTIC_ONLY_FIELDS, PRD03_OPTION_COVERAGE } from "../agent-api/compiler/diagnosticOnly.prd03.js";
import { collectPostSection, collectExposureSection, createPrd03PostSurface } from "../agent-api/postBridge.js";

// C-31 sections — "post" reports what executes on the legacy chain;
// "exposure" reports the uniform the tone-mapping stage receives.
registerDiagnosticsSection({ id: "prd03.post", owner: "prd03", flag: "A3D_QR_POST", key: "post", collect: collectPostSection });
registerDiagnosticsSection({ id: "prd03.exposure", owner: "prd03", flag: "A3D_QR_POST", key: "exposure", collect: collectExposureSection });

// C-38 post surface — app.post / app.addPostPass / app.setQualityTier.
registerAppExtension({ id: "prd03.post", owner: "prd03", flag: "A3D_QR_POST", member: "post", create: createPrd03PostSurface });

// C-36 merge — the contract table is the published surface; the record is
// additive-only and never removes another lane's entries.
Object.assign(DIAGNOSTIC_ONLY_FIELDS as Record<string, { readonly reason: string; readonly ownerPrd: number }>, PRD03_DIAGNOSTIC_ONLY_FIELDS);
registerOptionCoverage(PRD03_OPTION_COVERAGE);

export {
  Prd03PostSurface,
  createPrd03PostSurface,
  collectPostSection,
  collectExposureSection,
  recordSubmittedPostprocess,
  latestSubmittedPostprocess,
  resetSubmittedPostprocess
} from "../agent-api/postBridge.js";
export { PRD03_DIAGNOSTIC_ONLY_FIELDS, PRD03_OPTION_COVERAGE } from "../agent-api/compiler/diagnosticOnly.prd03.js";
// Re-export the bridge entry point so lane tests (and later, the v2 compiler)
// reach it through the engine root rather than a deep subpath.
export { createProductionRuntimePostprocess } from "../agent-api/compiler/postprocess.js";
