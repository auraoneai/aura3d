// PRD-07 P1-T9 — particle billboard program (PRD-07 §8.1), GLSL ES 3.00.
// Compiled by PRD 07 itself through RenderDevice.createShaderProgram until the
// C-02 ProgramCache is real; program keys use computeProgramKey-stable strings.

import { registerShaderChunk, type ShaderChunk } from "../../contracts/program";

export const PARTICLE_SHADER_MARKER = "aura3d.prd07.particle";

export interface ParticleProgramDefines {
  readonly stretch: boolean;
  readonly frameBlend: boolean;
  readonly blendAdditiveFallback: boolean; // additive emulated under alpha-over (C-04 stub)
  readonly unpremultiplyOutput: boolean;
  readonly proceduralSoftDot: boolean;     // no atlas — analytic disc
  readonly fogAnalytic: boolean;
}

export function particleProgramKey(d: ParticleProgramDefines): string {
  return `prd07.particle.${d.stretch ? "S" : ""}${d.frameBlend ? "F" : ""}${d.blendAdditiveFallback ? "A" : ""}${d.unpremultiplyOutput ? "U" : ""}${d.proceduralSoftDot ? "P" : ""}${d.fogAnalytic ? "G" : ""}`;
}

const VERT_BODY = `
// ${PARTICLE_SHADER_MARKER} vertex
in vec2 a_corner;
in vec4 a_posSize;
in vec4 a_velStretch;
in vec4 a_color;
in vec4 a_rotFrameMisc;

uniform mat4 u_view;
uniform mat4 u_projection;
uniform vec4 u_atlasRect;
uniform vec2 u_grid;

out vec2 v_uv0;
out vec2 v_uv1;
out float v_frameT;
out vec4 v_color;
out float v_viewZ;
out float v_fog;

void main() {
  vec3 P = a_posSize.xyz;
  float size = a_posSize.w;
  float rot = a_rotFrameMisc.x;
  vec4 viewPos = u_view * vec4(P, 1.0);
  // Billboard basis in view space: +x right, +y up. STRETCH re-aims the up axis
  // at the view-space velocity direction and lengthens it by speed.
  vec2 up2 = vec2(0.0, 1.0);
  float stretch = 1.0;
#if STRETCH
  vec3 velView = (u_view * vec4(a_velStretch.xyz, 0.0)).xyz;
  float speed2 = length(velView.xy);
  if (speed2 > 1e-4) {
    up2 = normalize(velView.xy);
    stretch = 1.0 + a_velStretch.w * length(a_velStretch.xyz);
  }
#endif
  vec2 right2 = vec2(-up2.y, up2.x);
  float c = cos(rot);
  float s = sin(rot);
  vec2 k = vec2(c * a_corner.x - s * a_corner.y, s * a_corner.x + c * a_corner.y);
  viewPos.xy += right2 * (k.x * size * 0.5) + up2 * (k.y * size * 0.5 * stretch);
  v_viewZ = -viewPos.z;
  gl_Position = u_projection * viewPos;
  float frames = max(u_grid.x * u_grid.y, 1.0);
  float f = clamp(a_rotFrameMisc.y, 0.0, frames - 1.0);
  float f0 = floor(f);
  float f1 = min(f0 + 1.0, frames - 1.0);
  v_frameT = f - f0;
  vec2 cell = vec2(1.0) / u_grid;
  vec2 local = a_corner * 0.5 + 0.5;
  v_uv0 = u_atlasRect.xy + (vec2(mod(f0, u_grid.x), u_grid.y - 1.0 - floor(f0 / u_grid.x)) + local) * cell * u_atlasRect.zw;
  v_uv1 = u_atlasRect.xy + (vec2(mod(f1, u_grid.x), u_grid.y - 1.0 - floor(f1 / u_grid.x)) + local) * cell * u_atlasRect.zw;
  v_color = a_color;
  v_fog = a_rotFrameMisc.z;
}
`;

const FRAG_BODY = `
// ${PARTICLE_SHADER_MARKER} fragment
uniform sampler2D u_atlas;
uniform float u_nearFade;
uniform float u_cameraNear;
uniform vec3 u_fogColor;
uniform float u_fogDensity;

in vec2 v_uv0;
in vec2 v_uv1;
in float v_frameT;
in vec4 v_color;
in float v_viewZ;
in float v_fog;

layout(location=0) out vec4 o_color;

void main() {
#if PROCEDURAL_SOFT_DOT
  vec2 q = v_uv0 * 2.0 - 1.0;
  float a = smoothstep(1.0, 0.62, dot(q, q));
#else
  vec4 t = texture(u_atlas, v_uv0);
#if FRAME_BLEND
  t = mix(t, texture(u_atlas, v_uv1), v_frameT);
#endif
  float a = t.a;
#endif
  float fade = v_color.a;
  fade *= clamp((v_viewZ - u_cameraNear) / u_nearFade, 0.0, 1.0);
  a *= fade;
  vec3 rgb = v_color.rgb * fade;
#if FOG_ANALYTIC
  float fogT = 1.0 - exp(-u_fogDensity * u_fogDensity * v_viewZ * v_viewZ);
  fogT = clamp(fogT * v_fog, 0.0, 1.0);
  rgb = mix(rgb, u_fogColor * a, fogT);
#endif
#if BLEND_ADDITIVE_FALLBACK
  rgb *= 1.6; // §6.2.7 core boost: approximate additive accumulation under alpha-over
#endif
#if UNPREMULTIPLY_OUTPUT
  rgb = rgb / max(a, 1e-4);
  rgb = min(rgb, vec3(64.0));
#endif
  o_color = vec4(rgb, a);
}
`;

function define(name: string, on: boolean): string {
  return on ? `#define ${name} 1\n` : `#define ${name} 0\n`;
}

/** Full vertex stage source for a define set (GLSL ES 3.00, `#version` included). */
export function particleVertexSource(d: ParticleProgramDefines): string {
  return `#version 300 es
precision highp float;
precision highp int;
${define("STRETCH", d.stretch)}${VERT_BODY}`;
}

/** Full fragment stage source for a define set. */
export function particleFragmentSource(d: ParticleProgramDefines): string {
  return `#version 300 es
precision highp float;
${define("STRETCH", d.stretch)}${define("FRAME_BLEND", d.frameBlend)}${define("BLEND_ADDITIVE_FALLBACK", d.blendAdditiveFallback)}${define("UNPREMULTIPLY_OUTPUT", d.unpremultiplyOutput)}${define("PROCEDURAL_SOFT_DOT", d.proceduralSoftDot)}${define("FOG_ANALYTIC", d.fogAnalytic)}${FRAG_BODY}`;
}

/** C-02 chunk records for the particle program stages. */
export const PARTICLE_CHUNKS: readonly ShaderChunk[] = [
  { name: "a3d_prd07_particle_vertex", owner: "prd07", stage: "vertex", glsl: VERT_BODY },
  { name: "a3d_prd07_particle_fragment", owner: "prd07", stage: "fragment", glsl: FRAG_BODY }
];

/** Idempotent registration — safe to call from the lane barrel on every import. */
export function registerParticleChunks(): void {
  for (const chunk of PARTICLE_CHUNKS) {
    try {
      registerShaderChunk(chunk);
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith("SHADER_CHUNK_DUPLICATE"))) throw error;
    }
  }
}
