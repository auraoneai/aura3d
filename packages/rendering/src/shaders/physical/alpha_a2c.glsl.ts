/**
 * Aura implementation of the alpha a2c material operation.
 * Its WGSL companion is tracked separately in physical-wgsl/.
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/alpha_a2c.wgsl.js";

const glsl = /* glsl */ `
// The pipeline enables multisample alpha-to-coverage when requested.
void a3dPrd04AlphaTest(float alpha, float cutoff) {
  if (alpha < cutoff) discard;
}
void a3dPrd04AlphaToCoverage(inout float alpha, float cutoff) {
  float width = max(fwidth(alpha), 1e-6);
  alpha = clamp((alpha - cutoff) / width + 0.5, 0.0, 1.0);
  if (alpha <= 0.0) discard;
}
`;

export const A3D_PRD04_ALPHA_A2C: ShaderChunk = {
  name: "a3d_prd04_alpha_a2c", owner: "prd04", glsl, wgsl: WGSL,
  stage: "fragment", requires: []
};
