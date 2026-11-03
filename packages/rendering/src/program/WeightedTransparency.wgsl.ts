import type { ProgramFeatures } from "../contracts/program";
import { DEPTH_COVERAGE_FEATURE, PROGRAM_LOG_DEPTH_FEATURE, PROGRAM_OUTPUT_SRGB_FEATURE, PROGRAM_TRANSPARENCY_FEATURE } from "./ProgramFeatures";

/**
 * Source-only weighted transparency. This is not a WebGPU capability claim:
 * the native device does not yet bind this group or consume these shaders.
 *
 * The opaque depth and color attachments have the same dimensions. Aura's
 * depth origin is a bottom-left GL pixel offset; WebGPU fragment positions and
 * depth texels are top-left, so the Y offset changes sign (not the pixel Y).
 */
export type WeightedWgslPhase = "accumulation" | "revealage";

export const WEIGHTED_WGSL_BINDINGS = Object.freeze({
  controls: Object.freeze({
    group: 2, binding: 0, byteLength: 16,
    offsets: Object.freeze({
      u_a3dTransparencyDepthOrigin: 0,
      u_a3dTransparencyReversedDepth: 8,
      u_a3dTransparencyInputPremultiplied: 12
    })
  }),
  opaqueDepth: Object.freeze({
    group: 2, binding: 1, uniform: "u_a3dOpaqueDepth",
    dimension: "2d", sampleType: "depth", aspect: "depth-only", multisampled: false
  })
} as const);

/** Exact attachment and fixed-function state required by each output. */
export function weightedWgslPhaseContract(phase: WeightedWgslPhase) {
  if (phase !== "accumulation" && phase !== "revealage") throw new Error("INVALID_WEIGHTED_TRANSPARENCY_VARIANT");
  const accumulation = phase === "accumulation";
  const blend = Object.freeze({
    equation: "add" as const,
    src: accumulation ? "one" as const : "zero" as const,
    dst: accumulation ? "one" as const : "one-minus-src-alpha" as const
  });
  return Object.freeze({
    phase,
    colorFormat: "rgba16f" as const,
    colorSpace: "linear" as const,
    location: 0 as const,
    sampleCount: 1 as const,
    opaqueDepthFormat: "depth24" as const,
    opaqueDepthSize: "match-color" as const,
    requiresFloatBlend: true as const,
    // With |straight radiance| <= 32 and weight <= 1, at most 1024
    // contributions keep the rgba16f accumulation finite.
    maxFragmentsPerPixel: 1024 as const,
    clear: Object.freeze(accumulation ? [0, 0, 0, 0] as const : [1, 1, 1, 1] as const),
    state: Object.freeze({
      blend: true as const,
      blendMode: Object.freeze({ kind: "custom" as const, color: blend, alpha: blend }),
      depthTest: false as const,
      depthWrite: false as const,
      alphaToCoverage: false as const,
      colorWrite: Object.freeze([true, true, true, true] as const)
    }),
    bindings: WEIGHTED_WGSL_BINDINGS
  });
}

// Authored directly in WGSL. The depth test is deliberately called *after*
// implicit texture derivatives and material shading: a divergent discard
// before textureSample/dpdx makes those derivatives invalid on WebGPU.
const WEIGHTED_DEPTH_WGSL = /* wgsl */ `
struct A3dWeightedTransparency {
  u_a3dTransparencyDepthOrigin: vec2f,
  u_a3dTransparencyReversedDepth: f32,
  u_a3dTransparencyInputPremultiplied: f32,
};
@group(2) @binding(0) var<uniform> a3dWeighted: A3dWeightedTransparency;
@group(2) @binding(1) var u_a3dOpaqueDepth: texture_depth_2d;

fn a3dWeightedDepthValueRetains(depth: f32, opaque: f32, reversed: f32) -> bool {
  if (reversed > 0.5) { return !(depth < opaque); }
  return !(depth > opaque);
}

fn a3dWeightedDepthRetains(position: vec4f) -> bool {
  let offset = vec2i(a3dWeighted.u_a3dTransparencyDepthOrigin);
  let pixel = vec2i(position.xy) + vec2i(offset.x, -offset.y);
  let size = vec2i(textureDimensions(u_a3dOpaqueDepth));
  if (any(pixel < vec2i(0)) || any(pixel >= size)) { return false; }
  let opaque = textureLoad(u_a3dOpaqueDepth, pixel, 0);
  return a3dWeightedDepthValueRetains(position.z, opaque, a3dWeighted.u_a3dTransparencyReversedDepth);
}
`;

