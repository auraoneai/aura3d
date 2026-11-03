import type { PortableShaderSources } from "./PortableShaderMaterial";

/**
 * Linear camera-space distance, not the nonlinear depth-buffer sample.  The
 * perspective-correct interpolator reconstructs -view.z at each fragment;
 * orthographic interpolation has the same result because clip.w is constant.
 *
 * The camera owns raster clipping. The preview range only maps visible
 * fragments to grayscale; it does not change the camera's near/far planes.
 */
export function depthPreviewShader(): PortableShaderSources {
  return {
    glsl: {
      vertex: `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_a3dClipRange;
out float v_viewDepth;
void main() {
  vec4 viewPosition = u_viewMatrix * u_modelMatrix * vec4(a_position, 1.0);
  v_viewDepth = -viewPosition.z;
  gl_Position = u_projectionMatrix * viewPosition;
  if (u_a3dClipRange > 0.5) {
    gl_Position.z = 2.0 * gl_Position.z - gl_Position.w;
  }
}`,
      fragment: `#version 300 es
precision highp float;
in float v_viewDepth;
uniform float u_depthPreviewNear;
uniform float u_depthPreviewSpan;
out vec4 outColor;
void main() {
  float value = 1.0 - clamp((v_viewDepth - u_depthPreviewNear) / u_depthPreviewSpan, 0.0, 1.0);
  outColor = vec4(vec3(value), 1.0);
}`
    },
    wgsl: {
      vertex: `/* @aura3d-bindings */
struct DepthPreviewVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) @interpolate(perspective, center) viewDepth: f32,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> DepthPreviewVertexOutput {
  let viewPosition = aura.u_viewMatrix * aura.u_modelMatrix * vec4<f32>(position, 1.0);
  let clip = aura.u_projectionMatrix * viewPosition;
  let clipZ = select(clip.z * 0.5 + clip.w * 0.5, clip.z, aura.u_a3dClipRange > 0.5);
  var output: DepthPreviewVertexOutput;
  output.position = vec4<f32>(clip.xy, clipZ, clip.w);
  output.viewDepth = -viewPosition.z;
  return output;
}`,
      fragment: `/* @aura3d-bindings */
@fragment
fn fs_main(@location(0) @interpolate(perspective, center) viewDepth: f32) -> @location(0) vec4<f32> {
  let value = 1.0 - clamp((viewDepth - aura.u_depthPreviewNear) / aura.u_depthPreviewSpan, 0.0, 1.0);
  return vec4<f32>(value, value, value, 1.0);
}`
    }
  };
}
