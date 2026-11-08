// WebGPU twin of the PRD-07 particle billboard program (particle.glsl.ts).
// Line-for-line port: same instance layout (§6.2.1), same billboard, frame and
// soft-depth maths, same premultiplied output and output encoding. The GLSL
// reactive output (location 2) has no native consumer and is not written.

import type { NativeShaderStages, PortableShaderBinding } from "../../RenderDevice";
import { ZERO_TO_ONE_PROJECTION_WGSL, rasterClipDepthWgsl } from "../../webgpu/ProjectionClip";
import type { ParticleProgramDefines } from "./particle.glsl";

const BASE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_view", kind: "mat4" },
  { name: "u_viewProjection", kind: "mat4" },
  { name: "u_atlasRect", kind: "vec4" },
  { name: "u_grid", kind: "vec2" },
  { name: "u_maxScreen", kind: "float" },
  { name: "u_nearFade", kind: "float" },
  { name: "u_cameraNear", kind: "float" },
  { name: "u_softDistance", kind: "float" },
  { name: "u_outputColorSpace", kind: "float" },
  { name: "u_fogColor", kind: "vec3" },
  { name: "u_fogDensity", kind: "float" },
  { name: "u_atlas", kind: "texture2d" }
];

const SOFT_BINDINGS: readonly PortableShaderBinding[] = [
  ...BASE_BINDINGS.slice(0, -1),
  { name: "u_depthLinearize", kind: "vec4" },
  BASE_BINDINGS[BASE_BINDINGS.length - 1]!,
  { name: "u_sceneDepth", kind: "depth2d", required: true }
];

/** Portable bindings of the particle program; soft particles add the scene depth copy. */
export function particlePortableBindings(d: ParticleProgramDefines): readonly PortableShaderBinding[] {
  return d.softParticles ? SOFT_BINDINGS : BASE_BINDINGS;
}

const VARYINGS = /* wgsl */ `
struct ParticleVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv0: vec2<f32>,
  @location(1) uv1: vec2<f32>,
  @location(2) frameT: f32,
  @location(3) color: vec4<f32>,
  @location(4) viewZ: f32,
  @location(5) fog: f32,
};`;

function vertex(d: ParticleProgramDefines): string {
  const stretch = d.stretch ? /* wgsl */ `
  let velView = (aura.u_view * vec4<f32>(velStretch.xyz, 0.0)).xyz;
  let speed2 = length(velView.xy);
  if (speed2 > 1e-4) {
    up2 = normalize(velView.xy);
    stretch = 1.0 + velStretch.w * length(velStretch.xyz);
  }` : "";
  return /* wgsl */ `
// aura3d.prd07.particle vertex
/* @aura3d-bindings */
${ZERO_TO_ONE_PROJECTION_WGSL}
${VARYINGS}
fn a3dParticleRaster(clip: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);
}
fn a3dFloorMod(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
@vertex fn vs_main(
  @location(0) corner: vec2<f32>,
  @location(1) posSize: vec4<f32>,
  @location(2) velStretch: vec4<f32>,
  @location(3) color: vec4<f32>,
  @location(4) rotFrameMisc: vec4<f32>
) -> ParticleVarying {
  var out: ParticleVarying;
  let P = posSize.xyz;
  let size = posSize.w;
  let rot = rotFrameMisc.x;
  let camRight = vec3<f32>(aura.u_view[0][0], aura.u_view[1][0], aura.u_view[2][0]);
  let camUp = vec3<f32>(aura.u_view[0][1], aura.u_view[1][1], aura.u_view[2][1]);
  var up2 = vec2<f32>(0.0, 1.0);
  var stretch = 1.0;${stretch}
  let right2 = vec2<f32>(-up2.y, up2.x);
  let c = cos(rot);
  let s = sin(rot);
  let k = vec2<f32>(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
  var off = right2 * (k.x * size * 0.5) + up2 * (k.y * size * 0.5 * stretch);
  let clipC = aura.u_viewProjection * vec4<f32>(P, 1.0);
  if (clipC.w < 0.02) {
    out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    out.uv0 = vec2<f32>(0.0); out.uv1 = vec2<f32>(0.0); out.frameT = 0.0; out.color = vec4<f32>(0.0); out.viewZ = 0.0; out.fog = 0.0;
    return out;
  }
  if (aura.u_maxScreen > 0.0) {
    let clipE = aura.u_viewProjection * vec4<f32>(P + camUp * (size * 0.5 * stretch), 1.0);
    let halfNdc = abs(clipE.y / max(clipE.w, 1e-4) - clipC.y / max(clipC.w, 1e-4));
    if (halfNdc > aura.u_maxScreen) { off *= aura.u_maxScreen / halfNdc; }
  }
  let world = P + camRight * off.x + camUp * off.y;
  let clip = aura.u_viewProjection * vec4<f32>(world, 1.0);
  out.position = a3dParticleRaster(clip);
  out.viewZ = clip.w;
  let frames = max(aura.u_grid.x * aura.u_grid.y, 1.0);
  let f = clamp(rotFrameMisc.y, 0.0, frames - 1.0);
  let f0 = floor(f);
  let f1 = min(f0 + 1.0, frames - 1.0);
  out.frameT = f - f0;
  let cell = vec2<f32>(1.0) / aura.u_grid;
  let local = corner * 0.5 + 0.5;
  out.uv0 = aura.u_atlasRect.xy + (vec2<f32>(a3dFloorMod(f0, aura.u_grid.x), aura.u_grid.y - 1.0 - floor(f0 / aura.u_grid.x)) + local) * cell * aura.u_atlasRect.zw;
  out.uv1 = aura.u_atlasRect.xy + (vec2<f32>(a3dFloorMod(f1, aura.u_grid.x), aura.u_grid.y - 1.0 - floor(f1 / aura.u_grid.x)) + local) * cell * aura.u_atlasRect.zw;
  out.color = color;
  out.fog = rotFrameMisc.z;
  return out;
}`;
}

