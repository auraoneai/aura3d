export type GLTFExtensionSupportFamily =
  | "texture"
  | "geometry"
  | "material"
  | "animation"
  | "scene"
  | "compression";

export type GLTFExtensionSupportStatus =
  | "runtime-supported"
  | "decoder-required"
  | "parsed-with-limits"
  | "diagnostic-only"
  | "unsupported";

export interface GLTFExtensionSupportEntry {
  readonly name: string;
  readonly family: GLTFExtensionSupportFamily;
  /** Legacy overall classification; use the stage-specific fields for capability decisions. */
  readonly status: GLTFExtensionSupportStatus;
  /** Whether the loader preserves the extension's data in its asset representation. */
  readonly parseSupport: "supported" | "limited" | "decoder-required" | "unsupported";
  /** Whether runtime resources consume the extension's behavior, rather than only preserving data. */
  readonly runtimeSupport: "supported" | "limited" | "decoder-required" | "unsupported";
  /** Whether rendering reflects the extension's behavior; this is not a visual-parity claim. */
  readonly renderSupport: "supported" | "limited" | "decoder-required" | "unsupported";
  readonly requiredAccepted: boolean;
  readonly publicApi: readonly string[];
  readonly decoder?: "draco" | "meshopt" | "ktx2-basis";
  readonly knownLimits: readonly string[];
}

export interface GLTFExtensionSupportEvaluation {
  readonly schemaVersion: "gltf-extension-support";
  readonly requested: readonly GLTFExtensionSupportEntry[];
  readonly supported: readonly GLTFExtensionSupportEntry[];
  readonly runtimeSupported: readonly GLTFExtensionSupportEntry[];
  readonly parsedWithLimits: readonly GLTFExtensionSupportEntry[];
  readonly diagnosticOnly: readonly GLTFExtensionSupportEntry[];
  readonly unsupportedUsed: readonly string[];
  readonly unsupportedRequired: readonly string[];
  readonly notAcceptedUsed: readonly string[];
  readonly decoderRequired: readonly GLTFExtensionSupportEntry[];
}

