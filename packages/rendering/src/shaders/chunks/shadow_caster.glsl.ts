/**
 * a3d_prd02_shadow_caster — depth-material path for shadow casters
 * (PRD-02 §8). Vertex-stage: forwards world position and handles the
 * alpha-test/alpha-hash coverage for the depth write. Variant selection
 * (skinning lanes, morph targets, instanced, batched, alphaTest/alphaHash,
 * doubleSided) is resolved CPU-side by ShadowCasterVariantKey — this chunk
 * is the fragment-visible half.
 */
export const SHADOW_CASTER_CHUNK_GLSL = /* glsl */ `
uniform sampler2D u_prd02BaseColorAlpha;   // alphaTest/alphaHash variants only
uniform float u_prd02AlphaCutoff;
uniform vec4 u_prd02CasterParams;          // x: alphaTest on, y: alphaHash on, z: doubleSided, w: shadowFar
in vec2 v_prd02ShadowUv;

// Analytic hash for alpha-hash coverage (deterministic per texel).
float a3d_shadowHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Returns false when the texel must not write depth.
bool a3d_casterCovers() {
  if (u_prd02CasterParams.x > 0.5) {
    return texture(u_prd02BaseColorAlpha, v_prd02ShadowUv).a >= u_prd02AlphaCutoff;
  }
  if (u_prd02CasterParams.y > 0.5) {
    float a = texture(u_prd02BaseColorAlpha, v_prd02ShadowUv).a;
    return a >= a3d_shadowHash(gl_FragCoord.xy);
  }
  return true;
}
`;
