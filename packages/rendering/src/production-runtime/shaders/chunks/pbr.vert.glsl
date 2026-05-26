#version 300 es
// @aura3d-shader:production-pbr-vert
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
uniform mat4 uModelViewProjection;
out vec3 vNormal;
void main() { vNormal = normal; gl_Position = uModelViewProjection * vec4(position, 1.0); }
