// PRD-07 P2-T4 — ribbon strip shaders (§6.2.9). The CPU pass expands point
// rings into strips, so the shader is a plain lit/unlit textured strip with
// per-vertex color and the ported alpha curve already baked in. Soft-depth and
// the output encode follow the particle shader's §6.2.7 conventions.

export const RIBBON_SHADER_MARKER = "prd07-ribbon-v1";

export function ribbonVertexSource(): string {
  return `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;
in vec4 a_color;
uniform mat4 u_viewProjection;
out vec2 v_uv;
out vec4 v_color;
out vec3 v_world;
void main() {
  v_uv = a_uv;
  v_color = a_color;
  v_world = a_position;
  gl_Position = u_viewProjection * vec4(a_position, 1.0);
}
`;
}

export function ribbonFragmentSource(defines: { readonly softParticles?: boolean }): string {
  return `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
in vec3 v_world;
uniform sampler2D u_sceneDepth;
uniform vec4 u_depthLinearize; // near, far, orthographic
uniform int u_outputColorSpace;
layout(location = 0) out vec4 o_color;
void main() {
  float alpha = v_color.a;
#ifdef SOFT_PARTICLES
  // scene-depth fade — same linearize convention as particle.glsl (§6.2.7)
  vec2 ndc = gl_FragCoord.xy / vec2(textureSize(u_sceneDepth, 0));
  float d = texture(u_sceneDepth, ndc).r;
  float sceneZ = u_depthLinearize.z > 0.5
    ? mix(u_depthLinearize.x, u_depthLinearize.y, d)
    : (u_depthLinearize.x * u_depthLinearize.y) / max(u_depthLinearize.y - d * (u_depthLinearize.y - u_depthLinearize.x), 1e-4);
  float fragZ = gl_FragCoord.z / gl_FragCoord.w;
  alpha *= clamp((sceneZ - fragZ) / 0.5, 0.0, 1.0);
#endif
  vec3 rgb = v_color.rgb * alpha;
  if (u_outputColorSpace == 1) {
    rgb = pow(rgb, vec3(1.0 / 2.2));
  }
  o_color = vec4(rgb, alpha);
}
`;
}

export function ribbonProgramKey(defines: { readonly softParticles?: boolean }): string {
  return `ribbon.${defines.softParticles ? "S" : "x"}`;
}
