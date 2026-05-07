#version 300 es
// @galileo3d-shader:unlit-v1
precision highp float;
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
in vec4 v_vertexColor;
out vec4 outColor;
void main() {
  vec4 base = u_baseColor * v_vertexColor;
  if (base.a < u_alphaCutoff) discard;
  outColor = base;
}
