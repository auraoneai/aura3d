/**
 * PRD-02 §8.7 `environmentBackground.frag` — flag-on background shader.
 * Same contract as the lean ShaderLibraryCore program plus
 * `u_environmentBackgroundLod`: `A3D_BG_EQUIRECT` (projection 1) samples the
 * equirect at lod 0; cubemap projection samples `u_environmentBackgroundCubeTexture`
 * at the blurred lod (`roughnessToLod(blurriness)` computed on CPU).
 */

import { ShaderLibrary } from "../ShaderLibraryCore";
import {
  DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER,
  DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME
} from "../ShaderLibraryCore";
import { SHADER_CHUNKS, validateShaderChunks } from "../ShaderChunks";

export function createPrd02EnvironmentBackgroundShaderLibrary(): ShaderLibrary {
  const library = new ShaderLibrary();
  validateShaderChunks();
  for (const chunk of SHADER_CHUNKS) {
    library.registerChunk(chunk.name, chunk.source);
  }
  library.register({
    name: DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME,
    marker: DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER,
    vertex: `#version 300 es
// ${DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
out vec2 v_backgroundNdc;
void main() {
  v_backgroundNdc = a_position.xy;
  gl_Position = vec4(a_position.xy, 1.0, 1.0);
}
`,
    fragment: `#version 300 es
// ${DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER}
precision highp float;
uniform sampler2D u_environmentBackgroundTexture;
uniform samplerCube u_environmentBackgroundCubeTexture;
uniform float u_environmentBackgroundProjection;
uniform float u_environmentBackgroundRotation;
uniform float u_environmentBackgroundIntensity;
uniform float u_environmentBackgroundEncoding;
uniform float u_environmentBackgroundLod;
uniform float u_outputColorSpace;
uniform mat4 u_environmentBackgroundInverseViewProjection;
in vec2 v_backgroundNdc;
out vec4 outColor;
vec2 a3dBackgroundEquirectUv(vec3 direction) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / 6.28318530718 + 0.5;
  float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 a3dRotateBackgroundDirection(vec3 direction, float rotation) {
  float angle = rotation * 6.28318530718;
  float c = cos(angle);
  float s = sin(angle);
  vec3 d = normalize(direction);
  return normalize(vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
vec3 a3dBackgroundDirectionFromNdc(vec2 ndc) {
  vec4 nearPoint = u_environmentBackgroundInverseViewProjection * vec4(ndc, -1.0, 1.0);
  vec4 farPoint = u_environmentBackgroundInverseViewProjection * vec4(ndc, 1.0, 1.0);
  vec3 nearWorld = nearPoint.xyz / max(nearPoint.w, 0.00001);
  vec3 farWorld = farPoint.xyz / max(farPoint.w, 0.00001);
  return normalize(farWorld - nearWorld);
}
vec3 a3dBackgroundDecodeRgbe(vec4 encodedSample) {
  float exponent = encodedSample.a * 255.0;
  float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
  return max(encodedSample.rgb * scale, vec3(0.0));
}
vec3 a3dBackgroundDecode(vec4 encodedSample) {
  if (u_environmentBackgroundEncoding > 1.5) return a3dBackgroundDecodeRgbe(encodedSample);
  return max(encodedSample.rgb, vec3(0.0));
}
vec3 a3dBackgroundEncodeLinearToSrgb(vec3 linear) {
  vec3 clamped = max(linear, vec3(0.0));
  vec3 low = clamped * 12.92;
  vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), clamped));
}
vec3 a3dBackgroundEncodeOutput(vec3 linearColor) {
  vec3 color = max(linearColor, vec3(0.0));
  vec3 filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
  vec3 srgb = a3dBackgroundEncodeLinearToSrgb(filmic);
  return mix(color, srgb, step(0.5, u_outputColorSpace));
}
void main() {
  vec3 direction = a3dRotateBackgroundDirection(a3dBackgroundDirectionFromNdc(v_backgroundNdc), u_environmentBackgroundRotation);
  vec4 encodedSample = vec4(0.0, 0.0, 0.0, 1.0);
  if (u_environmentBackgroundProjection > 1.5) {
    encodedSample = textureLod(u_environmentBackgroundCubeTexture, direction, u_environmentBackgroundLod);
  } else {
    encodedSample = textureLod(u_environmentBackgroundTexture, a3dBackgroundEquirectUv(direction), 0.0);
  }
  vec3 color = a3dBackgroundDecode(encodedSample) * max(u_environmentBackgroundIntensity, 0.0);
  outColor = vec4(a3dBackgroundEncodeOutput(color), 1.0);
}
`
  });
  return library;
}
