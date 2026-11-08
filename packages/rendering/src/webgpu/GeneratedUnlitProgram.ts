/** Generated forward unlit variants for native WebGPU draws. */
import { RenderDeviceError, type UniformValue } from "../RenderDevice";
import type { GeneratedPbrDescriptor } from "./GeneratedPbrProgram";
import { DEPTH_COVERAGE_FEATURE, PROGRAM_LOG_DEPTH_FEATURE, depthCoverageUnsupportedReason } from "../program/ProgramFeatures";
import { NATIVE_POINT_WGSL } from "./NativePointShader";
import { ALPHA_TO_COVERAGE_FEATURE, GENERATED_ALPHA_TO_COVERAGE_WGSL, generatedAlphaToCoverage } from "./GeneratedAlphaToCoverage";
import { deriveShaderDataLayout, writeShaderData, type ShaderDataType } from "./ShaderDataLayout";
import { ZERO_TO_ONE_PROJECTION_WGSL, rasterClipDepthWgsl } from "./ProjectionClip";
import { PRD07_FOG_WGSL_FIELDS, packPrd07FogWgslFields, prd07FogWgsl } from "../atmosphere/shaders/fog.wgsl";
import { validatePrd07FogMetadata } from "./GeneratedPbrProgram";

export interface GeneratedUnlitTextureResource {
  readonly uniform: "u_baseColorMap" | "u_emissiveMap" | "u_pointMap";
  readonly samplerBinding: number;
  readonly textureBinding: number;
  readonly dimension: "2d";
  readonly sampleType: "filterable-float";
}

export interface GeneratedUnlitProgram {
  readonly vertex: string;
  readonly fragment: string;
  readonly vertexEntryPoint: "vs_main";
  readonly fragmentEntryPoint: "fs_main";
  readonly materialBinding: { readonly group: 0; readonly binding: 0; readonly byteLength: number };
  readonly frameBinding: { readonly group: 1; readonly binding: 0; readonly minimumByteLength: 304 };
  readonly resources: readonly GeneratedUnlitTextureResource[];
  readonly requiredVertexLocations: readonly number[];
  readonly requiredInstanceLocations: readonly number[];
  /** Original source topology; point quads have triangle raster topology. */
  readonly primitive: "triangles" | "lines" | "points";
  readonly rasterTopology: "triangles" | "lines";
  readonly point: { readonly attenuated: boolean; readonly mapped: boolean; readonly round: boolean } | null;
  /** `prd15.paritySprite`: camera-facing billboard rebuilt in view space (three's SpriteMaterial). */
  readonly sprite: boolean;
  readonly clipping: boolean;
  /** This program emits location 1; the device must validate paired depth writes. */
  readonly writesDepthCoverage: boolean;
  /** Staged per-member loop color; does not authorize batched execution. */
  readonly packedLoopColor: boolean;
  /** Writes ln(d / near) / ln(far / near) as @builtin(frag_depth) (logarithmic frames). */
  readonly logarithmicDepth: boolean;
  /** MASK coverage is written to output alpha for pipeline alpha-to-coverage instead of a hard discard. */
  readonly alphaToCoverage: boolean;
  readonly fog: "none" | "linear" | "exp2" | "height";
  /** Native PRD-07 forward fog (`prd07.fog`), replacing the default fog body. */
  readonly prd07Fog: boolean;
  readonly requiresFloatColorAttachment: boolean;
}

const vec4: ShaderDataType = { kind: "vector", element: "f32", length: 4 };
const mat4: ShaderDataType = { kind: "matrix", columns: 4, rows: 4 };
const fields: readonly { readonly name: string; readonly type: ShaderDataType; readonly wgsl: string }[] = [
  { name: "model", type: mat4, wgsl: "mat4x4f" },
  { name: "geometry", type: mat4, wgsl: "mat4x4f" },
  ...["baseColor", "emissive", "baseUv", "emissiveUv", "mapControls", "alphaControls", "fogColor", "fogParams", "pointRaster"].map(name => ({ name, type: vec4, wgsl: "vec4f" })),
  { name: "clipPlanes", type: { kind: "array", element: vec4, length: 8 }, wgsl: "array<vec4f, 8>" },
  { name: "clipGroups", type: { kind: "array", element: vec4, length: 2 }, wgsl: "array<vec4f, 2>" },
  { name: "clipControl", type: vec4, wgsl: "vec4f" },
  { name: "packedLoopColor", type: vec4, wgsl: "vec4f" },
  // Logarithmic frames: u_a3dLogDepthView and (near, far) from u_a3dLogDepthRange.
  { name: "logDepthView", type: mat4, wgsl: "mat4x4f" },
  { name: "logDepthRange", type: vec4, wgsl: "vec4f" },
  // prd15.paritySprite: (u_spriteRotation, u_spriteCenter.xy, u_spriteSizeAttenuation).
  { name: "sprite", type: vec4, wgsl: "vec4f" },
  // PRD-07 forward fog (`prd07.fog`), packed from the u_fog* uniforms of the GLSL chunk.
  ...PRD07_FOG_WGSL_FIELDS.map(({ name, length }) => length
    ? { name, type: { kind: "array", element: vec4, length } as ShaderDataType, wgsl: `array<vec4f, ${length}>` }
    : { name, type: vec4, wgsl: "vec4f" })
];

