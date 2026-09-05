#version 300 es
// @aura3d-shader:pbr-direct
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 4) in vec4 a_color;
layout(location = 8) in vec4 a_instanceMatrix0;
layout(location = 9) in vec4 a_instanceMatrix1;
layout(location = 10) in vec4 a_instanceMatrix2;
layout(location = 11) in vec4 a_instanceMatrix3;
layout(location = 12) in vec4 a_instanceColor;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
uniform mat4 u_instanceMatrices[64];
uniform float u_instanceCount;
uniform float u_instanceAttributeMode;
out vec3 v_normal;
out vec3 v_worldPosition;
out vec4 v_vertexColor;
void main() {
  // P2 instanced-GLB path (muse3jsparity-PRD): the u_instanceCount branch is
  // taken only for items carrying instanceTransforms; every other draw keeps
  // the legacy math bit-exact. Mirrors the instanced-PBR vertex convention.
  if (u_instanceCount > 0.5) {
    int instanceIndex = clamp(gl_InstanceID, 0, max(int(u_instanceCount) - 1, 0));
    mat4 attributeMatrix = mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
    mat4 instanceMatrix = u_instanceAttributeMode > 0.5 ? attributeMatrix : u_instanceMatrices[instanceIndex];
    vec4 worldPosition = u_modelMatrix * instanceMatrix * vec4(a_position, 1.0);
    v_normal = mat3(u_normalMatrix) * transpose(inverse(mat3(instanceMatrix))) * a_normal;
    v_worldPosition = worldPosition.xyz;
    v_vertexColor = a_color * a_instanceColor;
    gl_Position = u_modelViewProjection * instanceMatrix * vec4(a_position, 1.0);
  } else {
    v_normal = mat3(u_normalMatrix) * a_normal;
    v_worldPosition = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
    v_vertexColor = a_color;
    gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
  }
}