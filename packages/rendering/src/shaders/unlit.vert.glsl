#version 300 es
// @aura3d-shader:unlit-v1
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 4) in vec4 a_color;
uniform mat4 u_modelViewProjection;
uniform float u_pointSize;
out vec4 v_vertexColor;
void main() {
  v_vertexColor = a_color;
  gl_PointSize = max(u_pointSize, 1.0);
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}