export const GENERATED_UNLIT_MATERIAL_LAYOUT = deriveShaderDataLayout({ kind: "struct", fields: fields.map(({ name, type }) => ({ name, type })) }, "wgsl-uniform");
export const GENERATED_UNLIT_MATERIAL_OFFSETS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(GENERATED_UNLIT_MATERIAL_LAYOUT.members!.map(({ name, offset }) => [name, offset]))
);

const MATERIAL = `struct GeneratedUnlitMaterial {\n${fields.map(({ name, wgsl }) => `  ${name}: ${wgsl},`).join("\n")}\n};
@group(0) @binding(0) var<uniform> material: GeneratedUnlitMaterial;`;
// Matches the existing AuraFrame buffer bound by ForwardPass.
const FRAME = `struct AuraFrame {
  view: mat4x4f, projection: mat4x4f, viewProjection: mat4x4f, previousViewProjection: mat4x4f,
  cameraPositionNear: vec4f, resolutionFarTime: vec4f, exposureFlags: vec4f,
};
@group(1) @binding(0) var<uniform> frame: AuraFrame;`;

const CLIPPING = `fn generatedUnlitClipRetains(world: vec3f, local: vec3f) -> bool {
  for (var group = 0u; group < 2u; group += 1u) {
    if (f32(group) >= material.clipControl.x) { break; }
    let params = material.clipGroups[group];
    let point = select(world, local, params.w > 0.5);
    let anyMode = params.z > 0.5;
    var keep = !anyMode;
    for (var plane = 0u; plane < u32(params.y); plane += 1u) {
      let inside = dot(material.clipPlanes[u32(params.x) + plane], vec4f(point, 1.0)) >= 0.0;
      if (anyMode) { keep = keep || inside; } else { keep = keep && inside; }
    }
    if (!keep) { return false; }
  }
  return true;
}`;

/** Same encoding as the WebGL2 generated programs (see GeneratedPbrProgram). */
const LOG_DEPTH = `fn generatedUnlitLogFragmentDepth(world: vec3f) -> f32 {
  let distance = -(material.logDepthView * vec4f(world, 1.0)).z;
  let range = material.logDepthRange.xy;
  return clamp(log(max(distance, range.x) / range.x) / log(range.y / range.x), 0.0, 1.0);
}`;

const MAP_UV = `fn generatedUnlitMapUv(uv: vec2f, transform: vec4f, angle: f32) -> vec2f {
  let p = uv * transform.zw; let c = cos(angle); let s = sin(angle);
  return vec2f(c * p.x - s * p.y, s * p.x + c * p.y) + transform.xy;
}`;

const OUTPUT = `fn generatedUnlitEncodeOutput(linear: vec3f) -> vec3f {
  let c = max(linear, vec3f(0.0)) / 0.6;
  let v = vec3f(dot(vec3f(0.59719, 0.35458, 0.04823), c), dot(vec3f(0.076, 0.90834, 0.01566), c), dot(vec3f(0.0284, 0.13383, 0.83777), c));
  let fit = ((v + vec3f(0.0245786)) * v - vec3f(0.000090537)) / ((0.983729 * v + vec3f(0.432951)) * v + vec3f(0.238081));
  let display = clamp(vec3f(dot(vec3f(1.60475, -0.53108, -0.07367), fit), dot(vec3f(-0.10208, 1.10813, -0.00605), fit), dot(vec3f(-0.00327, -0.07276, 1.07602), fit)), vec3f(0.0), vec3f(1.0));
  return select(display * 12.92, 1.055 * pow(display, vec3f(1.0 / 2.4)) - vec3f(0.055), display >= vec3f(0.0031308));
}`;

