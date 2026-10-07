/**
 * a3d_prd02_lighting_punctual — punctual light evaluation (PRD-02 §6.3/§8).
 * Units are physical: point/spot intensities are candela, directional is
 * lux (dimensionless in shader), decay exponent applies 1/d^decay with the
 * Frostbite window saturate(1−(d/range)⁴)² when range > 0.
 *
 * Light data lives in the `AuraLights` std140 block (u_lightData, 32×6
 * vec4 — 3KB). Per-light layout:
 *   [0] position.xyz,     w = kind (0 dir, 1 point, 2 spot, 3 rect)
 *   [1] direction.xyz,    w = range (0 = infinite)
 *   [2] color.rgb,        w = intensity
 *   [3] spot: cosOuter, cosInner, decay, shadowIndex
 *   [4] shadow matrix column a (rect: right.xyz, width)
 *   [5] shadow matrix column b (rect: up.xyz, height)
 */
export const LIGHTING_PUNCTUAL_CHUNK_GLSL = /* glsl */ `
#ifndef A3D_MAX_LIGHTS
#define A3D_MAX_LIGHTS 32
#endif
uniform int u_prd02LightCount;

// Frostbite range window — only applies when range > 0.
float a3d_rangeWindow(float d, float range) {
  if (range <= 0.0) return 1.0;
  float x = clamp(1.0 - pow(d / range, 4.0), 0.0, 1.0);
  return x * x;
}

// Physically-based attenuation: window / d^decay.
float a3d_attenuation(float d, float range, float decay) {
  float att = 1.0 / pow(max(d, 1e-4), decay);
  return att * a3d_rangeWindow(d, range);
}

// Spot cone: smooth falloff between cosOuter and cosInner angles.
float a3d_spotWindow(float cosLightDir, float cosOuter, float cosInner) {
  float w = clamp((cosLightDir - cosOuter) / max(cosInner - cosOuter, 1e-4), 0.0, 1.0);
  return w * w;
}

// Fetch helper — per-light record base index.
int a3d_lightBase(int i) { return i * 6; }

// Incident radiance contribution of punctual light i at worldPos with
// surface normal n. Shadow factor is applied by the caller.
vec3 a3d_punctualRadiance(int i, vec3 worldPos, vec3 n, out vec3 l, out float atten) {
  vec4 d0 = u_lightData[a3d_lightBase(i) + 0];
  vec4 d1 = u_lightData[a3d_lightBase(i) + 1];
  vec4 d2 = u_lightData[a3d_lightBase(i) + 2];
  int kind = int(d0.w + 0.5);
  vec3 lightColor = d2.rgb * d2.w;
  if (kind == 0) {
    l = -normalize(d1.xyz);
    atten = 1.0;
    return lightColor * max(dot(n, l), 0.0);
  }
  vec3 toLight = d0.xyz - worldPos;
  float d = length(toLight);
  l = toLight / max(d, 1e-4);
  vec4 d3 = u_lightData[a3d_lightBase(i) + 3];
  atten = a3d_attenuation(d, d1.w, d3.z);
  if (kind == 2) {
    float c = dot(-l, normalize(d1.xyz));
    atten *= a3d_spotWindow(c, d3.x, d3.y);
  }
  return lightColor * max(dot(n, l), 0.0) * atten;
}
`;
