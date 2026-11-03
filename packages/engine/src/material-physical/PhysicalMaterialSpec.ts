/**
 * muse3jsparity-PRD P3 — root `material.physical` spec path (package side).
 *
 * `physical` must not be a bare alias of `pbr`. This module gives it its own
 * spec path WITHOUT touching `packages/engine/src/agent-api/index.ts`
 * (HARD RULE):
 *
 * - Explicit clearcoat/sheen/iridescence/anisotropy/transmission/volume/ior
 *   parameters and bounded diffuse/retroreflection controls.
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
  { extension: "clearcoat", support: "supported", diagnostic: "Clearcoat factor, roughness and coat normal maps (linear data, per-slot texture transform and UV set, authored TANGENT frame when present) layer over the base with a Fresnel energy split in WebGL2 and WebGPU; inter-layer multiple scattering is not modeled." },
  { extension: "sheen", support: "supported", diagnostic: "Sheen color (sRGB) and roughness (linear) maps with per-slot texture transforms and UV sets layer over the substrate with albedo compensation in WebGL2 and WebGPU, including the independent WebGPU preview under environment, probe, volume and lightmap lighting; visual parity with other renderers is not claimed." },
  { extension: "specular", support: "supported", diagnostic: "Specular factor (linear alpha) and specular color (sRGB) maps with per-slot texture transforms and UV sets drive dielectric F0/F90 in WebGL2 and WebGPU." },
  { extension: "transmission", support: "supported", diagnostic: "Transmission refracts the captured scene color with roughness- and IOR-selected mip blur; the transmission map (linear red, per-slot transform and UV set) scales it in WebGL2 and WebGPU. Caustics and multi-bounce refraction are not modeled." },
  { extension: "volume", support: "supported", diagnostic: "Volume thickness (linear green map, per-slot transform and UV set) and Beer-Lambert attenuation shape transmission in WebGL2 and WebGPU; volumetric caustics and in-volume scattering are not modeled." },
  { extension: "ior", support: "supported", diagnostic: "IOR drives the dielectric Fresnel, transmission refraction and dispersion bands in WebGL2 and WebGPU." },
  { extension: "anisotropy", support: "supported", diagnostic: "Anisotropy uses the aspect-ratio anisotropic-GGX NDF; the anisotropy map (linear RG direction, B strength, per-slot transform and UV set) rotates within the authored TANGENT frame (T Gram-Schmidt against the normal, B = sign(w) * cross(N, T), negated on back faces) whenever geometry carries tangents, otherwise within the UV-derivative frame, in WebGL2 and WebGPU." },
  { extension: "iridescence", support: "supported", diagnostic: "Thin-film iridescence (factor and thickness maps, linear, per-slot transform and UV set) modulates direct and environment Fresnel in WebGL2 and WebGPU; full spectral rendering is not claimed." }
];

export interface PhysicalMaterialSpecOptions {
  readonly color?: string;
  readonly roughness?: number;
  /** Roughness of the diffuse lobe, independent of specular roughness, in [0, 1]. */
  readonly diffuseRoughness?: number;
  /** Strength of the diffuse retroreflection response, in [0, 1]. */
  readonly retroreflection?: number;
  readonly metallic?: number;
  readonly metalness?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly sheen?: number;
  readonly sheenColor?: string;
  readonly sheenRoughness?: number;
  readonly iridescence?: number;
  readonly iridescenceIOR?: number;
  /** Film thickness endpoints in nanometres. Explicit endpoints override the corresponding range entry. */
  readonly iridescenceThicknessRange?: readonly [number, number];
  readonly iridescenceThicknessMinimum?: number;
  readonly iridescenceThicknessMaximum?: number;
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

function boundedControl(value: number | undefined, name: string): number {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number in [0, 1]`);
  }
  return value;
}

export function resolveIridescenceThickness(
  options: Pick<PhysicalMaterialSpecOptions, "iridescenceThicknessRange" | "iridescenceThicknessMinimum" | "iridescenceThicknessMaximum">
): readonly [number | undefined, number | undefined] {
  const range = options.iridescenceThicknessRange;
  // Validate the legacy range even where an explicit endpoint overrides it:
  // malformed authored input must not be silently ignored.
  if (range !== undefined && (!Array.isArray(range) || range.length !== 2 ||
      !Number.isFinite(range[0]) || range[0] < 0 || !Number.isFinite(range[1]) || range[1] < 0)) {
    throw new RangeError("iridescenceThicknessRange must contain exactly two finite, non-negative endpoints");
  }
  const { iridescenceThicknessMinimum: minimum, iridescenceThicknessMaximum: maximum } = options;
  if (minimum !== undefined && (!Number.isFinite(minimum) || minimum < 0)) {
    throw new RangeError("iridescenceThicknessMinimum must be finite and non-negative");
  }
  if (maximum !== undefined && (!Number.isFinite(maximum) || maximum < 0)) {
    throw new RangeError("iridescenceThicknessMaximum must be finite and non-negative");
  }
  // Leave unprovided endpoints unset so imported materials retain their own
  // values; standalone materials apply the renderer defaults at their boundary.
  return [minimum ?? range?.[0], maximum ?? range?.[1]];
}

export function createPhysicalMaterialSpec(options: PhysicalMaterialSpecOptions = {}): PhysicalMaterialResult {
  const [minimum, maximum] = resolveIridescenceThickness(options);
  const iridescenceThicknessMinimum = minimum ?? 100;
  const iridescenceThicknessMaximum = maximum ?? 400;
  const iridescenceIOR = options.iridescenceIOR ?? 1.3;
  if (!Number.isFinite(iridescenceIOR) || iridescenceIOR < 1) throw new RangeError("iridescenceIOR must be finite and at least 1");
  const spec: Record<string, unknown> = {
    color: options.color ?? "#d7dee8",
    roughness: finiteOr(options.roughness, 0.55),
    diffuseRoughness: boundedControl(options.diffuseRoughness, "diffuseRoughness"),
    retroreflection: boundedControl(options.retroreflection, "retroreflection"),
    metallic: finiteOr(options.metallic ?? options.metalness, 0),
    metalness: finiteOr(options.metalness ?? options.metallic, 0),
    clearcoat: finiteOr(options.clearcoat, 0),
    clearcoatRoughness: finiteOr(options.clearcoatRoughness, 0),
    sheen: finiteOr(options.sheen, 0),
    sheenColor: options.sheenColor ?? "#000000",
    sheenRoughness: finiteOr(options.sheenRoughness, 0.5),
    iridescence: finiteOr(options.iridescence, 0),
    iridescenceIOR,
    iridescenceThicknessRange: [iridescenceThicknessMinimum, iridescenceThicknessMaximum],
    iridescenceThicknessMinimum,
    iridescenceThicknessMaximum,
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
