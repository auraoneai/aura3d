/**
 * Native WGSL twins of the environment background program (lean
 * `ShaderLibraryCore` and PRD-02 libraries). Same uniforms, same math: the
 * fullscreen triangle unprojects NDC through the inverse view-projection the
 * renderer already re-expresses in standard depth (`standardViewProjection`),
 * so reversed-depth cameras get a direction, not the eye point. Depth testing
 * is off for this pass, so the triangle's clip z does not interact with the
 * depth convention.
 *
 * Both textures are optional bindings: only the one that matches the
 * projection is supplied; the device binds a 1x1 fallback for the other.
 */

import type { NativeShaderStages, PortableShaderBinding } from "../RenderDevice";

const MARKER = "@aura3d-shader:environment-background";

export const ENVIRONMENT_BACKGROUND_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_environmentBackgroundProjection", kind: "float" },
  { name: "u_environmentBackgroundRotation", kind: "float" },
  { name: "u_environmentBackgroundIntensity", kind: "float" },
  { name: "u_environmentBackgroundEncoding", kind: "float" },
  { name: "u_outputColorSpace", kind: "float" },
  { name: "u_environmentBackgroundInverseViewProjection", kind: "mat4" },
  { name: "u_environmentBackgroundTexture", kind: "texture2d", required: false },
  { name: "u_environmentBackgroundCubeTexture", kind: "texture-cube", required: false }
];

export const ENVIRONMENT_BACKGROUND_LOD_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  ...ENVIRONMENT_BACKGROUND_PORTABLE_BINDINGS.slice(0, 6),
  { name: "u_environmentBackgroundLod", kind: "float" },
  ...ENVIRONMENT_BACKGROUND_PORTABLE_BINDINGS.slice(6)
];

const VERTEX = /* wgsl */ `
// ${MARKER}
/* @aura3d-bindings */
struct EnvironmentBackgroundVertex {
  @builtin(position) position: vec4<f32>,
  @location(0) ndc: vec2<f32>,
};
@vertex fn vs_main(@location(0) position: vec3<f32>) -> EnvironmentBackgroundVertex {
  var out: EnvironmentBackgroundVertex;
  out.ndc = position.xy;
  out.position = vec4<f32>(position.xy, 1.0, 1.0);
  return out;
}`;

function fragment(lod: boolean): string {
  // Lean GLSL uses texture() (implicit LOD); PRD-02 uses textureLod with the
  // CPU blur level for cubes and level 0 for the equirect panorama.
  const cubeSample = lod
    ? "textureSampleLevel(u_environmentBackgroundCubeTextureTexture, u_environmentBackgroundCubeTextureSampler, direction, aura.u_environmentBackgroundLod)"
    : "textureSample(u_environmentBackgroundCubeTextureTexture, u_environmentBackgroundCubeTextureSampler, direction)";
  const equirectSample = lod
    ? "textureSampleLevel(u_environmentBackgroundTextureTexture, u_environmentBackgroundTextureSampler, equirectUv, 0.0)"
    : "textureSample(u_environmentBackgroundTextureTexture, u_environmentBackgroundTextureSampler, equirectUv)";
  return /* wgsl */ `
// ${MARKER}
/* @aura3d-bindings */
fn a3dBackgroundEquirectUv(direction: vec3<f32>) -> vec2<f32> {
  let d = normalize(direction);
  let u = atan2(d.z, d.x) / 6.28318530718 + 0.5;
  let v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359;
  return vec2<f32>(fract(u), clamp(v, 0.0, 1.0));
}
fn a3dRotateBackgroundDirection(direction: vec3<f32>, rotation: f32) -> vec3<f32> {
  let angle = rotation * 6.28318530718;
  let c = cos(angle);
  let s = sin(angle);
  let d = normalize(direction);
  return normalize(vec3<f32>(c * d.x - s * d.z, d.y, s * d.x + c * d.z));
}
fn a3dBackgroundDirectionFromNdc(ndc: vec2<f32>) -> vec3<f32> {
  let nearPoint = aura.u_environmentBackgroundInverseViewProjection * vec4<f32>(ndc, -1.0, 1.0);
  let farPoint = aura.u_environmentBackgroundInverseViewProjection * vec4<f32>(ndc, 1.0, 1.0);
  let nearWorld = nearPoint.xyz / max(nearPoint.w, 0.00001);
  let farWorld = farPoint.xyz / max(farPoint.w, 0.00001);
  return normalize(farWorld - nearWorld);
}
fn a3dBackgroundDecode(encodedSample: vec4<f32>) -> vec3<f32> {
  if (aura.u_environmentBackgroundEncoding > 1.5) {
    let exponent = encodedSample.a * 255.0;
    var scale = 0.0;
    if (exponent > 0.0) { scale = exp2(exponent - 128.0) * (255.0 / 256.0); }
    return max(encodedSample.rgb * scale, vec3<f32>(0.0));
  }
  return max(encodedSample.rgb, vec3<f32>(0.0));
}
fn a3dBackgroundEncodeLinearToSrgb(linearColor: vec3<f32>) -> vec3<f32> {
  let clamped = max(linearColor, vec3<f32>(0.0));
  let low = clamped * 12.92;
  let high = 1.055 * pow(clamped, vec3<f32>(1.0 / 2.4)) - 0.055;
  // select, not mix: pow(0, x) may be NaN on some WGSL backends.
  return select(low, high, clamped >= vec3<f32>(0.0031308));
}
fn a3dBackgroundEncodeOutput(linearColor: vec3<f32>) -> vec3<f32> {
  let color = max(linearColor, vec3<f32>(0.0));
  let filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
  let srgb = a3dBackgroundEncodeLinearToSrgb(filmic);
  return mix(color, srgb, step(0.5, aura.u_outputColorSpace));
}
@fragment fn fs_main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let direction = a3dRotateBackgroundDirection(a3dBackgroundDirectionFromNdc(ndc), aura.u_environmentBackgroundRotation);
  let equirectUv = a3dBackgroundEquirectUv(direction);
  // Both samples run in uniform control flow (implicit-LOD sampling needs it);
  // the projection uniform selects the result.
  let cubeSample = ${cubeSample};
  let equirectSample = ${equirectSample};
  let encodedSample = select(equirectSample, cubeSample, aura.u_environmentBackgroundProjection > 1.5);
  let color = a3dBackgroundDecode(encodedSample) * max(aura.u_environmentBackgroundIntensity, 0.0);
  return vec4<f32>(a3dBackgroundEncodeOutput(color), 1.0);
}`;
}

/** Lean library program (implicit-LOD sampling, no blur level). */
export const ENVIRONMENT_BACKGROUND_WGSL: NativeShaderStages = { vertex: VERTEX, fragment: fragment(false) };

/** PRD-02 library program (explicit cube blur LOD, equirect at level 0). */
export const ENVIRONMENT_BACKGROUND_LOD_WGSL: NativeShaderStages = { vertex: VERTEX, fragment: fragment(true) };
