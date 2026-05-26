#version 300 es
// @aura3d-shader:unlit-v1
precision highp float;
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_roundPoints;
in vec4 v_vertexColor;
out vec4 outColor;
void main() {
  if (u_roundPoints > 0.5) {
    vec2 pointUv = gl_PointCoord * 2.0 - 1.0;
    float radius = dot(pointUv, pointUv);
    if (radius > 1.0) discard;
  }
  vec4 base = u_baseColor * v_vertexColor;
  if (base.a < u_alphaCutoff) discard;
  outColor = base;
}
