#version 300 es
// @galileo3d-shader:pbr-direct-v1
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 4) in vec4 a_color;
uniform mat4 u_modelViewProjection;
uniform mat4 u_normalMatrix;
out vec3 v_normal;
out vec3 v_worldPosition;
out vec4 v_vertexColor;
void main() {
  v_normal = mat3(u_normalMatrix) * a_normal;
  v_worldPosition = a_position;
  v_vertexColor = a_color;
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}
