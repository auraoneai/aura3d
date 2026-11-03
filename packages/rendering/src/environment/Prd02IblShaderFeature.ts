import { PRD02_IBL_FEATURE } from "../contracts/environment";
import { registerShaderChunk, type ShaderChunk, type ShaderFeature } from "../contracts/program";
import { stockChunkVerifier, stockFeatureVerifier } from "../program/FeatureSelect";
import { LIGHTING_IBL_CALL_GLSL, LIGHTING_IBL_CHUNK_GLSL } from "../shaders/chunks/lighting_ibl.glsl";

const iblParsChunk: ShaderChunk = {
  name: "a3d_prd02_lighting_ibl",
  owner: "prd02",
  stage: "fragment",
  glsl: LIGHTING_IBL_CHUNK_GLSL
};
const iblCallChunk: ShaderChunk = {
  name: "a3d_prd02_lighting_ibl_call",
  owner: "prd02",
  stage: "fragment",
  glsl: LIGHTING_IBL_CALL_GLSL
};

/** Capture the exact stock chunk implementations before registry exposure. */
export const isStockPrd02IblBloomChunk = stockChunkVerifier([iblParsChunk, iblCallChunk]);

/** Called by the ordinary lane registration, in its original registration order. */
export function registerPrd02IblChunks(): void {
  registerShaderChunk(iblParsChunk);
  registerShaderChunk(iblCallChunk);
}

/**
 * Stock C-02 IBL producer, kept separate from the side-effectful lane barrel
 * so optional renderer checks can authenticate it without registering lanes.
 */
export const PRD02_IBL_SHADER_FEATURE: ShaderFeature = {
  id: PRD02_IBL_FEATURE,
  owner: "prd02",
  flag: "A3D_QR_LIGHTING",
  hooks: ["fragment:pars", "fragment:indirect"],
  chunks: ["a3d_prd02_lighting_ibl", "a3d_prd02_lighting_ibl_call"],
  select(input) {
    return input.pass === "forward" && input.flags.on("A3D_QR_COMPILER") && input.flags.on("A3D_QR_LIGHTING")
      ? true
      : undefined;
  },
  defines(value): Readonly<Record<string, string | number | true>> {
    return value === true ? { A3D_PRD02_IBL: true } : {};
  }
};

export const isStockPrd02IblBloomFeature = stockFeatureVerifier([PRD02_IBL_SHADER_FEATURE]);
