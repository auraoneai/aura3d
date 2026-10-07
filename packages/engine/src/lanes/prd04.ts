/**
 * Lane prd04 barrel — owned by lane 04 (CONTRACTS.md §3.8). `provide()` calls
 * for that lane's real implementations live here.
 *
 * P2-4: importing the engine package registers the C-15 real material handle — the §3.6
 * actor-extension records actors by node id (always-on bookkeeping) and the C-37 `materials`
 * `NodeHandleExtension` resolves `handle.materials` for model nodes. Both are inert while
 * `A3D_QR_MATERIALS` is off (stub-equivalent output inside the handle).
 *
 * P2-5: registers the C-31 `materials` diagnostics section (AuraMaterialDiagnostics;
 * unmeasurable fields report 0 + `material-program-pending`).
 */
import { registerPrd04TypedGLBActorMaterials } from "../production-runtime/actor/TypedGLBActorMaterials.js";
import { registerPrd04MaterialDiagnostics } from "../production-runtime/actor/materialDiagnostics.js";
import { registerPrd04OptionCoverage } from "../agent-api/compiler/diagnosticOnly.prd04.js";

registerPrd04TypedGLBActorMaterials();
registerPrd04MaterialDiagnostics();
registerPrd04OptionCoverage();

export { registerPrd04TypedGLBActorMaterials } from "../production-runtime/actor/TypedGLBActorMaterials.js";
export { typedGLBActorForNode, registeredTypedGLBActors } from "../production-runtime/actor/TypedGLBActorMaterials.js";
export { collectPrd04MaterialDiagnostics, registerPrd04MaterialDiagnostics } from "../production-runtime/actor/materialDiagnostics.js";
export { DIAGNOSTIC_ONLY_PRD04_FIELDS, registerPrd04OptionCoverage } from "../agent-api/compiler/diagnosticOnly.prd04.js";
export {
  applyMaterialOverrides,
  lowerModelMaterialOverrides,
  snapshotMaterials,
  type AuthoredMaterialSnapshot,
  type TypedGLBActorMaterialOverride
} from "../production-runtime/ModelMaterialOverrides.js";
// P4-3: QR flag + `renderer.transmission` seams. Lane-15 wires these at
// createAuraApp eventually (qr-request); harnesses set them directly until then.
export { setTypedGLBActorQrFlags } from "../production-runtime/actor/extensions.js";
export {
  setTypedGLBActorQrTransmissionMode,
  typedGLBActorQrTransmissionMode
} from "../production-runtime/TypedGLBActor.js";