/**
 * three's SpriteMaterial vertex program, as the GLSL `prd15.paritySprite` chunk: the quad's raw xy is offset by the
 * anchor, scaled by the model's x/y axis lengths, rotated in the screen plane and added to the view-space centre.
 * sizeAttenuation off scales by -viewZ under perspective so the sprite keeps a constant screen fraction.
 * `world` is the sprite centre (fog and the world varying read it, as on WebGL2).
 */
function SPRITE_VERTEX(instanced: boolean): string {
  return `let spriteCenterWorld = material.model * ${instanced ? "mat4x4f(instance0, instance1, instance2, instance3) * " : ""}vec4f(0.0, 0.0, 0.0, 1.0);
  var spriteView = frame.view * vec4f(spriteCenterWorld.xyz, 1.0);
  var spriteScale = vec2f(length(material.model[0].xyz), length(material.model[1].xyz));
  if (material.sprite.w < 0.5 && frame.projection[2][3] < -0.5) { spriteScale = spriteScale * -spriteView.z; }
  let spriteAligned = (position.xy - (material.sprite.yz - vec2f(0.5))) * spriteScale;
  let spriteCos = cos(material.sprite.x); let spriteSin = sin(material.sprite.x);
  spriteView = vec4f(spriteView.xy + vec2f(spriteCos * spriteAligned.x - spriteSin * spriteAligned.y, spriteSin * spriteAligned.x + spriteCos * spriteAligned.y), spriteView.zw);
  let world = vec4f(spriteCenterWorld.xyz, 1.0);
  let clip = frame.projection * spriteView;`;
}

function unsupported(field: string, detail: string): never {
  throw new RenderDeviceError(`Generated WebGPU unlit does not support ${detail}`, "WGSL_PROGRAM_MISSING", { field });
}

