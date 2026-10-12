// PRD-07 P6-T1 — decal program (§8.8): lit projected marks. Albedo from the
// atlas page (or flat colour), tangent-space normal perturb (optional page
// normal map), page roughness; scene lights through the r185 standard BRDF +
// ambient irradiance + a3dApplyFog (§8.4 chunk,
// embedded — PRD 07 programs include it directly while the C-02 generator is
// a stub). Angle fade + distance fade are folded into alpha per §6.9.
// Blend is `alpha` for marks; `multiply` grime is emulated under the C-04
// stub as alpha-over with black at 1 − luminance (VFX_BLEND_FALLBACK).
//
// Uniform-int latent bug (C-28): scalar uniforms bind via gl.uniform1f —
// declare `float`, never `int`, on WebGL2.
// GLSL ES 3.00.

import { PRD07_FOG_CHUNK_GLSL } from "../../atmosphere/shaders/fog.glsl";

export const DECAL_SHADER_MARKER = "prd07-decal-v1";

export interface DecalProgramDefines {
  /** Page albedo texture (decal atlas page or flat texture). */
  readonly albedoTexture: boolean;
  /** Page normal map — perturbs the projected mesh normal. */
  readonly normalTexture: boolean;
  /** Multiply grime blend → C-04-stub alpha-over emulation. */
  readonly multiply: boolean;
  readonly fog: boolean;
}

const VERT = `
// ${DECAL_SHADER_MARKER} vertex
in vec3 a_position;   // world-space (projected / offset by the CPU merge)
in vec3 a_normal;
in vec2 a_uv;
in vec4 a_color;      // albedo.rgb × alpha (life curve applied on CPU)
in vec4 a_fade;       // angleStartDeg, angleEndDeg, nearFade, farFade
uniform mat4 u_viewProjection;
out vec3 v_world;
out vec3 v_normal;
out vec2 v_uv;
out vec4 v_color;
out vec4 v_fade;
void main() {
  v_world = a_position;
  v_normal = a_normal;
  v_uv = a_uv;
  v_color = a_color;
  v_fade = a_fade;
  gl_Position = u_viewProjection * vec4(a_position, 1.0);
}
`;

