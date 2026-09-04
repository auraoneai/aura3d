/**
 * muse3jsparity-PRD P3 — root `material.physical` spec path (package side).
 *
 * `physical` must not be a bare alias of `pbr`. This module gives it its own
 * spec path WITHOUT touching `packages/engine/src/agent-api/index.ts`
 * (HARD RULE):
 *
 * - Explicit clearcoat/sheen/iridescence/anisotropy/transmission/volume/ior
 *   params with three.js-r185-aligned defaults.
 * - Every requested extension maps to its `MaterialExtensions` support-matrix
 *   state (`packages/rendering/src/materials/MaterialExtensions.ts`,
 *   mirrored below with source pinned). Params outside proof emit the matrix
 *   diagnostic — never silent acceptance, never silent rendering.
 * - `pbr` stays the simple path (untouched); docs show when to reach for
 *   `physical` (bridge hunk wires `material.physical = (o) =>
 *   createPhysicalMaterialSpec(o).spec` and routes `.diagnostics` through
 *   `material.capabilityDiagnostics`).
 */

export type PhysicalExtensionId =
  | "clearcoat"
  | "sheen"
  | "iridescence"
  | "anisotropy"
  | "transmission"
  | "volume"
  | "ior"
  | "specular";

export type PhysicalExtensionSupport = "supported" | "bounded" | "unsupported";

export interface PhysicalExtensionMatrixEntry {
  readonly extension: PhysicalExtensionId;
  readonly support: PhysicalExtensionSupport;
  readonly diagnostic: string;
}

/**
 * Mirrors EXTERNAL_PARITY_MATERIAL_EXTENSION_SUPPORT
 * (packages/rendering/src/materials/MaterialExtensions.ts). If that table
 * changes, this one must change with it — enforced by the P3 unit test,
 * which imports BOTH tables and asserts state equality per extension.
 */
export const PHYSICAL_EXTENSION_MATRIX: readonly PhysicalExtensionMatrixEntry[] = [
  { extension: "clearcoat", support: "bounded", diagnostic: "Clearcoat factor and roughness are modeled; layered multiple scattering remains bounded." },
  { extension: "sheen", support: "bounded", diagnostic: "Sheen color/roughness intent is modeled for fabric review; exact renderer parity requires visual comparison." },
  { extension: "specular", support: "bounded", diagnostic: "Specular factor/color are modeled for material diagnostics and matrix proof." },
  { extension: "transmission", support: "bounded", diagnostic: "Transmission is approximated by the bounded transmission pass; refraction parity is not claimed." },
  { extension: "volume", support: "bounded", diagnostic: "Volume thickness/attenuation are tracked for diagnostics; full volumetric caustics are not claimed." },
  { extension: "ior", support: "bounded", diagnostic: "IOR is tracked and used by bounded Fresnel/transmission response." },
  { extension: "anisotropy", support: "bounded", diagnostic: "Anisotropy uses the aspect-ratio anisotropic-GGX NDF in both primitive (procedural frame) and textured (authored-TBN) paths; same-scene rotation response is browser-proven (tests/browser/anisotropic-rotation-q1.spec.ts, tests/reports/anisotropic-rotation-q1/aniso-rotation.json). Full authored-tangent identity stays bounded." },
  { extension: "iridescence", support: "bounded", diagnostic: "Iridescence factors are tracked for diagnostics; spectral accuracy is not claimed." }
];

export interface PhysicalMaterialSpecOptions {
  readonly color?: string;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly metalness?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly sheen?: number;
  readonly sheenColor?: string;
  readonly sheenRoughness?: number;
  readonly iridescence?: number;
  readonly iridescenceIOR?: number;
  readonly iridescenceThicknessRange?: readonly [number, number];
  readonly anisotropy?: number;
  readonly anisotropyRotation?: number;
  readonly transmission?: number;
  readonly thickness?: number;
  readonly attenuationColor?: string;
  readonly attenuationDistance?: number;
  readonly ior?: number;
  readonly specularIntensity?: number;
  readonly specularColor?: string;
}

/** Spread-compatible with AuraMaterialSpec; the bridge hunk assigns it. */
export type PhysicalMaterialSpec = Record<string, unknown>;

export interface PhysicalMaterialExtensionDiagnostic {
  readonly extension: PhysicalExtensionId;
  readonly support: PhysicalExtensionSupport;
  readonly requested: boolean;
  readonly diagnostic: string;
}

export interface PhysicalMaterialResult {
  readonly spec: PhysicalMaterialSpec;
  readonly requestedExtensions: readonly PhysicalExtensionId[];
  readonly extensionDiagnostics: readonly PhysicalMaterialExtensionDiagnostic[];
  /** Every requested extension with support != supported. Empty only for the bare path. */
  readonly boundedWarnings: readonly string[];
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

export function createPhysicalMaterialSpec(options: PhysicalMaterialSpecOptions = {}): PhysicalMaterialResult {
  const spec: Record<string, unknown> = {
    color: options.color ?? "#d7dee8",
    roughness: finiteOr(options.roughness, 0.55),
    metallic: finiteOr(options.metallic ?? options.metalness, 0),
    metalness: finiteOr(options.metalness ?? options.metallic, 0),
    clearcoat: finiteOr(options.clearcoat, 0),
    clearcoatRoughness: finiteOr(options.clearcoatRoughness, 0),
    sheen: finiteOr(options.sheen, 0),
    sheenColor: options.sheenColor ?? "#000000",
    sheenRoughness: finiteOr(options.sheenRoughness, 0.5),
    iridescence: finiteOr(options.iridescence, 0),
    iridescenceIOR: finiteOr(options.iridescenceIOR, 1.3),
    iridescenceThicknessRange: options.iridescenceThicknessRange ?? [100, 400],
    anisotropy: finiteOr(options.anisotropy, 0),
    anisotropyRotation: finiteOr(options.anisotropyRotation, 0),
    transmission: finiteOr(options.transmission, 0),
    thickness: finiteOr(options.thickness, 0),
    attenuationColor: options.attenuationColor ?? "#ffffff",
    attenuationDistance: options.attenuationDistance,
    ior: finiteOr(options.ior, 1.5),
    ...(options.specularIntensity !== undefined ? { specularIntensity: options.specularIntensity } : {}),
    ...(options.specularColor !== undefined ? { specularColor: options.specularColor } : {})
  };

  const requested = new Set<PhysicalExtensionId>();
  if ((spec.clearcoat as number) > 0 || (spec.clearcoatRoughness as number) > 0) requested.add("clearcoat");
  if ((spec.sheen as number) > 0) requested.add("sheen");
  if ((spec.iridescence as number) > 0) requested.add("iridescence");
  if ((spec.anisotropy as number) > 0) requested.add("anisotropy");
  if ((spec.transmission as number) > 0) requested.add("transmission");
  if ((spec.thickness as number) > 0) requested.add("volume");
  if (options.attenuationColor !== undefined || options.attenuationDistance !== undefined) requested.add("volume");
  if (options.ior !== undefined) requested.add("ior");
  if (options.specularIntensity !== undefined || options.specularColor !== undefined) requested.add("specular");

  const extensionDiagnostics = PHYSICAL_EXTENSION_MATRIX.map((entry) => ({
    ...entry,
    requested: requested.has(entry.extension)
  }));
  const boundedWarnings = extensionDiagnostics
    .filter((entry) => entry.requested && entry.support !== "supported")
    .map((entry) => `${entry.extension}: ${entry.diagnostic}`);

  return {
    spec,
    requestedExtensions: [...requested].sort(),
    extensionDiagnostics,
    boundedWarnings
  };
}
