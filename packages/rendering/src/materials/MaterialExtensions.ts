export type V4MaterialExtension =
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

export interface V4MaterialExtensionState {
  readonly extension: V4MaterialExtension;
  readonly support: "supported" | "bounded" | "unsupported";
  readonly diagnostic: string;
}

export const V4_MATERIAL_EXTENSION_SUPPORT: readonly V4MaterialExtensionState[] = [
  { extension: "clearcoat", support: "bounded", diagnostic: "Clearcoat factor and roughness are modeled; layered multiple scattering remains bounded." },
  { extension: "sheen", support: "bounded", diagnostic: "Sheen color/roughness intent is modeled for fabric review; exact renderer parity requires visual comparison." },
  { extension: "specular", support: "bounded", diagnostic: "Specular factor/color are modeled for material diagnostics and matrix proof." },
  { extension: "transmission", support: "bounded", diagnostic: "Transmission is approximated by the bounded transmission pass; refraction parity is not claimed." },
  { extension: "volume", support: "bounded", diagnostic: "Volume thickness/attenuation are tracked for diagnostics; full volumetric caustics are not claimed." },
  { extension: "ior", support: "bounded", diagnostic: "IOR is tracked and used by bounded Fresnel/transmission response." },
  { extension: "anisotropy", support: "bounded", diagnostic: "Anisotropy intent is tracked for brushed material review; tangent-space parity requires visual evidence." },
  { extension: "iridescence", support: "bounded", diagnostic: "Iridescence factors are tracked for diagnostics; spectral accuracy is not claimed." },
  { extension: "emissive-strength", support: "supported", diagnostic: "Emissive strength is supported through HDR/tone-mapped material proof." },
  { extension: "texture-transform", support: "supported", diagnostic: "Texture transforms are tracked and validated for material slots." },
  { extension: "multi-uv", support: "bounded", diagnostic: "Multiple UV intent is tracked; fallback diagnostics are required when a shader path cannot bind the requested UV set." }
];

export function getV4MaterialExtensionState(extension: V4MaterialExtension): V4MaterialExtensionState {
  return V4_MATERIAL_EXTENSION_SUPPORT.find((entry) => entry.extension === extension)!;
}

export function createV4MaterialExtensionDiagnostics(
  requested: readonly V4MaterialExtension[]
): readonly V4MaterialExtensionState[] {
  return requested.map(getV4MaterialExtensionState);
}
