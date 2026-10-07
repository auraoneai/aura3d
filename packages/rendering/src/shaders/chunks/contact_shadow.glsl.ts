/**
 * a3d_prd02_contact_shadow — screen-space contact shadow march
 * (PRD-02 §6.5/§8.6). Marches up to 16 steps along the primary shadowed
 * light's view-space direction over `length` against the scene depth buffer
 * (linearized to metres), with a `thickness` test and interleaved-gradient
 * noise jitter. Returns a soft [0,1] visibility applied inside that light's
 * V_l only — never to total colour. The pass reports
 * contactShadows.passExecuted through C-31 diagnostics.
 */
export const CONTACT_SHADOW_CHUNK_ID = "a3d_prd02_contact_shadow";

export const CONTACT_SHADOW_CHUNK_GLSL = /* glsl */ `
uniform highp sampler2D u_prd02ContactDepth;     // scene depth buffer ([0,1])
uniform mat4 u_prd02ContactInvProj;              // clip -> view
uniform mat4 u_prd02ContactProj;                 // view -> clip
uniform vec3 u_prd02ContactSun;                  // shadowed-light dir, view space
uniform vec4 u_prd02ContactParams;               // (length_m, thickness_m, steps, jitter)
uniform vec2 u_prd02ContactNearFar;              // (near, far)

float a3d_prd02ContactNoise(vec2 px) {
  return fract(52.9829189 * fract(0.06711056 * px.x + 0.00583715 * px.y));
}

float a3d_prd02ContactLinear(float z) {
  float n = u_prd02ContactNearFar.x;
  float f = u_prd02ContactNearFar.y;
  return (n * f) / (f - z * (f - n));
}

float a3d_contactShadow(vec2 uv) {
  float sceneZ = texture(u_prd02ContactDepth, uv).r;
  vec4 ndc = vec4(uv * 2.0 - 1.0, sceneZ * 2.0 - 1.0, 1.0);
  vec4 vpos = u_prd02ContactInvProj * ndc;
  vec3 pos = vpos.xyz / vpos.w;
  float len = u_prd02ContactParams.x;
  float thickness = u_prd02ContactParams.y;
  float steps = max(u_prd02ContactParams.z, 1.0);
  float jitter = a3d_prd02ContactNoise(gl_FragCoord.xy) * u_prd02ContactParams.w;
  float occluded = 0.0;
  for (int i = 1; i <= 16; i++) {
    if (float(i) > steps) break;
    float t = (float(i) - jitter) / steps;
    vec3 p = pos + u_prd02ContactSun * (t * len);
    vec4 clip = u_prd02ContactProj * vec4(p, 1.0);
    vec3 r = clip.xyz / clip.w;
    vec2 suv = r.xy * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float blocker = a3d_prd02ContactLinear(texture(u_prd02ContactDepth, suv).r);
    if (blocker < -p.z - thickness) occluded = max(occluded, 1.0 - t);
  }
  return 1.0 - occluded;
}
`;
