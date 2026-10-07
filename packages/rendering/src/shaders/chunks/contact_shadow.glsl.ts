/**
 * a3d_prd02_contact_shadow — screen-space contact shadow march
 * (PRD-02 §6.7). Marches depth along the light direction in view space;
 * returns a soft [0,1] visibility for the sun + up to 2 spot lights
 * (Ultra/High tiers only — the C-10 diagnostics report
 * contactShadows.passExecuted).
 */
export const CONTACT_SHADOW_CHUNK_GLSL = /* glsl */ `
uniform highp sampler2D u_prd02ContactDepth;     // view-space depth buffer
uniform mat4 u_prd02ContactViewProj;
uniform mat4 u_prd02ContactInvProj;
uniform vec3 u_prd02ContactLightDir[3];          // view-space, normalized; w-count in u_prd02ContactLightCount
uniform int u_prd02ContactLightCount;
uniform vec2 u_prd02ContactResolution;
uniform float u_prd02ContactMaxDistance;         // view units, default ~1.5

const int A3D_CONTACT_STEPS = 8;

float a3d_contactShadowOne(vec3 viewPos, vec3 lightDirView) {
  float stepLen = u_prd02ContactMaxDistance / float(A3D_CONTACT_STEPS);
  vec3 p = viewPos + lightDirView * stepLen;
  float visibility = 1.0;
  for (int i = 0; i < A3D_CONTACT_STEPS; i += 1) {
    vec4 clip = u_prd02ContactViewProj * vec4(p, 1.0);
    if (clip.w <= 0.0) break;
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float sceneDepth = texture(u_prd02ContactDepth, uv).r;
    float rayDepth = clip.z / clip.w;
    // Occluder in front of the ray point → shadow term for this step.
    if (sceneDepth < rayDepth - 0.002) {
      float thickness = rayDepth - sceneDepth;
      visibility = min(visibility, clamp(thickness * 8.0, 0.0, 1.0));
      if (visibility <= 0.0) break;
    }
    p += lightDirView * stepLen;
  }
  return visibility;
}

float a3d_contactShadow(vec3 viewPos) {
  float v = 1.0;
  for (int i = 0; i < 3; i += 1) {
    if (i >= u_prd02ContactLightCount) break;
    v = min(v, a3d_contactShadowOne(viewPos, u_prd02ContactLightDir[i]));
  }
  return v;
}
`;