// These stages intentionally do not follow the legacy status mechanically. For
// example, preserving a factor does not imply that a shader uses it, and a
// decoder may be needed while loading geometry or only when creating textures.
type StageSupport = Pick<GLTFExtensionSupportEntry, "parseSupport" | "runtimeSupport" | "renderSupport">;
const limitedRender: StageSupport = { parseSupport: "supported", runtimeSupport: "limited", renderSupport: "limited" };
const limitedAll: StageSupport = { parseSupport: "limited", runtimeSupport: "limited", renderSupport: "limited" };
const decodedGeometry: StageSupport = { parseSupport: "decoder-required", runtimeSupport: "decoder-required", renderSupport: "decoder-required" };
const decodedTexture: StageSupport = { parseSupport: "supported", runtimeSupport: "decoder-required", renderSupport: "decoder-required" };
export const GLTF_EXTENSION_SUPPORT_MATRIX: readonly GLTFExtensionSupportEntry[] = [
  entry("EXT_texture_avif", "texture", "runtime-supported", ["GLTFLoader"], ["Image decoding depends on the host's AVIF support."], limitedRender),
  entry("EXT_texture_webp", "texture", "runtime-supported", ["GLTFLoader"], ["Image decoding depends on the host's WebP support."], limitedRender),
  entry("KHR_texture_basisu", "compression", "decoder-required", ["GLTFLoader", "createGLTFRenderResources", "transcodeKTX2BasisTexture"], ["Requires loaders.gl Basis/KTX2 transcoder modules at render-resource creation time."], decodedTexture, "ktx2-basis"),
  entry("KHR_texture_transform", "texture", "runtime-supported", ["GLTFLoader", "TexturedPBRMaterial"], ["Render resources bind TEXCOORD_0 and TEXCOORD_1; higher texture-coordinate sets fall back to TEXCOORD_0."], limitedRender),
  entry("KHR_mesh_quantization", "geometry", "runtime-supported", ["GLTFLoader"], ["Accessor validation is limited to the supported primitive attribute paths."], limitedAll),
  entry("KHR_draco_mesh_compression", "compression", "decoder-required", ["GLTFLoader", "createDracoDecoder"], ["Requires an injected Draco decoder module."], decodedGeometry, "draco"),
  entry("EXT_meshopt_compression", "compression", "decoder-required", ["GLTFLoader", "createMeshoptDecoder"], ["Requires an injected meshoptimizer decoder module."], decodedGeometry, "meshopt"),
  entry("KHR_meshopt_compression", "compression", "decoder-required", ["GLTFLoader", "createMeshoptDecoder"], ["Requires an injected meshoptimizer decoder module."], decodedGeometry, "meshopt"),
  entry("EXT_mesh_gpu_instancing", "geometry", "runtime-supported", ["GLTFLoader", "Renderable.instanceTransforms", "ProductionWebGL2Renderer"], [
    "Loads TRS attributes and the custom _COLOR_0 instance-color convention as linear RGB or RGBA values.",
    "The _COLOR_0 material interpretation is not standardized; other clients require a compatible adapter and alpha follows the material mode.",
    "All other custom per-instance material attributes are unsupported; deferred WebGPU instancing remains unavailable."
  ], limitedAll),
  entry("KHR_lights_punctual", "scene", "runtime-supported", ["GLTFLoader", "Scene", "ProductionWebGL2Renderer"], ["An omitted point or spot light range is currently mapped to 10 rather than an infinite range."], limitedAll),
  entry("KHR_materials_unlit", "material", "parsed-with-limits", ["GLTFLoader", "UnlitMaterial"], ["Unlit materials are mapped to unlit render resources; deformation and full visual conformance remain bounded."], limitedRender),
  entry("KHR_materials_emissive_strength", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["The emissive factor is mapped; full visual conformance remains bounded."], limitedRender),
  entry("KHR_materials_clearcoat", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Clearcoat factors/textures are mapped; full reference BRDF parity still requires visual corpus acceptance."], limitedRender),
  entry("KHR_materials_diffuse_roughness", "material", "parsed-with-limits", ["GLTFLoader", "createGLTFRenderResources", "TexturedPBRMaterial"], ["Draft extension: compatible runtime PBR paths map the factor and texture, but required-extension support and rendered fidelity remain unverified. The draft prose specifies a factor default of zero; its schema specifies one."], limitedRender, undefined, false),
  entry("EXT_materials_bump", "material", "parsed-with-limits", ["GLTFLoader", "createGLTFRenderResources", "TexturedPBRMaterial"], ["Draft extension: compatible runtime PBR paths map the factor and texture, but required-extension support and rendered fidelity remain unverified."], limitedRender, undefined, false),
  entry("KHR_materials_transmission", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Transmission is mapped to the current WebGL2 fallback path; screen-space/refraction parity remains blocked."], limitedRender),
  entry("KHR_materials_diffuse_transmission", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Diffuse transmission factors/textures are mapped; full reference energy parity remains blocked."], limitedRender),
  entry("KHR_materials_volume", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Volume attenuation/thickness are mapped for fallback rendering, not full volumetric path tracing."], limitedRender),
  entry("KHR_materials_ior", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["The index of refraction is mapped; full visual conformance remains bounded."], limitedRender),
  entry("KHR_materials_specular", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Specular factors/textures are mapped; full reference BRDF parity still requires visual corpus acceptance."], limitedRender),
  entry("KHR_materials_sheen", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Sheen factors/textures are mapped; cloth reference parity remains blocked."], limitedRender),
  entry("KHR_materials_anisotropy", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Anisotropy factors/textures are mapped to the aspect-ratio anisotropic-GGX path (authored TBN); same-scene rotation response is browser-proven (tests/browser/anisotropic-rotation-q1.spec.ts, tests/reports/anisotropic-rotation-q1/aniso-rotation.json)."], limitedRender),
  entry("KHR_materials_iridescence", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Iridescence factors/textures are mapped; thin-film reference parity remains under review."], limitedRender),
  entry("KHR_materials_dispersion", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["The dispersion factor is mapped; the fallback uses a transmission tint, while full spectral rendering remains blocked."], limitedRender),
  entry("KHR_materials_pbrSpecularGlossiness", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Spec/gloss assets are converted into the current metallic-roughness runtime contract."], limitedRender),
  entry("KHR_materials_variants", "material", "parsed-with-limits", ["GLTFLoader", "createGLTFRenderResources"], ["Variant mappings and runtime selection are available; authoring/persistence workflow parity remains bounded."], limitedRender),
  entry("KHR_animation_pointer", "animation", "parsed-with-limits", ["GLTFLoader", "GLTFSceneAnimationRuntime", "TypedGLBActor"], [
    "Node TRS/weights, a bounded material-uniform allowlist, and scene-light intensity/color/range tracks can apply at runtime.",
    "KHR_texture_transform offset, scale and rotation tracks can bind only these five core texture slots: pbrMetallicRoughness/baseColorTexture, pbrMetallicRoughness/metallicRoughnessTexture, normalTexture, occlusionTexture and emissiveTexture.",
    "Required texture-transform pointers need an authored target and compatible source/UV set at import. Playback needs a compatible live shader/map, while pending bindings may resolve later; unlit, skinned and specular-glossiness configurations have narrower support.",
    "Material-extension texture transforms can be imported when optional but are not runtime-bound; required pointers to them are rejected.",
    "Imported light tracks address the source definition and update its live node instances; missing lights and unsupported range bindings are diagnosed.",
    "Generic mixer blends that merge distinct source identities or source and manual tracks into the same target are reported missing. Source identity is in-memory only: cloning or serializing tracks or scenes loses it, and reconstructed name tracks use ordinary name matching.",
    "Camera leaves and unmapped material or extension-object leaves remain diagnostic-only when optional and are rejected when required."
  ], limitedAll)
];

/** Recognized loader extensions; inclusion does not imply complete runtime or render support. */
export const GLTF_SUPPORTED_EXTENSION_NAMES = GLTF_EXTENSION_SUPPORT_MATRIX
  .filter((extension) => extension.status !== "diagnostic-only" && extension.status !== "unsupported")
  .map((extension) => extension.name);

export const GLTF_RUNTIME_SUPPORTED_EXTENSION_NAMES = extensionNamesByStatus("runtime-supported");
export const GLTF_DECODER_REQUIRED_EXTENSION_NAMES = extensionNamesByStatus("decoder-required");
export const GLTF_PARSED_WITH_LIMITS_EXTENSION_NAMES = extensionNamesByStatus("parsed-with-limits");
export const GLTF_DIAGNOSTIC_ONLY_EXTENSION_NAMES = extensionNamesByStatus("diagnostic-only");
export const GLTF_REQUIRED_ACCEPTED_EXTENSION_NAMES = GLTF_EXTENSION_SUPPORT_MATRIX
  .filter((extension) => extension.requiredAccepted)
  .map((extension) => extension.name);

export function getGLTFExtensionSupport(name: string): GLTFExtensionSupportEntry {
  return GLTF_EXTENSION_SUPPORT_MATRIX.find((entry) => entry.name === name)
    ?? {
      name,
      family: "scene",
      status: "unsupported",
      parseSupport: "unsupported",
      runtimeSupport: "unsupported",
      renderSupport: "unsupported",
      requiredAccepted: false,
      publicApi: [],
      knownLimits: ["No A3D loader/runtime support is registered for this extension."]
    };
}

export function evaluateGLTFExtensionSupport(
  extensionsUsed: readonly string[] = [],
  extensionsRequired: readonly string[] = []
): GLTFExtensionSupportEvaluation {
  const requested = [...new Set([...extensionsUsed, ...extensionsRequired])].sort();
  const requestedEntries = requested.map((name) => getGLTFExtensionSupport(name));
  const supported = requestedEntries.filter((entry) => entry.status !== "unsupported" && entry.status !== "diagnostic-only");
  const unsupportedUsed = extensionsUsed.filter((name) => getGLTFExtensionSupport(name).status === "unsupported").sort();
  const unsupportedRequired = extensionsRequired.filter((name) => !getGLTFExtensionSupport(name).requiredAccepted).sort();
  const notAcceptedUsed = extensionsUsed.filter((name) => !getGLTFExtensionSupport(name).requiredAccepted).sort();
  return {
    schemaVersion: "gltf-extension-support",
    requested: requestedEntries,
    supported,
    runtimeSupported: supported.filter((entry) => entry.status === "runtime-supported"),
    parsedWithLimits: supported.filter((entry) => entry.status === "parsed-with-limits"),
    diagnosticOnly: requestedEntries.filter((entry) => entry.status === "diagnostic-only"),
    unsupportedUsed,
    unsupportedRequired,
    notAcceptedUsed,
    decoderRequired: supported.filter((entry) => entry.status === "decoder-required")
  };
}

function extensionNamesByStatus(status: GLTFExtensionSupportStatus): readonly string[] {
  return GLTF_EXTENSION_SUPPORT_MATRIX
    .filter((extension) => extension.status === status)
    .map((extension) => extension.name);
}

function entry(
  name: string,
  family: GLTFExtensionSupportFamily,
  status: Exclude<GLTFExtensionSupportStatus, "unsupported">,
  publicApi: readonly string[],
  knownLimits: readonly string[],
  stageSupport: StageSupport,
  decoder?: GLTFExtensionSupportEntry["decoder"],
  requiredAccepted = status !== "diagnostic-only"
): GLTFExtensionSupportEntry {
  return {
    name,
    family,
    status,
    ...stageSupport,
    requiredAccepted,
    publicApi,
    ...(decoder === undefined ? {} : { decoder }),
    knownLimits
  };
}
