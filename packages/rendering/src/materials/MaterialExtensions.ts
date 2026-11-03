export type ExternalParityMaterialExtension =
  | "clearcoat"
  | "sheen"
  | "specular"
  | "transmission"
  | "volume"
  | "ior"
  | "anisotropy"
  | "iridescence"
  | "emissive-strength"
  | "texture-transform"
  | "multi-uv";

export interface ExternalParityMaterialExtensionState {
  readonly extension: ExternalParityMaterialExtension;
  readonly support: "supported" | "bounded" | "unsupported";
  readonly diagnostic: string;
}

/** Device and geometry facts used to assess a particular material combination. */
export interface MaterialExtensionCombinationOptions {
  readonly backend: "webgl2" | "webgpu";
  readonly extensions: readonly ExternalParityMaterialExtension[];
  /** Number of UV channels used by the material and provided by its geometry. */
  readonly requiredUvSets?: number;
  readonly availableUvSets?: number;
  /** Fragment texture bindings required by this draw and reported by the device. */
  readonly requiredTextureBindings?: number;
  readonly maxTextureBindings?: number;
  /** Whether a scene-color backdrop is available for the transmission pass. */
  readonly transmissionBackdropAvailable?: boolean;
}

export interface MaterialExtensionCombinationDiagnostics {
  readonly backend: "webgl2" | "webgpu";
  readonly support: "supported" | "bounded" | "unsupported";
  readonly extensions: readonly ExternalParityMaterialExtensionState[];
  readonly limitations: readonly string[];
}

export const EXTERNAL_PARITY_MATERIAL_EXTENSION_SUPPORT: readonly ExternalParityMaterialExtensionState[] = [
  { extension: "clearcoat", support: "supported", diagnostic: "Clearcoat factor, roughness and coat normal maps (linear data, per-slot texture transform and UV set, authored TANGENT frame when present) layer over the base with a Fresnel energy split in WebGL2 and WebGPU; inter-layer multiple scattering is not modeled." },
  { extension: "sheen", support: "supported", diagnostic: "Sheen color (sRGB) and roughness (linear) maps with per-slot texture transforms and UV sets layer over the substrate with albedo compensation in WebGL2 and WebGPU, including the independent WebGPU preview under environment, probe, volume and lightmap lighting; visual parity with other renderers is not claimed." },
  { extension: "specular", support: "supported", diagnostic: "Specular factor (linear alpha) and specular color (sRGB) maps with per-slot texture transforms and UV sets drive dielectric F0/F90 in WebGL2 and WebGPU." },
  { extension: "transmission", support: "supported", diagnostic: "Transmission refracts the captured scene color with roughness- and IOR-selected mip blur; the transmission map (linear red, per-slot transform and UV set) scales it in WebGL2 and WebGPU. Caustics and multi-bounce refraction are not modeled." },
  { extension: "volume", support: "supported", diagnostic: "Volume thickness (linear green map, per-slot transform and UV set) and Beer-Lambert attenuation shape transmission in WebGL2 and WebGPU; volumetric caustics and in-volume scattering are not modeled." },
  { extension: "ior", support: "supported", diagnostic: "IOR drives the dielectric Fresnel, transmission refraction and dispersion bands in WebGL2 and WebGPU." },
  { extension: "anisotropy", support: "supported", diagnostic: "Anisotropy uses the aspect-ratio anisotropic-GGX NDF; the anisotropy map (linear RG direction, B strength, per-slot transform and UV set) rotates within the authored TANGENT frame (T Gram-Schmidt against the normal, B = sign(w) * cross(N, T), negated on back faces) whenever geometry carries tangents, otherwise within the UV-derivative frame, in WebGL2 and WebGPU." },
  { extension: "iridescence", support: "supported", diagnostic: "Thin-film iridescence (factor and thickness maps, linear, per-slot transform and UV set) modulates direct and environment Fresnel in WebGL2 and WebGPU; full spectral rendering is not claimed." },
  { extension: "emissive-strength", support: "supported", diagnostic: "Emissive strength is supported through HDR/tone-mapped material proof." },
  { extension: "texture-transform", support: "supported", diagnostic: "Texture transforms are runtime per-slot uniforms; root texTransforms pass-through is browser-proven (tests/browser/root-textured-c1.spec.ts)." },
  { extension: "multi-uv", support: "supported", diagnostic: "Every core and lobe map selects UV0 or UV1 independently in WebGL2 and WebGPU; geometry lacking a required UV channel is reported per draw by analyzeMaterialExtensionCombination and by root per-resource fallback diagnostics." }
];

