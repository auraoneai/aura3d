// PRD-07 P2-T6 — mesh-particle shader (§6.2.11): Lambert + a3dSampleIrradianceSH
// (C-02 sh9 chunk uniform block) + emissive. Per-instance mat4 + colour +
// emissive ride `instanceAttributes`; the opaque queue draws once per batch.

export const MESH_PARTICLE_SHADER_MARKER = "prd07-mesh-particle-v1";

export function meshParticleVertexSource(): string {
  return `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in vec4 a_instance0;
in vec4 a_instance1;
in vec4 a_instance2;
in vec4 a_instance3;
in vec4 a_color;
in vec3 a_emissive;
uniform mat4 u_viewProjection;
out vec3 v_normal;
out vec4 v_color;
out vec3 v_emissive;
void main() {
  mat4 inst = mat4(a_instance0, a_instance1, a_instance2, a_instance3);
  mat3 rot = mat3(inst);
  v_normal = rot * a_normal;
  v_color = a_color;
  v_emissive = a_emissive;
  gl_Position = u_viewProjection * inst * vec4(a_position, 1.0);
}
`;
}

export function meshParticleFragmentSource(): string {
  return `#version 300 es
precision highp float;
in vec3 v_normal;
in vec4 v_color;
in vec3 v_emissive;
uniform vec3 u_sunDirection;
uniform vec3 u_sunColor;
uniform vec4 u_sh9[9];   // A3DSH9 — a3dSampleIrradianceSH convention (C-02 stub: L0 only)
layout(location = 0) out vec4 o_color;
vec3 a3dSampleIrradianceSH(vec3 N) {
  // C-02 stub shape: L0 band only until the prd02 sh9 chunk is real.
  return u_sh9[0].rgb * 0.282095;
}
void main() {
  vec3 N = normalize(v_normal);
  float ndl = max(dot(N, normalize(u_sunDirection)), 0.0);
  vec3 ambient = a3dSampleIrradianceSH(N);
  vec3 lit = v_color.rgb * (ambient + u_sunColor * ndl) + v_emissive;
  o_color = vec4(lit, v_color.a);
}
`;
}
