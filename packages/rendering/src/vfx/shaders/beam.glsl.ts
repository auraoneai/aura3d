// PRD-07 P2-T9 — beam/cone/aurora shaders (§6.2.10). Same vertex layout as
// ribbon.glsl (pos3 normal3 uv2 color4): the CPU pass bakes taper + falloff
// into per-vertex color/alpha; the fragment adds soft-depth fade, the output
// encode, and — for the aurora curtain — the scrolling shimmer bands
// (PRD 14 §8.2: curtain fold + shimmer are fragment-time effects).

export const BEAM_SHADER_MARKER = "prd07-beam-v1";

export function beamVertexSource(): string {
  return `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;
in vec4 a_color;
uniform mat4 u_viewProjection;
uniform float u_time;
uniform float u_sway;
uniform float u_aurora;
out vec2 v_uv;
out vec4 v_color;
out vec3 v_world;
void main() {
  v_uv = a_uv;
  v_color = a_color;
  vec3 p = a_position;
  if (u_aurora > 0.5) {
    // curtain sway: lateral offset grows with uv.y (height), slow phase scroll
    float sway = sin(u_time * 0.4 + a_uv.x * 6.28318 * 2.0) * u_sway * a_uv.y;
    p.x += sway;
    p.z += sway * 0.35;
  }
  v_world = p;
  gl_Position = u_viewProjection * vec4(p, 1.0);
}
`;
}

export function beamFragmentSource(defines: { readonly softParticles?: boolean; readonly aurora?: boolean }): string {
  const aurora = defines.aurora ? "#define AURORA" : "";
  const soft = defines.softParticles ? "#define SOFT_PARTICLES" : "";
  return `#version 300 es
precision highp float;
${aurora}
${soft}
in vec2 v_uv;
in vec4 v_color;
in vec3 v_world;
uniform sampler2D u_sceneDepth;
uniform vec4 u_depthLinearize;
uniform float u_outputColorSpace;
uniform float u_time;
uniform float u_shimmer;
layout(location = 0) out vec4 o_color;
void main() {
  float alpha = v_color.a;
  vec3 rgb = v_color.rgb;
#ifdef AURORA
  // curtain folds: uv.x bands drifting with time, brightness clipped soft
  float band = sin(v_uv.x * 18.0 + u_time * 1.7) * 0.5 + 0.5;
  float fold = mix(0.55, 1.0, band * band);
  rgb *= fold * (1.0 + u_shimmer * 0.5);
  alpha *= fold;
#endif
#ifdef SOFT_PARTICLES
  vec2 ndc = gl_FragCoord.xy / vec2(textureSize(u_sceneDepth, 0));
  float d = texture(u_sceneDepth, ndc).r;
  float sceneZ = u_depthLinearize.z > 0.5
    ? mix(u_depthLinearize.x, u_depthLinearize.y, d)
    : (u_depthLinearize.x * u_depthLinearize.y) / max(u_depthLinearize.y - d * (u_depthLinearize.y - u_depthLinearize.x), 1e-4);
  float fragZ = gl_FragCoord.z / gl_FragCoord.w;
  alpha *= clamp((sceneZ - fragZ) / 0.5, 0.0, 1.0);
#endif
  rgb *= alpha;
  if (u_outputColorSpace == 1) {
    rgb = pow(rgb, vec3(1.0 / 2.2));
  }
  o_color = vec4(rgb, alpha);
}
`;
}

export function beamProgramKey(defines: { readonly softParticles?: boolean; readonly aurora?: boolean }): string {
  return `beam.${defines.softParticles ? "S" : "x"}${defines.aurora ? "A" : "x"}`;
}