export function getExternalParityMaterialExtensionState(extension: ExternalParityMaterialExtension): ExternalParityMaterialExtensionState {
  const state = EXTERNAL_PARITY_MATERIAL_EXTENSION_SUPPORT.find((entry) => entry.extension === extension);
  if (!state) throw new RangeError(`Unknown material extension: ${String(extension)}`);
  return state;
}

export function createExternalParityMaterialExtensionDiagnostics(
  requested: readonly ExternalParityMaterialExtension[]
): readonly ExternalParityMaterialExtensionState[] {
  return requested.map(getExternalParityMaterialExtensionState);
}

/**
 * Assess a combination against actual device/geometry limits rather than
 * treating support for each individual lobe as proof that all maps fit.
 * WebGPU remains experimental until the native path is validated. Missing
 * device facts are explicitly reported as bounded, not assumed sufficient.
 */
export function analyzeMaterialExtensionCombination(options: MaterialExtensionCombinationOptions): MaterialExtensionCombinationDiagnostics {
  if (options.backend !== "webgl2" && options.backend !== "webgpu") {
    throw new RangeError(`Unknown material backend: ${String(options.backend)}`);
  }
  for (const [name, value] of [
    ["requiredUvSets", options.requiredUvSets],
    ["availableUvSets", options.availableUvSets],
    ["requiredTextureBindings", options.requiredTextureBindings],
    ["maxTextureBindings", options.maxTextureBindings]
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }

  const extensions = createExternalParityMaterialExtensionDiagnostics(options.extensions);
  const limitations: string[] = [];
  let support: MaterialExtensionCombinationDiagnostics["support"] = "supported";
  const lower = (next: "bounded" | "unsupported", reason: string): void => {
    limitations.push(reason);
    if (next === "unsupported" || support === "supported") support = next;
  };
  for (const state of extensions) {
    if (state.support !== "supported") lower(state.support, `${state.extension}: ${state.diagnostic}`);
  }
  if (options.backend === "webgpu") {
    lower("bounded", "WebGPU physical material support is experimental and depends on the selected native shader variant.");
  }
  if (options.requiredUvSets !== undefined && options.requiredUvSets > 0) {
    if (options.availableUvSets === undefined) {
      lower("bounded", "Geometry UV-channel availability was not supplied.");
    } else if (options.requiredUvSets > options.availableUvSets) {
      lower("unsupported", `Material requires ${options.requiredUvSets} UV channels, but geometry provides ${options.availableUvSets}.`);
    }
  }
  if (options.requiredTextureBindings !== undefined && options.requiredTextureBindings > 0) {
    if (options.maxTextureBindings === undefined) {
      lower("bounded", `${options.backend} texture-binding limit was not supplied.`);
    } else if (options.requiredTextureBindings > options.maxTextureBindings) {
      lower("unsupported", `Material requires ${options.requiredTextureBindings} texture bindings, exceeding the ${options.backend} limit of ${options.maxTextureBindings}.`);
    }
  }
  if (options.extensions.includes("transmission") && options.transmissionBackdropAvailable === false) {
    lower("bounded", "Transmission uses its bounded fallback because the scene-color backdrop is unavailable.");
  }
  return { backend: options.backend, support, extensions, limitations };
}