/** The producer supplies structural axes and the actually emitted contributors. */
export function createGeneratedUnlitProgram(descriptor: GeneratedPbrDescriptor): GeneratedUnlitProgram {
  const f = descriptor.features;
  if (!f || f.pass !== "forward" || f.lighting !== "unlit") unsupported("pass", "anything except forward unlit materials");
  const depthCoverageIssue = depthCoverageUnsupportedReason(f);
  if (depthCoverageIssue) unsupported(`features.${DEPTH_COVERAGE_FEATURE}`, depthCoverageIssue);
  const writesDepthCoverage = f.features[DEPTH_COVERAGE_FEATURE] === true;
  const primitive = f.features["a3d.nativePrimitive"];
  if (primitive !== "triangles" && primitive !== "lines" && primitive !== "points") unsupported("primitive", `primitive ${String(primitive)}`);
  const isPoint = primitive === "points";
  if (f.drawId || (f as typeof f & { graph?: unknown }).graph || f.skinning || f.morph) unsupported("vertex", "draw IDs, graphs, skinning or morphs");
  if (f.instancing && (typeof f.instancing.color !== "boolean" ||
    (f.instancing.emissive !== undefined && typeof f.instancing.emissive !== "boolean") || f.instancing.emissive === true)) {
    unsupported("instancing", "invalid or emissive instance inputs");
  }
  if (isPoint && f.instancing) unsupported("instancing", "instanced point quads");
  if (f.backgroundCoverage || f.extensions.length || descriptor.activeExtensions.length) unsupported("material", "coverage attachments or extension lobes");
  if (!["opaque", "mask", "blend"].includes(f.alphaMode)) unsupported("alphaMode", `alpha mode ${String(f.alphaMode)}`);
  if (!["none", "linear", "exp2", "height"].includes(f.fog)) unsupported("fog", `fog ${f.fog}`);
  for (const [name, map] of Object.entries(f.maps)) {
    if (map && (name !== "baseColor" && name !== "emissive" || (map.uvSet !== 0 && map.uvSet !== 1))) unsupported(`maps.${name}`, `map ${name}`);
  }
  const allowedFeatures = new Set(["a3d.nativePrimitive", "a3d.clipping", "a3d.output.srgb", "a3d.packedLoopColor", "prd02.ibl", "prd02.shadowFilter", "prd03.indirectFraction", ALPHA_TO_COVERAGE_FEATURE, DEPTH_COVERAGE_FEATURE, PROGRAM_LOG_DEPTH_FEATURE, "prd07.fog", ...(isPoint ? ["prd15.parityPoints"] : primitive === "triangles" ? ["prd15.paritySprite"] : [])]);
  for (const [name, value] of Object.entries(f.features)) {
    if (value !== false && !allowedFeatures.has(name)) unsupported(`features.${name}`, `feature ${name}`);
    if ((name === "a3d.clipping" || name === "a3d.output.srgb" || name === "a3d.packedLoopColor" || name === PROGRAM_LOG_DEPTH_FEATURE) && typeof value !== "boolean") unsupported(`features.${name}`, `invalid ${name}`);
  }
  const logDepth = f.features[PROGRAM_LOG_DEPTH_FEATURE] === true;
  const active = new Map<string, string | number | boolean>();
  for (const feature of descriptor.activeFeatures) {
    if (active.has(feature.id) || !["prd02.ibl", "prd02.shadowFilter", "prd03.indirectFraction", "a3d.packedLoopColor", ALPHA_TO_COVERAGE_FEATURE, "prd07.fog", ...(isPoint ? ["prd15.parityPoints"] : primitive === "triangles" ? ["prd15.paritySprite"] : [])].includes(feature.id)
      || f.features[feature.id] !== feature.value) unsupported("activeFeatures", `contributor ${feature.id}`);
    active.set(feature.id, feature.value);
  }
  const ibl = active.has("prd02.ibl"), fraction = active.has("prd03.indirectFraction");
  const packedLoopColor = active.get("a3d.packedLoopColor") === true;
  if ((active.has("a3d.packedLoopColor") && !packedLoopColor) || (f.features["a3d.packedLoopColor"] === true) !== packedLoopColor) unsupported("features.a3d.packedLoopColor", "inactive packed member color");
  if (packedLoopColor && (f.alphaMode !== "opaque" || f.instancing || isPoint)) unsupported("features.a3d.packedLoopColor", "packed member color with nonopaque, instanced or point draws");
  const pointValue = active.get("prd15.parityPoints");
  if (pointValue !== undefined && (typeof pointValue !== "number" || !Number.isInteger(pointValue) || pointValue < 1 || pointValue > 7)) {
    unsupported("activeFeatures.prd15.parityPoints", "invalid point feature bits");
  }
  const inactivePointValue = f.features["prd15.parityPoints"];
  if (isPoint && inactivePointValue !== undefined && inactivePointValue !== false && pointValue === undefined) {
    unsupported("features.prd15.parityPoints", "inactive point feature metadata");
  }
  const pointBits = typeof pointValue === "number" ? pointValue : 0;
  const point = isPoint ? { attenuated: (pointBits & 1) !== 0, mapped: (pointBits & 2) !== 0, round: (pointBits & 4) !== 0 } : null;
  if ((ibl && active.get("prd02.ibl") !== true) || (fraction && active.get("prd03.indirectFraction") !== "indirectFraction")
    || descriptor.lighting.iblReplacesIndirect !== (descriptor.lighting.compilerLightingConjunction && ibl)) unsupported("lighting", "inconsistent contributor metadata");
  const prd07Fog = validatePrd07FogMetadata(descriptor, active, unsupported);
  const clipping = f.features["a3d.clipping"] === true;
  const sprite = active.has("prd15.paritySprite");
  if ((sprite && active.get("prd15.paritySprite") !== true) || (!sprite && f.features["prd15.paritySprite"] !== undefined && f.features["prd15.paritySprite"] !== false)) {
    unsupported("features.prd15.paritySprite", "inconsistent prd15.paritySprite metadata");
  }
  // WebGL2 rebuilds clipped sprite positions with CPU inverses (u_a3dSpriteViewToWorld); the native path has no twin.
  if (sprite && clipping) unsupported("features.prd15.paritySprite", "clipped billboard sprites");
  const outputSrgb = f.features["a3d.output.srgb"] === true;
  // As on WebGL2, alpha-to-coverage draws keep coverage alpha and skip the indirect-fraction tag.
  const alphaToCoverage = generatedAlphaToCoverage(active, f, isPoint || writesDepthCoverage, unsupported);
  const baseMap = f.maps.baseColor, emissiveMap = f.maps.emissive;
  const uv0 = baseMap?.uvSet === 0 || emissiveMap?.uvSet === 0;
  const uv1 = baseMap?.uvSet === 1 || emissiveMap?.uvSet === 1;
  const expected: Readonly<Record<string, boolean>> = {
    A3D_GENERATED_PROGRAM: true, A3D_LIT: false, A3D_CLIPPING: clipping, A3D_DEPTH_COVERAGE: writesDepthCoverage, A3D_LOG_DEPTH: logDepth,
    A3D_PRD04_ALPHA_TO_COVERAGE: alphaToCoverage, ALPHA_TO_COVERAGE: alphaToCoverage,
    USE_INSTANCING: Boolean(f.instancing), USE_INSTANCING_COLOR: Boolean(f.instancing?.color), USE_INSTANCING_EMISSIVE: false,
    VERTEX_COLORS: f.vertexColors, USE_BASE_COLOR_MAP: Boolean(baseMap), USE_BASE_COLOR_MAP_UV1: baseMap?.uvSet === 1,
    USE_BASE_COLOR_MAP_TRANSFORM: Boolean(baseMap?.transform), USE_EMISSIVE_MAP: Boolean(emissiveMap),
    USE_EMISSIVE_MAP_UV1: emissiveMap?.uvSet === 1, USE_EMISSIVE_MAP_TRANSFORM: Boolean(emissiveMap?.transform),
    A3D_NEED_UV0: uv0, A3D_NEED_UV1: uv1, A3D_NEED_NORMAL: f.flatShading,
    ALPHA_MASK: f.alphaMode === "mask", ALPHA_BLEND: f.alphaMode === "blend", DOUBLE_SIDED: f.doubleSided,
    FLAT_SHADING: f.flatShading, DIFFUSE_BURLEY: f.diffuseModel === "burley", SPECULAR_AA: f.specularAntialiasing,
    FOG_LINEAR: f.fog === "linear", FOG_EXP2: f.fog === "exp2" || f.fog === "height", FOG_HEIGHT: f.fog === "height",
    A3D_FOG: prd07Fog !== undefined, A3D_FOG_FROXEL_TIER: prd07Fog === "volumetric",
    A3D_PRD02_IBL: ibl, A3D_INDIRECT_FRACTION: fraction, A3D_PACKED_LOOP_COLOR: packedLoopColor,
    ENVMAP_TYPE_EQUIRECT: f.environment === "equirect", ENVMAP_TYPE_CUBE_UV: f.environment === "pmrem-cube",
    A3D_ENV_SAMPLE: f.environment !== "none", LIGHTS_CLUSTERED: f.lights.clustered, LIGHT_HEMISPHERE: f.lights.hemisphere,
    SHADOW_CONTACT: f.shadows.contact, A3D_PARITY_POINTS: pointBits !== 0, A3D_PARITY_SPRITE: sprite,
    A3D_PARITY_POINT_ATTENUATION: Boolean(point?.attenuated), A3D_PARITY_POINT_MAP: Boolean(point?.mapped), A3D_PARITY_POINT_ROUND: Boolean(point?.round)
  };
  for (const [name, present] of Object.entries(expected)) {
    const defined = Object.prototype.hasOwnProperty.call(descriptor.defines, name);
    if (defined !== present || (present && descriptor.defines[name] !== true && descriptor.defines[name] !== 1)) {
      unsupported(`defines.${name}`, `inconsistent ${name} define`);
    }
  }
  const allowedDefines = new Set([...Object.keys(expected), "A3D_NUM_DIRECT_LIGHTS", "NUM_DIR_LIGHTS", "NUM_POINT_LIGHTS", "NUM_SPOT_LIGHTS", "NUM_RECT_LIGHTS", "NUM_SHADOW_CASCADES", "NUM_LOCAL_SHADOWS", "SHADOW_PCF_TAPS", "A3D_SHADOW_FILTER"]);
  for (const name of Object.keys(descriptor.defines)) if (!allowedDefines.has(name)) unsupported(`defines.${name}`, `define ${name}`);
  const tagged = fraction && f.alphaMode !== "blend" && !alphaToCoverage;
  if (tagged && outputSrgb) unsupported("features.a3d.output.srgb", "indirect-fraction tags on direct output");

  const resources: GeneratedUnlitTextureResource[] = [];
  if (baseMap) resources.push({ uniform: "u_baseColorMap", samplerBinding: 1, textureBinding: 2, dimension: "2d", sampleType: "filterable-float" });
  if (emissiveMap) resources.push({ uniform: "u_emissiveMap", samplerBinding: 3, textureBinding: 4, dimension: "2d", sampleType: "filterable-float" });
  if (point?.mapped) resources.push({ uniform: "u_pointMap", samplerBinding: 5, textureBinding: 6, dimension: "2d", sampleType: "filterable-float" });
  const vertexInput = ["@location(0) position: vec3f", ...(uv0 ? ["@location(2) uv: vec2f"] : []), ...(point ? ["@location(3) pointCorner: vec2f"] : []), ...(uv1 ? ["@location(7) uv1: vec2f"] : []),
    ...(f.vertexColors ? ["@location(4) color: vec4f"] : []), ...(f.instancing ? ["@location(8) instance0: vec4f", "@location(9) instance1: vec4f", "@location(10) instance2: vec4f", "@location(11) instance3: vec4f"] : []),
    ...(f.instancing?.color ? ["@location(12) instanceColor: vec4f"] : [])].join(", ");
  const varyings = `@location(0) ${point ? "@interpolate(flat) " : ""}world: vec3f, ${clipping ? `@location(1) ${point ? "@interpolate(flat) " : ""}local: vec3f,` : ""} ${uv0 ? "@location(2) uv: vec2f," : ""} ${uv1 ? "@location(3) uv1: vec2f," : ""} ${f.vertexColors ? "@location(4) color: vec4f," : ""} ${f.instancing?.color ? "@location(5) instanceColor: vec4f," : ""} ${point ? "@location(6) @interpolate(linear) pointCoord: vec2f, @location(7) pointInvalid: f32," : ""}`;
  const vertex = `${MATERIAL}\n${FRAME}\n${ZERO_TO_ONE_PROJECTION_WGSL}\n${point ? NATIVE_POINT_WGSL : ""}
struct VertexOutput { @builtin(position) position: vec4f, ${varyings} };
@vertex fn vs_main(${vertexInput}) -> VertexOutput {
  var output: VertexOutput;
  let local = material.geometry * vec4f(position, 1.0);
  ${sprite ? SPRITE_VERTEX(Boolean(f.instancing)) : `let world = material.model * ${f.instancing ? "mat4x4f(instance0, instance1, instance2, instance3) * " : ""}local;
  let clip = frame.viewProjection * world;`}
  ${point ? `var expanded = A3dPointExpansion(vec4f(2.0, 2.0, 2.0, 1.0), 1.0);
  if (a3dPointCanExpand(clip, ${point.attenuated}) && a3dPointCenterInSceneClip(clip)) {
    let pixels = a3dPointPixelSize(material.pointRaster.x, frame.resolutionFarTime.y, clip.w, ${point.attenuated});
    expanded = a3dPointExpandSceneClip(clip, pointCorner, pixels, material.pointRaster.yz);
  }
  output.position = vec4f(expanded.clip.xy, ${rasterClipDepthWgsl("expanded.clip")}, expanded.clip.w);
  output.pointCoord = pointCorner; output.pointInvalid = expanded.invalid;` : `output.position = vec4f(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);`}
  output.world = world.xyz;
  ${clipping ? "output.local = local.xyz;" : ""}
  ${uv0 ? "output.uv = uv;" : ""} ${uv1 ? "output.uv1 = uv1;" : ""}
  ${f.vertexColors ? "output.color = color;" : ""} ${f.instancing?.color ? "output.instanceColor = instanceColor;" : ""}
  return output;
}`;
  const textureDecls = resources.map(resource => `@group(0) @binding(${resource.samplerBinding}) var ${resource.uniform}Sampler: sampler;\n@group(0) @binding(${resource.textureBinding}) var ${resource.uniform}Texture: texture_2d<f32>;`).join("\n");
  const uv = (set: 0 | 1): string => set === 0 ? "input.uv" : "input.uv1";
  const fragment = `${MATERIAL}\n${FRAME}\n${textureDecls}\n${point ? NATIVE_POINT_WGSL : ""}\n${clipping ? CLIPPING : ""}\n${logDepth ? LOG_DEPTH : ""}\n${baseMap || emissiveMap ? MAP_UV : ""}\n${outputSrgb ? OUTPUT : ""}\n${prd07Fog ? prd07FogWgsl() : ""}
struct FragmentInput { @builtin(position) position: vec4f, ${varyings} };
${writesDepthCoverage ? "struct GeneratedDepthCoverageOutput { @location(0) color: vec4f, @location(1) depthCoverage: vec4f, };" : ""}
${logDepth && !writesDepthCoverage ? "struct GeneratedLogDepthOutput { @location(0) color: vec4f, @builtin(frag_depth) depth: f32, };" : ""}
@fragment fn fs_main(input: FragmentInput) -> ${writesDepthCoverage ? "GeneratedDepthCoverageOutput" : logDepth ? "GeneratedLogDepthOutput" : "@location(0) vec4f"} {
  let base = material.baseColor${f.vertexColors ? " * input.color" : ""}${f.instancing?.color ? " * input.instanceColor" : ""}${baseMap ? ` * textureSample(u_baseColorMapTexture, u_baseColorMapSampler, generatedUnlitMapUv(${uv(baseMap.uvSet)}, material.baseUv, material.mapControls.x))` : ""}${point?.mapped ? " * textureSample(u_pointMapTexture, u_pointMapSampler, input.pointCoord)" : ""}${packedLoopColor ? " * material.packedLoopColor" : ""};
  ${emissiveMap ? `let emissiveSample = textureSample(u_emissiveMapTexture, u_emissiveMapSampler, generatedUnlitMapUv(${uv(emissiveMap.uvSet)}, material.emissiveUv, material.mapControls.y)).rgb;` : ""}
  ${point ? "if (input.pointInvalid > 0.0) { discard; }" : ""}
  ${point?.round ? "if (!a3dPointInRoundFootprint(input.pointCoord)) { discard; }" : ""}
  ${alphaToCoverage ? GENERATED_ALPHA_TO_COVERAGE_WGSL("base.a", "material.alphaControls.x") : f.alphaMode === "mask" ? "if (base.a < material.alphaControls.x) { discard; }" : ""}
  let ${f.fog === "none" && !prd07Fog ? "color" : "unfogged"} = max(base.rgb + material.emissive.rgb * material.emissive.a${emissiveMap ? " * emissiveSample" : ""}, vec3f(0.0));
  ${prd07Fog ? "let color = a3dPrd07ApplyFog(unfogged, input.world);" : ""}
  ${f.fog !== "none" && !prd07Fog ? `let fogDepth = select(input.position.z, 1.0 - input.position.z, frame.projection[2][2] > 0.0) / input.position.w;
  ${f.fog === "linear" ? "let fogAmount = clamp((fogDepth - material.fogParams.x) / max(material.fogParams.y - material.fogParams.x, 0.0001), 0.0, 1.0);" : `let density = material.fogParams.z${f.fog === "height" ? " * exp(-max(input.world.y, 0.0) * material.fogParams.w)" : ""}; let distance = density * fogDepth; let fogAmount = clamp(1.0 - exp(-distance * distance), 0.0, 1.0);`}
  let color = mix(unfogged, material.fogColor.rgb, fogAmount);` : ""}
  ${clipping ? "if (!generatedUnlitClipRetains(input.world, input.local)) { discard; }" : ""}
  ${writesDepthCoverage
    ? `return GeneratedDepthCoverageOutput(vec4f(color, 1.0), vec4f(1.0, 0.0, 0.0, 0.0));` /* depth coverage rejects logarithmic depth (depthCoverageUnsupportedReason) */
    : logDepth
      ? `return GeneratedLogDepthOutput(vec4f(${outputSrgb ? "generatedUnlitEncodeOutput(color)" : "color"}, ${tagged ? "2.0" : f.alphaMode === "blend" ? "base.a" : alphaToCoverage ? "a3dCoverage" : "1.0"}), generatedUnlitLogFragmentDepth(input.world));`
      : `return vec4f(${outputSrgb ? "generatedUnlitEncodeOutput(color)" : "color"}, ${tagged ? "2.0" : f.alphaMode === "blend" ? "base.a" : alphaToCoverage ? "a3dCoverage" : "1.0"});`}
}`;
  return Object.freeze<GeneratedUnlitProgram>({ vertex, fragment, vertexEntryPoint: "vs_main", fragmentEntryPoint: "fs_main",
    materialBinding: { group: 0, binding: 0, byteLength: GENERATED_UNLIT_MATERIAL_LAYOUT.size },
    frameBinding: { group: 1, binding: 0, minimumByteLength: 304 }, resources,
    requiredVertexLocations: [0, ...(uv0 ? [2] : []), ...(point ? [3] : []), ...(f.vertexColors ? [4] : []), ...(uv1 ? [7] : [])],
    requiredInstanceLocations: f.instancing ? [8, 9, 10, 11, ...(f.instancing.color ? [12] : [])] : [],
    primitive, rasterTopology: isPoint ? "triangles" : primitive, point, sprite, clipping, packedLoopColor, writesDepthCoverage, logarithmicDepth: logDepth, alphaToCoverage,
    fog: f.fog as GeneratedUnlitProgram["fog"], prd07Fog: prd07Fog !== undefined, requiresFloatColorAttachment: tagged });
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
function numbers(uniforms: ReadonlyMap<string, UniformValue>, name: string, length: number, fallback: readonly number[]): number[] {
  const value = uniforms.get(name);
  if (value === undefined) return [...fallback];
  if (typeof value === "number" && length === 1 && Number.isFinite(value) && Number.isFinite(Math.fround(value))) return [value];
  if (Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView))) {
    const result = Array.from(value as ArrayLike<number>);
    if (result.length === length && result.every(number => Number.isFinite(number) && Number.isFinite(Math.fround(number)))) return result;
  }
  throw new RenderDeviceError(`Invalid ${name}`, "WEBGPU_UNLIT_UNIFORM_INVALID", { name });
}

