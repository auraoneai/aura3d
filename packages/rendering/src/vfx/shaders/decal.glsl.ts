// PRD-07 P6-T1 — decal program (§8.8): lit projected marks. Albedo from the
// atlas page (or flat colour), tangent-space normal perturb (optional page
// normal map), page roughness; sun half-Lambert + GGX spec +
// a3dSampleIrradianceSH (C-02 sh9 stub convention) + a3dApplyFog (§8.4 chunk,
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
uniform vec3 u_sunDirection;
uniform vec3 u_sunColor;
uniform float u_roughness;
uniform vec4 u_sh9[9];      // A3DSH9 — a3dSampleIrradianceSH convention (C-02 stub: L0 only)
uniform vec3 u_cameraPosition;
${d.fog ? PRD07_FOG_CHUNK_GLSL : ""}
layout(location = 0) out vec4 o_color;

vec3 a3dSampleIrradianceSH(vec3 N) {
  return u_sh9[0].rgb * 0.282095;
}

// GGX distribution (Walter 2007) for the §8.8 spec lobe.
float a3dGGX(float nDotH, float roughness) {
  float a = max(roughness * roughness, 1e-3);
  float a2 = a * a;
  float dn = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(3.14159265 * dn * dn, 1e-6);
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

  // Lighting: sun half-Lambert + GGX spec + sh9 ambient (+ §8.4 fog below).
  float halfLambert = dot(N, normalize(u_sunDirection)) * 0.5 + 0.5;
  vec3 H = normalize(V + normalize(u_sunDirection));
  float nDotH = max(dot(N, H), 0.0);
  float nDotV = max(dot(N, V), 1e-3);
  float nDotL = max(dot(N, normalize(u_sunDirection)), 0.0);
  float spec = a3dGGX(nDotH, u_roughness) * nDotL / max(4.0 * nDotV * nDotL, 1e-3);
  vec3 lit = albedo.rgb * (a3dSampleIrradianceSH(N) + u_sunColor * halfLambert * halfLambert)
           + u_sunColor * spec;
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
