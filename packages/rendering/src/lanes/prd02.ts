/**
 * Lane prd02 barrel — owned by lane 02 (CONTRACTS.md §3.8). Registers the
 * lane's C-02 shader chunks at import so program assembly finds them
 * regardless of flag state (chunks are dead code until a feature selects
 * them), and re-exports the PR-B math modules.
 */
import { registerShaderChunk } from "../contracts/program.js";
import { SH9_CHUNK, environmentProbeFactorySlot } from "../contracts/environment.js";
import { SHADOW_LOOKUP_CHUNK } from "../contracts/shadows.js";
import { createEnvironmentProbeFactory } from "../environment/EnvironmentProbeFactory.js";
import { SH9_CHUNK_GLSL } from "../shaders/chunks/sh9.glsl.js";
import { LIGHTING_IBL_CHUNK_GLSL } from "../shaders/chunks/lighting_ibl.glsl.js";
import { LIGHTING_PUNCTUAL_CHUNK_GLSL } from "../shaders/chunks/lighting_punctual.glsl.js";
import { SHADOW_RECEIVE_CHUNK_GLSL } from "../shaders/chunks/shadow_receive.glsl.js";
import { SHADOW_CASTER_CHUNK_GLSL } from "../shaders/chunks/shadow_caster.glsl.js";
import { CONTACT_SHADOW_CHUNK_GLSL } from "../shaders/chunks/contact_shadow.glsl.js";

const PRD02_CHUNKS = [
  { name: "a3d_prd02_lighting_ibl", glsl: LIGHTING_IBL_CHUNK_GLSL, stage: "fragment" as const },
  { name: "a3d_prd02_lighting_punctual", glsl: LIGHTING_PUNCTUAL_CHUNK_GLSL, stage: "fragment" as const },
  { name: SHADOW_LOOKUP_CHUNK, glsl: SHADOW_RECEIVE_CHUNK_GLSL, stage: "fragment" as const },
  { name: "a3d_prd02_shadow_caster", glsl: SHADOW_CASTER_CHUNK_GLSL, stage: "fragment" as const },
  { name: SH9_CHUNK, glsl: SH9_CHUNK_GLSL, stage: "fragment" as const },
  { name: "a3d_prd02_contact_shadow", glsl: CONTACT_SHADOW_CHUNK_GLSL, stage: "fragment" as const }
];

for (const chunk of PRD02_CHUNKS) {
  registerShaderChunk({ name: chunk.name, owner: "prd02", glsl: chunk.glsl, stage: chunk.stage });
}

// C-09 real provider: consumers resolve the factory via
// `environmentProbeFactorySlot.get(flags)(device)`.
environmentProbeFactorySlot.provide(createEnvironmentProbeFactory);

// C-11 real path: `prd02.shadows` frame contributor renders the shadow system
// in the graph's shadows phase and binds ShadowFrameUniforms. Active only
// under A3D_QR_LIGHTING via the registry's flag field.
import { registerFrameContributor } from "../contracts/frameGraph.js";
import { createPrd02ShadowsContributor } from "../shadows/Prd02ShadowsContributor.js";
import { createPrd02ContactShadowsContributor } from "../passes/Prd02ContactShadowsContributor.js";
import { createPrd02ProbesContributor } from "../probes/Prd02ProbesContributor.js";
import { ensurePrd02DepthFeatures } from "../shadows/Prd02DepthShaderLibrary.js";

registerFrameContributor(createPrd02ShadowsContributor());
registerFrameContributor(createPrd02ContactShadowsContributor());
registerFrameContributor(createPrd02ProbesContributor());
ensurePrd02DepthFeatures();