const WEIGHTED_REVEALAGE_WGSL = /* wgsl */ `
fn a3dWeightedRevealage(alpha: f32) -> vec4f {
  return vec4f(0.0, 0.0, 0.0, clamp(alpha, 0.0, 1.0));
}
`;

const WEIGHTED_ACCUMULATION_WGSL = /* wgsl */ `
fn a3dWeightedWeight(depth: f32, reversed: f32) -> f32 {
  var nearDepth = depth;
  if (reversed > 0.5) { nearDepth = 1.0 - depth; }
  let distance = 1.0 - clamp(nearDepth, 0.0, 1.0);
  return 0.25 + 0.75 * pow(distance, 3.0);
}

fn a3dWeightedStraightChannel(channel: f32, alpha: f32, premultiplied: f32) -> f32 {
  var straight = channel;
  if (premultiplied > 0.5) {
    if (alpha > 0.0) { straight = channel / alpha; }
    else { straight = 0.0; }
  }
  return clamp(straight, -32.0, 32.0);
}

fn a3dWeightedAccumulation(color: vec3f, alpha: f32, depth: f32) -> vec4f {
  let a = clamp(alpha, 0.0, 1.0);
  let weight = a3dWeightedWeight(depth, a3dWeighted.u_a3dTransparencyReversedDepth);
  let premultiplied = a3dWeighted.u_a3dTransparencyInputPremultiplied;
  return vec4f(
    a3dWeightedStraightChannel(color.x, a, premultiplied) * a * weight,
    a3dWeightedStraightChannel(color.y, a, premultiplied) * a * weight,
    a3dWeightedStraightChannel(color.z, a, premultiplied) * a * weight,
    a * weight
  );
}
`;

function replaceExactlyOnce(source: string, before: string, after: string): string {
  const offset = source.indexOf(before);
  if (offset < 0 || source.indexOf(before, offset + before.length) >= 0) {
    throw new Error("WEIGHTED_TRANSPARENCY_WGSL_TEMPLATE_CHANGED");
  }
  return source.slice(0, offset) + after + source.slice(offset + before.length);
}

/**
 * Adapt a descriptor-validated built-in native forward template. The caller
 * must supply that trusted template and its fragment resource count; these
 * drift checks are not an authentication mechanism for arbitrary WGSL.
 * Weighted GLSL preserves signed linear radiance through fog and only clamps
 * it to [-32,32] at accumulation.
 */
