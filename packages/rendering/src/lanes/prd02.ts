/**
 * Lane prd02 barrel — owned by lane 02 (CONTRACTS.md §3.8). Registers the
 * lane's C-02 shader chunks at import so program assembly finds them
 * regardless of flag state (chunks are dead code until a feature selects
 * them), and re-exports the PR-B math modules.
 */
import { registerShaderChunk } from "../contracts/program.js";
import { SH9_CHUNK } from "../contracts/environment.js";
import { SHADOW_LOOKUP_CHUNK } from "../contracts/shadows.js";
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
  SH9_CHUNK_GLSL,
  LIGHTING_IBL_CHUNK_GLSL,
  LIGHTING_PUNCTUAL_CHUNK_GLSL,
  SHADOW_RECEIVE_CHUNK_GLSL,
  SHADOW_CASTER_CHUNK_GLSL,
  CONTACT_SHADOW_CHUNK_GLSL,
  PRD02_CHUNKS
};
