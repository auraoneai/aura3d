// WebGPU twin of the PRD-07 ribbon strip program (ribbon.glsl.ts). The GLSL
// fragment's soft-depth block sits behind an `#ifdef SOFT_PARTICLES` that the
// source never defines, so both backends draw the plain strip: premultiplied
// per-vertex colour with the optional legacy gamma encode.

import type { NativeShaderStages, PortableShaderBinding } from "../../RenderDevice";
import { ZERO_TO_ONE_PROJECTION_WGSL, rasterClipDepthWgsl } from "../../webgpu/ProjectionClip";
import { RIBBON_SHADER_MARKER } from "./ribbon.glsl";

export const RIBBON_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_viewProjection", kind: "mat4" },
  { name: "u_outputColorSpace", kind: "float" }
];

const VARYINGS = /* wgsl */ `
struct RibbonVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) world: vec3<f32>,
};`;

export const RIBBON_WGSL: NativeShaderStages = {
  vertex: /* wgsl */ `
// ${RIBBON_SHADER_MARKER} vertex
/* @aura3d-bindings */
${ZERO_TO_ONE_PROJECTION_WGSL}
${VARYINGS}
@vertex fn vs_main(
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(4) color: vec4<f32>
) -> RibbonVarying {
  var out: RibbonVarying;
  out.uv = uv;
  out.color = color;
  out.world = position;
  let clip = aura.u_viewProjection * vec4<f32>(position, 1.0);
  out.position = vec4<f32>(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);
  return out;
}`,
  fragment: /* wgsl */ `
// ${RIBBON_SHADER_MARKER} fragment
/* @aura3d-bindings */
${VARYINGS}
@fragment fn fs_main(v: RibbonVarying) -> @location(0) vec4<f32> {
  let alpha = v.color.a;
  var rgb = max(v.color.rgb * alpha, vec3<f32>(0.0));
  if (aura.u_outputColorSpace > 0.5) {
    rgb = pow(rgb, vec3<f32>(1.0 / 2.2));
  }
  return vec4<f32>(rgb, alpha);
}`
};
