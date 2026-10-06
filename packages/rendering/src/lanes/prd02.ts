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

export * from "../environment/SphericalHarmonics.js";
export * from "../environment/RoomEnvironmentScene.js";
export * from "../environment/HdrEquirect.js";
export * from "../environment/Rgb9e5Cube.js";
export * from "../environment/LightingSamplerBudget.js";
export * from "../environment/workers/cpuPrefilter.js";
export {
  SH9_CHUNK_GLSL,
  LIGHTING_IBL_CHUNK_GLSL,
  LIGHTING_PUNCTUAL_CHUNK_GLSL,
  SHADOW_RECEIVE_CHUNK_GLSL,
  SHADOW_CASTER_CHUNK_GLSL,
  CONTACT_SHADOW_CHUNK_GLSL,
  PRD02_CHUNKS
};