// Named re-exports (not `export *`): the root barrel merges contracts/index
// and lanes/index, and contract names like `projectCubeToSH9` /
// `evaluateSH9Irradiance` would collide. The corrected lane implementation is
// aliased `projectCubeToSH9Corrected` pending qr-request to:prd01.
export {
  projectCubeToSH9 as projectCubeToSH9Corrected,
  // evaluateSH9Irradiance intentionally not re-exported: identical name
  // already exported from contracts/index at the root barrel.
  SH9_BANDS,
  sh9Basis,
  SH9_IRRADIANCE_BASIS_SCALE,
  foldIrradianceBasis,
  evaluateSH9Radiance,
  projectEquirectToSH9,
  convolveSH9Irradiance
} from "../environment/SphericalHarmonics.js";
export {
  type RoomBox,
  type RoomEmissivePanel,
  type RoomPointLight,
  type RoomEnvironmentSceneDescriptor,
  ROOM_ENVIRONMENT_PANEL_RADIANCES,
  createRoomEnvironmentScene,
  sampleRoomEnvironment
} from "../environment/RoomEnvironmentScene.js";
export {
  type HdrImage,
  HdrDecodeError,
  decodeHdrEquirect,
  sampleEquirect,
  equirectToCubeFaces
} from "../environment/HdrEquirect.js";
export {
  KTX2_MAGIC,
  VK_FORMAT_E5B9G9R9_UFLOAT_PACK32,
  KTX2_HEADER_BYTES,
  type Rgb9e5CubeErrorReason,
  Rgb9e5CubeError,
  type Rgb9e5Cube,
  readRgb9e5Cube,
  unpackRgb9e5,
  packRgb9e5
} from "../environment/Rgb9e5Cube.js";
export {
  FEATURE_UNITS,
  FEATURE_DEFINES,
  type SamplerBudgetResult,
  presentFeatures,
  resolveLightingSamplerBudgetReal
} from "../environment/LightingSamplerBudget.js";
export {
  PREFILTER_MIP_FLOOR,
  type PrefilterCubeSource,
  type PrefilterResult,
  mipCountForFaceSize,
  roughnessToLod,
  lodToRoughness,
  mipRoughness,
  faceUvToDir,
  sampleCube,
  type PrefilterOptions,
  prefilterCubeGGX,
  prefilterLevelGGX
} from "../environment/workers/cpuPrefilter.js";
export {
  type Prd02ProbeBuildOptions,
  type ProbeSource,
  CUBE_FACE_ORDER,
  Prd02EnvironmentProbe,
  sh9ToTexture,
  buildProbeFromFaces,
  buildProbeFromLevels,
  buildRoomFaces,
  cubeFaceViewProjection
} from "../environment/probeBuild.js";
export {
  type GPUPMREMOptions,
  GPUPMREMGenerator
} from "../environment/GPUPMREMGenerator.js";
export {
  type Prd02EnvironmentProbeFactoryOptions,
  Prd02EnvironmentProbeFactory,
  createEnvironmentProbeFactory
} from "../environment/EnvironmentProbeFactory.js";
export {
  type EnvironmentCacheKey,
  type EnvironmentProbeLoader,
  type BakedEnvironmentManifest,
  EnvironmentCache,
  environmentCacheLimit,
  defaultProbeLoader
} from "../environment/EnvironmentCache.js";
export {
  type A3DEnvironmentUniformInput,
  type A3DEnvironmentUniforms,
  packEnvSH,
  packA3DEnvironmentUniforms
} from "../environment/EnvUniforms.js";
export { createPrd02EnvironmentBackgroundShaderLibrary } from "../environment/Prd02BackgroundShaderLibrary.js";
export { resolvePrd02EnvironmentBackground } from "../renderer/Background.js";
export {
  type ShadowSystemConfigInput,
  type ShadowSystemSun,
  type ShadowSystemLocalLight,
  type ShadowSystemFrame,
  type Prd02ShadowFrameUniforms,
  Prd02ShadowSystem,
  createShadowSystem
} from "../shadows/ShadowSystem.js";
export {
  type CascadeFitterCamera,
  type DirectionalCascadeFit,
  type DirectionalCascadeFitOptions,
  fitDirectionalCascades
} from "../shadows/DirectionalCascadeFitter.js";
export {
  type AtlasLightRequest,
  type AtlasTile,
  type PlannedShadowAtlas,
  planLocalShadowAtlas,
  pointShadowFaceMatrix,
  spotShadowMatrix
} from "../shadows/ShadowAtlas.js";
export {
  PRD02_DEPTH_SHADER_NAME,
  PRD02_DEPTH_MAX_INSTANCES,
  registerPrd02DepthShader,
  ensurePrd02DepthFeatures,
  prd02DepthFeatures,
  casterAlphaCutoff,
  resolvePrd02ShadowCasterVariant,
  prd02DepthVariantDefines,
  prd02DepthProgram,
  precompilePrd02DepthVariants
} from "../shadows/Prd02DepthShaderLibrary.js";
export {
  shadowBindingMaterial,
  bindShadowFrameUniforms
} from "../shadows/ShadowFrameBinding.js";
export {
  createPrd02ShadowsContributor,
  shadowSystemConfigFromSource,
  collectShadowSystemLights,
  shadowSystemForDevice,
  prd02ShadowDiagnostics,
  type Prd02ShadowDiagnostics
} from "../shadows/Prd02ShadowsContributor.js";
export {
  CONTACT_MASK_BLACKBOARD_KEY,
  ContactShadowPass,
  type ContactShadowOptions,
  type ContactShadowPassInput
} from "../passes/ContactShadowPass.js";
export {
  CONTACT_SHADOWS_SUB_FLAG,
  createPrd02ContactShadowsContributor,
  contactShadowRequest,
  prd02ContactShadowDiagnostics
} from "../passes/Prd02ContactShadowsContributor.js";
export {
  CONTACT_SHADOW_CHUNK_ID
} from "../shaders/chunks/contact_shadow.glsl.js";
export {
  ReflectionProbeSystem,
  boxWeight,
  type ReflectionProbeSpec,
  type ProbeSelection,
  type ProbeAssignment,
  type ReflectionFaceRenderer
} from "../probes/ReflectionProbeSystem.js";
export {
  IrradianceVolumeSystem,
  type IrradianceVolumeSpec,
  type IrradianceVolume
} from "../probes/IrradianceVolume.js";
export {
  PROBES_SUB_FLAG,
  PROBE_SELECTION_BLACKBOARD_KEY,
  IRRADIANCE_VOLUME_BLACKBOARD_KEY,
  PROBE_RENDER_FACE_KEY,
  ENV_SPECULAR_BLACKBOARD_KEY,
  ROUGHNESS_TO_LOD_BLACKBOARD_KEY,
  createPrd02ProbesContributor,
  installPrd02ProbeRenderer,
  probeNodesFromSource
} from "../probes/Prd02ProbesContributor.js";
export {
  fetchLtcLutTextures,
  gaussLegendreRectDiffuse,
  rectDiffuseReference,
  LTC_LUT_SIZE,
  LTC_LUT_BYTES,
  LTC_LUT_SOURCE_URL,
  type LtcLutTextures,
  type LtcLutLoader
} from "../probes/LtcLuts.js";
export {
  SH9_CHUNK_GLSL,
  LIGHTING_IBL_CHUNK_GLSL,
  LIGHTING_PUNCTUAL_CHUNK_GLSL,
  SHADOW_RECEIVE_CHUNK_GLSL,
  SHADOW_CASTER_CHUNK_GLSL,
  CONTACT_SHADOW_CHUNK_GLSL,
  PRD02_CHUNKS
};
