/**
 * `depth` chunk (PRD-01 §8.7) — depth/distance pass fragment bodies.
 * `pass:"depth"` writes hardware depth (alpha-masked when ALPHA_MASK);
 * `pass:"distance"` (three's distanceRGBA convention) writes the radial
 * distance from `u_distanceLight`, packed for RGBA8 shadow storage.
 */

export const DEPTH_CHUNK_GLSL = /* glsl */ `
#if defined(USE_BASE_COLOR_MAP) && defined(ALPHA_MASK)
uniform sampler2D u_baseColorMap;  // u_alphaCutoff comes from the alpha chunk
#endif
`;

export const DISTANCE_CHUNK_PARS_GLSL = /* glsl */ `
uniform vec4 u_distanceLight;   // xyz light position, w far
float a3dPackDistance(float dist, float far) {
  return clamp(dist / max(far, 0.0001), 0.0, 1.0);
}
`;
