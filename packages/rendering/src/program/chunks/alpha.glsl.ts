/**
 * `alpha` chunk — alpha-mode handling (C-02 `alphaMode`).
 * `mask` discards below `u_alphaCutoff` (ALPHA_MASK); `blend` just emits alpha
 * (the queue/blend state is render-side). Default for `fragment:alpha`.
 */

export const ALPHA_CHUNK_GLSL = /* glsl */ `
uniform float u_alphaCutoff;
float a3dApplyAlpha(float alpha) {
#ifdef ALPHA_MASK
  if (alpha < u_alphaCutoff) discard;
#endif
  return alpha;
}
`;