export function packGeneratedUnlitMaterialUniforms(uniforms: ReadonlyMap<string, UniformValue>, packedLoopColor = false): Uint8Array {
  const memberValue = packedLoopColor ? uniforms.get("u_a3dPackedLoopColor") : undefined;
  if (packedLoopColor && memberValue === undefined) throw new RenderDeviceError("Missing u_a3dPackedLoopColor", "WEBGPU_UNLIT_UNIFORM_INVALID", { name: "u_a3dPackedLoopColor" });
  const memberColor = memberValue === undefined ? [1, 1, 1, 1] : numbers(new Map([["u_a3dPackedLoopColor", memberValue]]), "u_a3dPackedLoopColor", 4, [1, 1, 1, 1]);
  const scalar = (name: string, fallback = 0): number => numbers(uniforms, name, 1, [fallback])[0]!;
  const uv = (name: string): number[] => [...numbers(uniforms, `${name}Offset`, 2, [0, 0]), ...numbers(uniforms, `${name}Scale`, 2, [1, 1])];
  const planes = numbers(uniforms, "u_a3dClipPlanes", 32, new Array<number>(32).fill(0));
  const groups = numbers(uniforms, "u_a3dClipGroups", 8, new Array<number>(8).fill(0));
  return writeShaderData(GENERATED_UNLIT_MATERIAL_LAYOUT, {
    model: numbers(uniforms, "u_modelMatrix", 16, IDENTITY), geometry: numbers(uniforms, "u_geometryMatrix", 16, IDENTITY),
    baseColor: numbers(uniforms, "u_baseColor", 4, [1, 1, 1, 1]),
    emissive: [...numbers(uniforms, "u_emissiveColor", 3, [0, 0, 0]), scalar("u_emissiveStrength")],
    baseUv: uv("u_baseColorTexture"), emissiveUv: uv("u_emissiveTexture"),
    mapControls: [scalar("u_baseColorTextureRotation"), scalar("u_emissiveTextureRotation"), 0, 0],
    alphaControls: [scalar("u_alphaCutoff"), 0, 0, 0],
    fogColor: [...numbers(uniforms, "u_fogColor", 3, [0, 0, 0]), 0],
    fogParams: [...numbers(uniforms, "u_fogRange", 2, [0, 1]), scalar("u_fogDensity"), scalar("u_fogHeightFalloff")],
    pointRaster: [scalar("u_pointSize", 1), ...numbers(uniforms, "u_a3dPointViewport", 2, [1, 1]), 0],
    clipPlanes: Array.from({ length: 8 }, (_, index) => planes.slice(index * 4, index * 4 + 4)),
    clipGroups: Array.from({ length: 2 }, (_, index) => groups.slice(index * 4, index * 4 + 4)),
    clipControl: [scalar("u_a3dClipGroupCount"), 0, 0, 0],
    packedLoopColor: memberColor,
    logDepthView: numbers(uniforms, "u_a3dLogDepthView", 16, IDENTITY),
    logDepthRange: [...numbers(uniforms, "u_a3dLogDepthRange", 2, [1, 2]), 0, 0],
    sprite: [scalar("u_spriteRotation"), ...numbers(uniforms, "u_spriteCenter", 2, [0.5, 0.5]), scalar("u_spriteSizeAttenuation", 1)],
    // Only a program that selected the stock prd07.fog feature receives u_fogMode (its bindUniforms always writes it).
    ...packPrd07FogWgslFields(uniforms, (name, length, fallback) => uniforms.has("u_fogMode") ? numbers(uniforms, name, length, fallback) : [...fallback])
  });
}
