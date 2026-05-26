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
  readonly status: GLTFExtensionSupportStatus;
  readonly requiredAccepted: boolean;
  readonly publicApi: readonly string[];
  readonly decoder?: "draco" | "meshopt" | "ktx2-basis";
  readonly knownLimits: readonly string[];
}

export interface GLTFExtensionSupportEvaluation {
  readonly schemaVersion: "gltf-extension-support-v1";
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

export const GLTF_EXTENSION_SUPPORT_MATRIX: readonly GLTFExtensionSupportEntry[] = [
  entry("EXT_texture_avif", "texture", "runtime-supported", ["GLTFLoader"], []),
  entry("EXT_texture_webp", "texture", "runtime-supported", ["GLTFLoader"], []),
  entry("KHR_texture_basisu", "compression", "decoder-required", ["GLTFLoader", "createGLTFRenderResources", "transcodeKTX2BasisTexture"], ["Requires loaders.gl Basis/KTX2 transcoder modules at render-resource creation time."], "ktx2-basis"),
  entry("KHR_texture_transform", "texture", "runtime-supported", ["GLTFLoader", "TexturedPBRMaterial"], []),
  entry("KHR_mesh_quantization", "geometry", "runtime-supported", ["GLTFLoader"], []),
  entry("KHR_draco_mesh_compression", "compression", "decoder-required", ["GLTFLoader", "createDracoDecoder"], ["Requires an injected Draco decoder module."], "draco"),
  entry("EXT_meshopt_compression", "compression", "decoder-required", ["GLTFLoader", "createMeshoptDecoder"], ["Requires an injected meshoptimizer decoder module."], "meshopt"),
  entry("KHR_meshopt_compression", "compression", "decoder-required", ["GLTFLoader", "createMeshoptDecoder"], ["Requires an injected meshoptimizer decoder module."], "meshopt"),
  entry("EXT_mesh_gpu_instancing", "geometry", "runtime-supported", ["GLTFLoader", "Renderable.instanceTransforms", "ProductionWebGL2Renderer"], ["Supports TRS instance attributes; custom per-instance material attributes remain out of scope."]),
  entry("KHR_lights_punctual", "scene", "runtime-supported", ["GLTFLoader", "Scene", "ProductionWebGL2Renderer"], []),
  entry("KHR_materials_unlit", "material", "runtime-supported", ["GLTFLoader", "UnlitMaterial"], []),
  entry("KHR_materials_emissive_strength", "material", "runtime-supported", ["GLTFLoader", "TexturedPBRMaterial"], []),
  entry("KHR_materials_clearcoat", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Clearcoat factors/textures are mapped; full reference BRDF parity still requires visual corpus acceptance."]),
  entry("KHR_materials_transmission", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Transmission is mapped to the current WebGL2 fallback path; screen-space/refraction parity remains blocked."]),
  entry("KHR_materials_diffuse_transmission", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Diffuse transmission factors/textures are mapped; full reference energy parity remains blocked."]),
  entry("KHR_materials_volume", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Volume attenuation/thickness are mapped for fallback rendering, not full volumetric path tracing."]),
  entry("KHR_materials_ior", "material", "runtime-supported", ["GLTFLoader", "TexturedPBRMaterial"], []),
  entry("KHR_materials_specular", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Specular factors/textures are mapped; full reference BRDF parity still requires visual corpus acceptance."]),
  entry("KHR_materials_sheen", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Sheen factors/textures are mapped; cloth reference parity remains blocked."]),
  entry("KHR_materials_anisotropy", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Anisotropy factors/textures are mapped; tangent-space visual parity remains under review."]),
  entry("KHR_materials_iridescence", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Iridescence factors/textures are mapped; thin-film reference parity remains under review."]),
  entry("KHR_materials_dispersion", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Dispersion factor is preserved for material fallback; spectral dispersion rendering remains blocked."]),
  entry("KHR_materials_pbrSpecularGlossiness", "material", "parsed-with-limits", ["GLTFLoader", "TexturedPBRMaterial"], ["Spec/gloss assets are converted into the current metallic-roughness runtime contract."]),
  entry("KHR_materials_variants", "material", "parsed-with-limits", ["GLTFLoader"], ["Variant mappings are loaded; authoring/persistence workflow parity remains blocked."]),
  entry("KHR_animation_pointer", "animation", "diagnostic-only", ["GLTFLoader"], ["Optional animation pointer channels are reported as unsupported tracks unless promoted into runtime targets."])
];

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
  const supported = requestedEntries.filter((entry) => entry.status !== "unsupported");
  const unsupportedUsed = extensionsUsed.filter((name) => getGLTFExtensionSupport(name).status === "unsupported").sort();
  const unsupportedRequired = extensionsRequired.filter((name) => !getGLTFExtensionSupport(name).requiredAccepted).sort();
  const notAcceptedUsed = extensionsUsed.filter((name) => !getGLTFExtensionSupport(name).requiredAccepted).sort();
  return {
    schemaVersion: "gltf-extension-support-v1",
    requested: requestedEntries,
    supported,
    runtimeSupported: supported.filter((entry) => entry.status === "runtime-supported"),
    parsedWithLimits: supported.filter((entry) => entry.status === "parsed-with-limits"),
    diagnosticOnly: supported.filter((entry) => entry.status === "diagnostic-only"),
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
  decoder?: GLTFExtensionSupportEntry["decoder"]
): GLTFExtensionSupportEntry {
  return {
    name,
    family,
    status,
    requiredAccepted: status !== "diagnostic-only",
    publicApi,
    ...(decoder === undefined ? {} : { decoder }),
    knownLimits
  };
}