const FRAG = (d: DecalProgramDefines): string => `
// ${DECAL_SHADER_MARKER} fragment
precision highp float;
in vec3 v_world;
in vec3 v_normal;
in vec2 v_uv;
in vec4 v_color;
in vec4 v_fade;
uniform mat4 u_viewProjection;
${d.albedoTexture ? "uniform sampler2D u_albedo;" : ""}
${d.normalTexture ? "uniform sampler2D u_normalMap;" : ""}
// Same guard as the embedded fog chunk, so fogged variants don't redeclare.
#ifndef A3D_PRD07_FOG_ENV_UNIFORMS
#define A3D_PRD07_FOG_ENV_UNIFORMS
uniform vec3 u_cameraPosition;
uniform vec3 u_sunDirection;
uniform vec3 u_sunColor;
#endif
uniform float u_roughness;
// Scene lights (three.js MeshStandardMaterial parity, PRD-07 I3 "decal BRDF
// matches surroundings"): ≤4 punctual lights, xyz = direction TOWARD the
// light (w 0) or world position (w 1); rgb = colour × intensity, w = range.
uniform vec4 u_lightVector[4];
uniform vec4 u_lightRadiance[4];
uniform float u_lightCount;
uniform vec3 u_ambientIrradiance;  // ambient colour × intensity (× BRDF_Lambert below)
${d.fog ? PRD07_FOG_CHUNK_GLSL : ""}
layout(location = 0) out vec4 o_color;

// r185 BRDF_GGX pieces: GGX D, height-correlated Smith V, Schlick F (F0 0.04).
float a3dDecalD(float nDotH, float alpha) {
  float a2 = alpha * alpha;
  float dn = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return 0.31830989 * a2 / max(dn * dn, 1e-6);
}
float a3dDecalV(float nDotL, float nDotV, float alpha) {
  float a2 = alpha * alpha;
  float gv = nDotL * sqrt(a2 + (1.0 - a2) * nDotV * nDotV);
  float gl = nDotV * sqrt(a2 + (1.0 - a2) * nDotL * nDotL);
  return 0.5 / max(gv + gl, 1e-6);
}
vec3 a3dDecalDirect(vec3 albedo, vec3 N, vec3 V, vec3 L, vec3 radiance, float alpha) {
  float nDotL = clamp(dot(N, L), 0.0, 1.0);
  if (nDotL <= 0.0) return vec3(0.0);
  vec3 H = normalize(L + V);
  float nDotH = clamp(dot(N, H), 0.0, 1.0);
  float nDotV = clamp(dot(N, V), 1e-3, 1.0);
  float vDotH = clamp(dot(V, H), 0.0, 1.0);
  float f = 0.04 + 0.96 * pow(1.0 - vDotH, 5.0);
  float spec = f * a3dDecalV(nDotL, nDotV, alpha) * a3dDecalD(nDotH, alpha);
  return radiance * nDotL * (albedo * 0.31830989 + vec3(spec));
}

void main() {
  vec4 albedo = ${d.albedoTexture ? "texture(u_albedo, v_uv)" : "vec4(1.0)"} * v_color;

  // §6.9 fades — angle (grazing) then distance, both smoothstep windows.
  vec3 V = u_cameraPosition - v_world;
  float dist = length(V);
  V /= max(dist, 1e-4);
  vec3 N = normalize(v_normal);
  ${d.normalTexture ? `
  // Tangent-space normal map from the page — the projected quad's TBN is the
  // plane frame (u along the decal's local +X), cheap derivative TBN.
  {
    vec3 t = normalize(dFdx(v_world));
    vec3 b = normalize(dFdy(v_world));
    vec3 nTex = texture(u_normalMap, v_uv).xyz * 2.0 - 1.0;
    N = normalize(mat3(t, b, N) * nTex);
  }` : ""}
  float facing = abs(dot(N, V));
  float cosStart = cos(radians(v_fade.x));
  float cosEnd = cos(radians(v_fade.y));
  // facing=cos(incidence): 1 head-on → 0 grazing; fade runs start→end.
  // angleEnd <= angleStart disables the angle fade (surface-pinned trails).
  float angleFade = v_fade.y > v_fade.x ? smoothstep(cosEnd, cosStart, facing) : 1.0;
  float distFade = 1.0 - smoothstep(v_fade.z, v_fade.w, dist);

  // Lighting: the scene's lights through the r185 standard BRDF (Lambert/π +
  // GGX, F0 0.04) plus ambient irradiance × BRDF_Lambert — the same response
  // as the surface the decal sits on (+ §8.4 fog below).
  if (dot(N, V) < 0.0) N = -N;     // double-sided projected quads
  float alphaR = max(u_roughness * u_roughness, 0.0025);
  vec3 lit = albedo.rgb * 0.31830989 * u_ambientIrradiance;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= u_lightCount) break;
    vec4 lv = u_lightVector[i];
    vec4 lr = u_lightRadiance[i];
    vec3 L = lv.xyz;
    vec3 radiance = lr.rgb;
    if (lv.w > 0.5) {
      vec3 toLight = lv.xyz - v_world;
      float d = max(length(toLight), 1e-4);
      L = toLight / d;
      // r185 getDistanceAttenuation (decay 2): inverse square, range cutoff.
      float att = 1.0 / max(d * d, 0.01);
      if (lr.w > 0.0) { float x = clamp(1.0 - pow(d / lr.w, 4.0), 0.0, 1.0); att *= x * x; }
      radiance *= att;
    }
    lit += a3dDecalDirect(albedo.rgb, N, V, normalize(L), radiance, alphaR);
  }
  ${d.fog ? "lit = a3dApplyFog(lit, v_world);" : ""}

  float alpha = albedo.a * angleFade * distFade;
  ${d.multiply
    ? `// C-04 stub: multiply grime → alpha-over with black at 1−luminance.
  float lum = dot(lit, vec3(0.2126, 0.7152, 0.0722));
  o_color = vec4(lit * lum, alpha);`
    : "o_color = vec4(lit, alpha);"}
}
`;

export function decalVertexSource(): string {
  return `#version 300 es\n${VERT}`;
}

export function decalFragmentSource(defines: DecalProgramDefines): string {
  return `#version 300 es\n${FRAG(defines)}`;
}

export function decalProgramKey(defines: DecalProgramDefines): string {
  return `prd07.decal.${defines.albedoTexture ? 1 : 0}${defines.normalTexture ? 1 : 0}${defines.multiply ? 1 : 0}${defines.fog ? 1 : 0}`;
}