export function composeWeightedWgslFragment(
  vertex: string, fragment: string, features: ProgramFeatures, phase: WeightedWgslPhase,
  fragmentTextureCount: number
): string {
  if ((phase !== "accumulation" && phase !== "revealage") || features.target !== "wgsl"
    || features.pass !== "forward" || features.alphaMode !== "blend"
    || (features.lighting !== "unlit" && features.lighting !== "lit")
    || features.features[PROGRAM_TRANSPARENCY_FEATURE] !== phase
    || features.backgroundCoverage
    || (features.features[PROGRAM_OUTPUT_SRGB_FEATURE] !== undefined && features.features[PROGRAM_OUTPUT_SRGB_FEATURE] !== false)
    || (features.features[PROGRAM_LOG_DEPTH_FEATURE] !== undefined && features.features[PROGRAM_LOG_DEPTH_FEATURE] !== false)
    || (features.features[DEPTH_COVERAGE_FEATURE] !== undefined && features.features[DEPTH_COVERAGE_FEATURE] !== false)) {
    throw new Error("INVALID_WEIGHTED_TRANSPARENCY_WGSL_PREVIEW");
  }
  if (/@group\s*\(\s*2\s*\)/.test(vertex) || /@group\s*\(\s*2\s*\)/.test(fragment)
    || /\b(?:A3dWeightedTransparency|a3dWeighted|u_a3dOpaqueDepth|a3dWeightedDepthRetains|a3dWeightedDepthValueRetains|a3dWeightedWeight|a3dWeightedStraightChannel|a3dWeightedAccumulation|a3dWeightedRevealage)\b/.test(fragment)) {
    throw new Error("WEIGHTED_TRANSPARENCY_WGSL_BINDING_COLLISION");
  }
  // WebGPU guarantees at least 16 sampled textures per stage. One is needed
  // for opaque depth; vertex-only bone/morph textures are excluded by caller.
  if (!Number.isSafeInteger(fragmentTextureCount) || fragmentTextureCount < 0 || fragmentTextureCount >= 16) {
    throw new Error("WEIGHTED_TRANSPARENCY_WGSL_TEXTURE_LIMIT");
  }
  const declaredTextures = fragment.match(/\bvar\s+\w+\s*:\s*texture_\w+/g)?.length ?? 0;
  if (declaredTextures > fragmentTextureCount) throw new Error("WEIGHTED_TRANSPARENCY_WGSL_RESOURCE_MISMATCH");
  const entry = features.lighting === "unlit"
    ? "@fragment fn fs_main(input: FragmentInput) -> @location(0) vec4f {"
    : "@fragment fn fs_main(input: FragmentInput, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {";
  const start = fragment.indexOf(entry);
  const alpha = features.lighting === "unlit" ? "base.a" : "alpha";
  const previousOutput = `  return vec4f(color, ${alpha});`;
  const body = start < 0 ? "" : fragment.slice(start + entry.length);
  // An early return, additional entry point, depth write, or added output
  // could bypass the weighted depth/attachment contract. Do not splice a
  // template whose control flow or output shape has changed.
  if (start < 0 || (fragment.match(/@fragment\b/g)?.length ?? 0) !== 1
    || /@(?:vertex|compute)\b|@builtin\s*\(\s*frag_depth\s*\)/.test(fragment)
    || !body.trimEnd().endsWith(`${previousOutput}\n}`)
    || (body.match(/\breturn\b/g)?.length ?? 0) !== 1) {
    throw new Error("WEIGHTED_TRANSPARENCY_WGSL_TEMPLATE_CHANGED");
  }
  const colorName = features.fog === "none" ? "color" : features.lighting === "unlit" ? "unfogged" : "unfoggedColor";
  const radiance = features.lighting === "unlit"
    ? "base.rgb + material.emissive.rgb * material.emissive.a"
    : "directDiffuse + directSpecular + indirectDiffuse + indirectSpecular + material.emissive.rgb * material.emissive.a";
  const expression = radiance + (features.maps.emissive ? " * emissiveSample" : "");
  let result = replaceExactlyOnce(fragment,
    `  let ${colorName} = max(${expression}, vec3f(0.0));`,
    `  let ${colorName} = ${expression};`);
  const output = phase === "accumulation"
    ? `  return a3dWeightedAccumulation(color, ${alpha}, input.position.z);`
    : `  return a3dWeightedRevealage(${alpha});`;
  result = replaceExactlyOnce(result, previousOutput,
    `  if (!a3dWeightedDepthRetains(input.position)) { discard; }\n${output}`);
  return `${WEIGHTED_DEPTH_WGSL}${phase === "accumulation" ? WEIGHTED_ACCUMULATION_WGSL : WEIGHTED_REVEALAGE_WGSL}\n${result}`;
}
