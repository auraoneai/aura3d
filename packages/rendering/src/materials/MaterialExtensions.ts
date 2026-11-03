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
  { extension: "clearcoat", support: "bounded", diagnostic: "Clearcoat factor and roughness are modeled; layered multiple scattering remains bounded." },
  { extension: "sheen", support: "bounded", diagnostic: "Sheen color/roughness intent is modeled for fabric review; exact renderer parity requires visual comparison." },
  { extension: "specular", support: "bounded", diagnostic: "Specular factor/color are modeled for material diagnostics and matrix proof." },
  { extension: "transmission", support: "bounded", diagnostic: "Transmission is approximated by the bounded transmission pass; refraction parity is not claimed." },
  { extension: "volume", support: "bounded", diagnostic: "Volume thickness/attenuation are tracked for diagnostics; full volumetric caustics are not claimed." },
  { extension: "ior", support: "bounded", diagnostic: "IOR is tracked and used by bounded Fresnel/transmission response." },
  { extension: "anisotropy", support: "bounded", diagnostic: "Anisotropy uses the aspect-ratio anisotropic-GGX NDF in both primitive (procedural frame) and textured (authored-TBN) paths; same-scene rotation response is browser-proven (tests/browser/anisotropic-rotation-q1.spec.ts, tests/reports/anisotropic-rotation-q1/aniso-rotation.json). Full authored-tangent identity stays bounded." },
  { extension: "iridescence", support: "bounded", diagnostic: "Iridescence factors are tracked for diagnostics; spectral accuracy is not claimed." },
  { extension: "emissive-strength", support: "supported", diagnostic: "Emissive strength is supported through HDR/tone-mapped material proof." },
  { extension: "texture-transform", support: "supported", diagnostic: "Texture transforms are runtime per-slot uniforms; root texTransforms pass-through is browser-proven (tests/browser/root-textured-c1.spec.ts)." },
  { extension: "multi-uv", support: "bounded", diagnostic: "Multiple UV sets are root-bound with per-resource fallback diagnostics when geometry carries no uv1 (cylinder/torus/capsule/custom stay scalar with warnings); bounded by design (tests/browser/root-textured-c1.spec.ts)." }
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
