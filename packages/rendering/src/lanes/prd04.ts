/**
 * Lane prd04 barrel — owned by lane 04 (CONTRACTS.md §3.8). `provide()` calls
 * and `register*` registrations for that lane's real implementations live
 * here.
 *
 * PR A (P1-1): registers the fifteen `a3d_prd04_*` shader chunks. This runs
 * at import time (the package index re-exports `lanes/index.js`); chunk
 * registration is registry state only — `A3D_QR_MATERIALS` and friends decide
 * whether any chunk is ever selected into a program.
 */
import { registerPrd04ShaderChunks } from "../shaders/physical/index.js";
import { registerPrd04MaterialLobes } from "../materials/lobes.js";
import { registerPrd04ShaderFeatures } from "../materials/features.js";
import { registerPrd04TransmissionContributor } from "../forward/Transmission.js";

registerPrd04ShaderChunks();
registerPrd04MaterialLobes();
registerPrd04ShaderFeatures();
registerPrd04TransmissionContributor();

export { registerPrd04ShaderChunks };
export { registerPrd04MaterialLobes } from "../materials/lobes.js";
export { registerPrd04ShaderFeatures, uvTransformMatrix } from "../materials/features.js";
export {
  PhysicalMaterial,
  type PhysicalMaterialDescriptor,
  type PhysicalMapBinding,
  type PhysicalMapSlot,
  type PhysicalFeatureSet
} from "../materials/PhysicalMaterial.js";
export { physicalFeatureSet, physicalMaterialLobeInput, legacyPhysicalDescriptor } from "../materials/PhysicalFeatures.js";
export {
  generateProceduralMaterialTexture,
  type ProceduralMaterialTexture,
  type ProceduralMaterialKind,
  type ProceduralMaterialParams
} from "../ProceduralMaterialTextures.js";
export { TransmissionRenderTarget } from "../TransmissionRenderTarget.js";
export {
  transmissionFrameContributor,
  registerPrd04TransmissionContributor,
  prd04TransmissionDiagnostics,
  TRANSMISSION_BLACKBOARD_KEY,
  TRANSMISSION_LANE_RESOURCE,
  itemReportsTransmissionLobe,
  type Prd04TransmissionDiagnostics
} from "../forward/Transmission.js";
export {
  applyTextureBudget,
  resetTextureBudgetLedger,
  textureBudgetReport,
  DEFAULT_TEXTURE_BUDGET_POLICY,
  type TextureBudgetPolicy
} from "../textures/TextureBudget.js";
// P4-1: frame-graph flag seam — lane-15 wires `setRendererQrFlags` inside
// createAuraApp eventually (qr-request); harnesses set it directly until then.
export { setRendererQrFlags, rendererQrFlags } from "../renderer/FrameGraph.js";
