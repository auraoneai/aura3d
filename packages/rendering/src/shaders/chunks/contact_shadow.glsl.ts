/**
 * a3d_prd02_contact_shadow — screen-space contact shadow march
 * (PRD-02 §6.5/§8.6). Marches up to 16 steps along the primary shadowed
 * light's world-space direction over `length` against the scene depth buffer,
 * with a `thickness` test and interleaved-gradient noise jitter. Returns a soft
 * [0,1] visibility applied inside that light's V_l only — never to total colour.
 * The pass reports contactShadows.passExecuted through C-31 diagnostics.
 *
 * World space (not view space): the production renderer hands the frame hooks a
 * camera that carries only the combined view-projection matrix, so the march
 * unprojects with its inverse and measures depth as the clip-space w (the
 * view-space distance for a perspective camera) of the combined matrix. That
 * needs no separate view/projection matrices and no near/far for perspective.
 */
export const CONTACT_SHADOW_CHUNK_ID = "a3d_prd02_contact_shadow";

export const CONTACT_SHADOW_CHUNK_GLSL = /* glsl */ `
uniform highp sampler2D u_prd02ContactDepth;     // scene depth buffer ([0,1])
uniform mat4 u_prd02ContactInvViewProj;          // clip -> world
uniform mat4 u_prd02ContactViewProj;             // world -> clip
uniform vec3 u_prd02ContactSun;                  // shadowed-light direction TOWARD the light, world space
uniform vec4 u_prd02ContactParams;               // (length_m, thickness_m, steps, jitter)
uniform vec3 u_prd02ContactNearFar;              // (near, far, orthographic 0|1); only the orthographic flag is read

float a3d_prd02ContactNoise(vec2 px) {
  return fract(52.9829189 * fract(0.06711056 * px.x + 0.00583715 * px.y));
}

vec3 a3d_prd02ContactWorld(vec2 uv, float z) {
  vec4 w = u_prd02ContactInvViewProj * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  return w.xyz / w.w;
}

// How far the march point sits behind the visible surface at the same screen position, in world units along the view
// direction. Perspective: the clip-space w difference (view-space distance). Orthographic: the projection is linear, but the
// near/far the frame camera reports are not guaranteed to be the ones the projection matrix was built with (the first GPU
// run of an orthographic scene gave a mask of all ones for that reason), so the gap is measured in world space along the
// view direction recovered from the inverse view-projection instead.
float a3d_prd02ContactBehind(vec4 clip, vec3 p, vec3 blockerPos, vec2 suv) {
  if (u_prd02ContactNearFar.z > 0.5) {
    vec3 viewDir = normalize(a3d_prd02ContactWorld(suv, 1.0) - a3d_prd02ContactWorld(suv, 0.0));
    return dot(p - blockerPos, viewDir);
  }
  return clip.w - (u_prd02ContactViewProj * vec4(blockerPos, 1.0)).w;
}

float a3d_contactShadow(vec2 uv) {
  float sceneZ = texture(u_prd02ContactDepth, uv).r;
  vec3 pos = a3d_prd02ContactWorld(uv, sceneZ);
  float len = u_prd02ContactParams.x;
  float thickness = u_prd02ContactParams.y;
  float steps = max(u_prd02ContactParams.z, 1.0);
  float jitter = a3d_prd02ContactNoise(gl_FragCoord.xy) * u_prd02ContactParams.w;
  float occluded = 0.0;
  for (int i = 1; i <= 16; i++) {
    if (float(i) > steps) break;
    float t = (float(i) - jitter) / steps;
    vec3 p = pos + u_prd02ContactSun * (t * len);
    vec4 clip = u_prd02ContactViewProj * vec4(p, 1.0);
    if (clip.w <= 0.0) continue;
    vec3 r = clip.xyz / clip.w;
    vec2 suv = r.xy * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float blockerZ = texture(u_prd02ContactDepth, suv).r;
    vec3 blockerPos = a3d_prd02ContactWorld(suv, blockerZ);
    // The ray point must sit behind the visible surface by more than the thickness parameter (self-shadow bias) and by less than
    // twice the march length. The upper bound stops a foreground prop between the camera and the receiver from
    // "occluding" every ray whose screen position lands behind it (ghost shadows), while still letting a solid
    // caster shade rays that dive up to one march length into its volume.
    float behind = a3d_prd02ContactBehind(clip, p, blockerPos, suv);
    if (behind > thickness && behind < len * 2.0) occluded = max(occluded, 1.0 - t);
  }
  return 1.0 - occluded;
}
`;