function fragment(d: ParticleProgramDefines): string {
  const sample = d.proceduralSoftDot ? /* wgsl */ `
  let q = v.uv0 * 2.0 - 1.0;
  let r = length(q);
  let dotA = select(0.55 * clamp((1.0 - r) / 0.65, 0.0, 1.0), 1.0 - (0.45 / 0.35) * r, r < 0.35);
  var t = vec4<f32>(vec3<f32>(dotA), dotA);` : /* wgsl */ `
  var t = textureSample(u_atlasTexture, u_atlasSampler, v.uv0);
  ${d.frameBlend ? "t = mix(t, textureSample(u_atlasTexture, u_atlasSampler, v.uv1), vec4<f32>(v.frameT));" : ""}
  ${d.straightAlpha ? "t = vec4<f32>(t.rgb * t.a, t.a);" : ""}`;
  const soft = d.softParticles ? /* wgsl */ `
  let sceneZ = a3dSceneViewZ(textureLoad(u_sceneDepthTexture, vec2<i32>(v.position.xy), 0));
  fade *= clamp((sceneZ - v.viewZ) / max(aura.u_softDistance, 1e-3), 0.0, 1.0);` : "";
  const fogT = d.fogAnalytic ? /* wgsl */ `
  var fogT = 1.0 - exp(-aura.u_fogDensity * aura.u_fogDensity * v.viewZ * v.viewZ);
  fogT = clamp(fogT * v.fog, 0.0, 1.0);` : "";
  const output = d.blendAdditive ? /* wgsl */ `
  ${d.fogAnalytic ? "rgb *= (1.0 - fogT);" : ""}
  rgb = a3dParticleEncodeOutput(rgb);
  return vec4<f32>(rgb, 0.0);` : /* wgsl */ `
  ${d.fogAnalytic ? "rgb = mix(rgb, aura.u_fogColor * a, vec3<f32>(fogT));" : ""}
  ${d.unpremultiplyOutput ? "rgb = rgb / max(a, 1e-4);\n  rgb = min(rgb, vec3<f32>(64.0));" : ""}
  ${d.blendAdditiveFallback ? "rgb *= 1.6;" : ""}
  rgb = a3dParticleEncodeOutput(rgb);
  return vec4<f32>(rgb, a);`;
  return /* wgsl */ `
// aura3d.prd07.particle fragment
/* @aura3d-bindings */
${VARYINGS}
fn a3dLinearToSrgb(linear: vec3<f32>) -> vec3<f32> {
  let clamped = max(linear, vec3<f32>(0.0));
  let low = clamped * 12.92;
  let high = 1.055 * pow(clamped, vec3<f32>(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3<f32>(0.0031308), clamped));
}
fn a3dParticleEncodeOutput(linearColor: vec3<f32>) -> vec3<f32> {
  let color = max(linearColor, vec3<f32>(0.0));
  let filmic = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
  let srgb = a3dLinearToSrgb(filmic);
  return mix(color, srgb, vec3<f32>(step(0.5, aura.u_outputColorSpace)));
}
${d.softParticles ? /* wgsl */ `
fn a3dSceneViewZ(depth0: f32) -> f32 {
  var depth = depth0;
  if (aura.u_depthLinearize.w > 0.5) { depth = 1.0 - depth; }
  if (aura.u_depthLinearize.z > 0.5) { return mix(aura.u_depthLinearize.x, aura.u_depthLinearize.y, depth); }
  return aura.u_depthLinearize.x * aura.u_depthLinearize.y /
    max(aura.u_depthLinearize.y - depth * (aura.u_depthLinearize.y - aura.u_depthLinearize.x), 1e-4);
}` : ""}
@fragment fn fs_main(v: ParticleVarying) -> @location(0) vec4<f32> {${sample}
  var fade = v.color.a;
  fade *= clamp((v.viewZ - aura.u_cameraNear) / aura.u_nearFade, 0.0, 1.0);${soft}
  let a = t.a * fade;
  var rgb = t.rgb * v.color.rgb * fade;${fogT}${output}
}`;
}

/** Native stages for a particle define set (the same keys as the GLSL program cache). */
export function particleWgsl(d: ParticleProgramDefines): NativeShaderStages {
  return { vertex: vertex(d), fragment: fragment(d) };
}
