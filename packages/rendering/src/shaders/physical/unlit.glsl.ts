/**
 * Aura implementation of the unlit material operation.
 * Its WGSL companion is tracked separately in physical-wgsl/.
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/unlit.wgsl.js";

const glsl = /* glsl */ `
// KHR_materials_unlit returns the authored base color and opacity.
vec4 a3dPrd04UnlitColor(vec4 baseColor) { return baseColor; }
`;

export const A3D_PRD04_UNLIT: ShaderChunk = {
  name: "a3d_prd04_unlit", owner: "prd04", glsl, wgsl: WGSL,
  stage: "fragment", requires: []
};
