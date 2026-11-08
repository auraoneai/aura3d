// WGSL twin of beam.glsl (light-beam, lightCone, auroraRibbon). Same ribbon
// vertex layout (position 0, uv 2, color 4; the normal at 1 is unused), same
// uniforms. Soft depth reads the published scene-depth copy as a depth2d
// texture at this fragment's pixel; the window depth convention is the same
// zero-to-one depth in both APIs, so the linearize math is unchanged.

import type { NativeShaderStages, PortableShaderBinding } from "../../RenderDevice";
import { BEAM_SHADER_MARKER } from "./beam.glsl";

export interface BeamWgslDefines {
  readonly softParticles?: boolean;
  readonly aurora?: boolean;
}

const BASE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_viewProjection", kind: "mat4" },
  { name: "u_outputColorSpace", kind: "float" },
  { name: "u_time", kind: "float" },
  { name: "u_sway", kind: "float" },
  { name: "u_aurora", kind: "float" },
  { name: "u_shimmer", kind: "float" }
];

const SOFT_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_depthLinearize", kind: "vec4" },
  { name: "u_sceneDepth", kind: "depth2d", required: true }
];

export function beamPortableBindings(defines: BeamWgslDefines): readonly PortableShaderBinding[] {
  return defines.softParticles ? [...BASE_BINDINGS, ...SOFT_BINDINGS] : BASE_BINDINGS;
}

const VERTEX = /* wgsl */ `
// ${BEAM_SHADER_MARKER} vertex
/* @aura3d-bindings */
struct BeamVertex {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) clipW: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(4) a_color: vec4<f32>) -> BeamVertex {
  var out: BeamVertex;
  out.uv = a_uv;
  out.color = a_color;
  var p = a_position;
  if (aura.u_aurora > 0.5) {
    // curtain sway: lateral offset grows with uv.y (height), slow phase scroll
    let sway = sin(aura.u_time * 0.4 + a_uv.x * 6.28318 * 2.0) * aura.u_sway * a_uv.y;
    p.x += sway;
    p.z += sway * 0.35;
  }
  let clip = aura.u_viewProjection * vec4<f32>(p, 1.0);
  out.position = clip;
  out.clipW = clip.w;
  return out;
}`;

function fragment(defines: BeamWgslDefines): string {
  const aurora = defines.aurora ? /* wgsl */ `
  // curtain folds: uv.x bands drifting with time, brightness clipped soft
  let band = sin(input.uv.x * 18.0 + aura.u_time * 1.7) * 0.5 + 0.5;
  let fold = mix(0.55, 1.0, band * band);
  rgb *= fold * (1.0 + aura.u_shimmer * 0.5);
  alpha *= fold;` : "";
  const soft = defines.softParticles ? /* wgsl */ `
  let depthSize = vec2<i32>(textureDimensions(u_sceneDepthTexture));
  let texel = clamp(vec2<i32>(input.position.xy), vec2<i32>(0), depthSize - vec2<i32>(1));
  var d = textureLoad(u_sceneDepthTexture, texel, 0);
  let lin = aura.u_depthLinearize;
  if (lin.w > 0.5) { d = 1.0 - d; } // reversed depth: back to standard window depth
  var sceneZ = (lin.x * lin.y) / max(lin.y - d * (lin.y - lin.x), 1e-4);
  if (lin.z > 0.5) { sceneZ = mix(lin.x, lin.y, d); }
  let fragDepth = select(input.position.z, 1.0 - input.position.z, lin.w > 0.5);
  let fragZ = fragDepth * input.clipW;
  alpha *= clamp((sceneZ - fragZ) / 0.5, 0.0, 1.0);` : "";
  return /* wgsl */ `
// ${BEAM_SHADER_MARKER} fragment
/* @aura3d-bindings */
struct BeamFragmentInput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) clipW: f32,
};
@fragment fn fs_main(input: BeamFragmentInput) -> @location(0) vec4<f32> {
  var alpha = input.color.a;
  var rgb = input.color.rgb;${aurora}${soft}
  rgb *= alpha;
  // pow(x, y) is undefined for x < 0 (interpolated rim alpha can dip to -eps).
  rgb = max(rgb, vec3<f32>(0.0));
  alpha = clamp(alpha, 0.0, 1.0);
  if (aura.u_outputColorSpace > 0.5) {
    rgb = pow(rgb, vec3<f32>(1.0 / 2.2));
  }
  return vec4<f32>(rgb, alpha);
}`;
}

export function beamWgsl(defines: BeamWgslDefines): NativeShaderStages {
  return { vertex: VERTEX, fragment: fragment(defines) };
}
