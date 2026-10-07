import {
  createExternalParityMaterialExtensionDiagnostics,
  type ExternalParityMaterialExtension,
  type ExternalParityMaterialExtensionState
} from "./MaterialExtensions";
import { Material, type MaterialDescriptor } from "../Material";
import type { MaterialFeatureContext, ProgramFeatureSource } from "../contracts/materialLobes";
import type { Texture } from "../Texture";
import type { Sampler } from "../Sampler";
import { physicalFeatureSet } from "./PhysicalFeatures";

export type ExternalParityMaterialKind =
  | "chrome"
  | "brushed-metal"
  | "gold"
  | "painted-metal"
  | "matte-plastic"
  | "glossy-plastic"
  | "rubber"
  | "glass-transmission"
  | "clearcoat-car-paint"
  | "fabric-sheen"
  | "emissive"
  | "textured-ceramic-stone";

export interface ExternalParityPhysicalMaterialDescriptor {
  readonly id: ExternalParityMaterialKind;
  readonly label: string;
  readonly baseColor: readonly [number, number, number, number];
  readonly metallic: number;
  readonly roughness: number;
  readonly emissive?: readonly [number, number, number];
  readonly emissiveStrength?: number;
  readonly normalScale?: number;
  readonly occlusionStrength?: number;
  readonly alphaMode?: "opaque" | "mask" | "blend";
  readonly alphaCutoff?: number;
  readonly doubleSided?: boolean;
  readonly extensions: readonly ExternalParityMaterialExtension[];
  readonly visualGoal: string;
}

export interface ExternalParityPhysicalMaterialAnalysis {
  readonly descriptor: ExternalParityPhysicalMaterialDescriptor;
  readonly extensionDiagnostics: readonly ExternalParityMaterialExtensionState[];
  readonly reflectanceClass: "mirror-metal" | "rough-metal" | "dielectric" | "transparent" | "emissive";
  readonly requiresIbl: boolean;
  readonly requiresTransmissionPass: boolean;
  readonly requiresAlphaSorting: boolean;
  readonly warnings: readonly string[];
}

export class ExternalParityPhysicalMaterial {
  public readonly descriptor: ExternalParityPhysicalMaterialDescriptor;

  constructor(descriptor: ExternalParityPhysicalMaterialDescriptor) {
    validateDescriptor(descriptor);
    this.descriptor = descriptor;
  }

  analyze(): ExternalParityPhysicalMaterialAnalysis {
    const extensionDiagnostics = createExternalParityMaterialExtensionDiagnostics(this.descriptor.extensions);
    const reflectanceClass = classifyMaterial(this.descriptor);
    const requiresTransmissionPass = this.descriptor.extensions.includes("transmission") || this.descriptor.id === "glass-transmission";
    const requiresAlphaSorting = this.descriptor.alphaMode === "blend" || requiresTransmissionPass;
    const warnings = [
      ...extensionDiagnostics.filter((entry) => entry.support !== "supported").map((entry) => `${entry.extension}: ${entry.diagnostic}`),
      ...(this.descriptor.metallic > 0.8 && this.descriptor.roughness < 0.2 ? [] : []),
      ...(requiresTransmissionPass ? ["Transmission is bounded and must be compared against Three.js before release claims."] : [])
    ];
    return {
      descriptor: this.descriptor,
      extensionDiagnostics,
      reflectanceClass,
      requiresIbl: this.descriptor.metallic > 0 || this.descriptor.extensions.length > 0,
      requiresTransmissionPass,
      requiresAlphaSorting,
      warnings
    };
  }
}

export const EXTERNAL_PARITY_PHYSICAL_MATERIAL_MATRIX: readonly ExternalParityPhysicalMaterialDescriptor[] = [
  material("chrome", "Chrome", [0.92, 0.94, 0.95, 1], 1, 0.04, [], "Mirror-like metal must reflect environment directionally."),
  material("brushed-metal", "Brushed Metal", [0.78, 0.76, 0.72, 1], 1, 0.32, ["anisotropy"], "Brushed metal must show rough directional response."),
  material("gold", "Gold", [1, 0.72, 0.28, 1], 1, 0.18, [], "Gold must read as tinted metal, not yellow plastic."),
  material("painted-metal", "Painted Metal", [0.8, 0.04, 0.03, 1], 0.65, 0.22, ["clearcoat"], "Painted metal must show base color plus coated highlight."),
  material("matte-plastic", "Matte Plastic", [0.08, 0.1, 0.12, 1], 0, 0.82, [], "Matte plastic must have broad diffuse response."),
  material("glossy-plastic", "Glossy Plastic", [0.02, 0.28, 0.9, 1], 0, 0.16, ["specular"], "Glossy plastic must show tight dielectric highlights."),
  material("rubber", "Rubber", [0.01, 0.012, 0.014, 1], 0, 0.92, [], "Rubber must stay dark and rough without metal response."),
  material("glass-transmission", "Glass / Transmission", [0.82, 0.96, 1, 0.34], 0, 0.02, ["transmission", "volume", "ior"], "Glass must be transparent/transmissive with honest limitations."),
  material("clearcoat-car-paint", "Clearcoat Car Paint", [0.1, 0.02, 0.018, 1], 0.35, 0.18, ["clearcoat", "specular"], "Car paint must show layered highlight response."),
  material("fabric-sheen", "Fabric / Sheen", [0.55, 0.28, 0.9, 1], 0, 0.72, ["sheen"], "Fabric must show soft grazing-angle sheen."),
  material("emissive", "Emissive", [0.04, 0.04, 0.04, 1], 0, 0.45, ["emissive-strength"], "Emissive material must pass through HDR tone mapping and bloom evidence.", [1, 0.45, 0.12], 4),
  material("textured-ceramic-stone", "Textured Ceramic / Stone", [0.62, 0.58, 0.52, 1], 0, 0.58, ["texture-transform", "multi-uv"], "Stone/ceramic must show texture, normal, and roughness detail.")
];

export function createExternalParityPhysicalMaterial(kind: ExternalParityMaterialKind): ExternalParityPhysicalMaterial {
  const descriptor = EXTERNAL_PARITY_PHYSICAL_MATERIAL_MATRIX.find((entry) => entry.id === kind);
  if (!descriptor) throw new Error(`Unknown ExternalParity material kind: ${kind}`);
  return new ExternalParityPhysicalMaterial(descriptor);
}

export function analyzeExternalParityMaterialMatrix(): readonly ExternalParityPhysicalMaterialAnalysis[] {
  return EXTERNAL_PARITY_PHYSICAL_MATERIAL_MATRIX.map((descriptor) => new ExternalParityPhysicalMaterial(descriptor).analyze());
}

function material(
  id: ExternalParityMaterialKind,
  label: string,
  baseColor: readonly [number, number, number, number],
  metallic: number,
  roughness: number,
  extensions: readonly ExternalParityMaterialExtension[],
  visualGoal: string,
  emissive?: readonly [number, number, number],
  emissiveStrength?: number
): ExternalParityPhysicalMaterialDescriptor {
  return { id, label, baseColor, metallic, roughness, extensions, visualGoal, ...(emissive ? { emissive } : {}), ...(emissiveStrength ? { emissiveStrength } : {}), ...(id === "glass-transmission" ? { alphaMode: "blend" as const, doubleSided: true } : {}) };
}

function validateDescriptor(descriptor: ExternalParityPhysicalMaterialDescriptor): void {
  if (!descriptor.id || !descriptor.label) throw new Error("ExternalParity physical material requires id and label.");
  if (descriptor.baseColor.length !== 4 || descriptor.baseColor.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error(`ExternalParity physical material ${descriptor.id} has invalid baseColor.`);
  }
  if (!Number.isFinite(descriptor.metallic) || descriptor.metallic < 0 || descriptor.metallic > 1) throw new Error(`ExternalParity physical material ${descriptor.id} has invalid metallic.`);
  if (!Number.isFinite(descriptor.roughness) || descriptor.roughness < 0 || descriptor.roughness > 1) throw new Error(`ExternalParity physical material ${descriptor.id} has invalid roughness.`);
}

function classifyMaterial(descriptor: ExternalParityPhysicalMaterialDescriptor): ExternalParityPhysicalMaterialAnalysis["reflectanceClass"] {
  if ((descriptor.emissiveStrength ?? 0) > 0) return "emissive";
  if (descriptor.extensions.includes("transmission")) return "transparent";
  if (descriptor.metallic > 0.8 && descriptor.roughness < 0.18) return "mirror-metal";
  if (descriptor.extensions.includes("clearcoat") && descriptor.metallic >= 0.3) return "rough-metal";
  if (descriptor.metallic > 0.5) return "rough-metal";
  return "dielectric";
}

// ---------------------------------------------------------------------------
// C-03 real implementation (PRD-04 §7.3, phase 3): the glTF-faithful physical
// material descriptor and the `ProgramFeatureSource` every generated-path
// material implements. Inert until C-02's program generator consumes
// `programFeatures()` — nothing on the legacy path reads it.
// ---------------------------------------------------------------------------

export type Prd04Vec3 = readonly [number, number, number];
export type Prd04Vec4 = readonly [number, number, number, number];

/** Texture slots a generated physical program can sample (mirrors KHR/glTF). */
export type PhysicalMapSlot =
  | "baseColor" | "normal" | "metallicRoughness" | "occlusion" | "emissive"
  | "clearcoat" | "clearcoatRoughness" | "clearcoatNormal"
  | "transmission" | "diffuseTransmission" | "diffuseTransmissionColor"
  | "volumeThickness" | "specular" | "specularColor"
  | "sheenColor" | "sheenRoughness" | "anisotropy"
  | "iridescence" | "iridescenceThickness";

export interface PhysicalMapBinding {
  readonly texture: Texture;
  readonly sampler: Sampler;
  /** glTF texCoord index (KHR_texture_transform may override). */
  readonly texCoord: 0 | 1;
  /** Column-major mat3 from `uvTransformMatrix` (KHR_texture_transform T·R·S). */
  readonly transform?: Float32Array | readonly number[];
}

/** glTF material descriptor — PRD-04 §7.3 verbatim. */
export interface PhysicalMaterialDescriptor {
  readonly baseColorFactor: Prd04Vec4;
  readonly metallicFactor: number;
  readonly roughnessFactor: number;
  readonly emissiveFactor: Prd04Vec3;
  readonly emissiveStrength: number;
  readonly normalScale: number;
  readonly occlusionStrength: number;
  readonly ior: number;                                            // default 1.5
  readonly specular?: { readonly factor: number; readonly colorFactor: Prd04Vec3 };
  readonly clearcoat?: { readonly factor: number; readonly roughnessFactor: number; readonly normalScale: number };
  readonly sheen?: { readonly colorFactor: Prd04Vec3; readonly roughnessFactor: number };
  readonly iridescence?: { readonly factor: number; readonly ior: number; readonly thicknessMin: number; readonly thicknessMax: number };
  readonly anisotropy?: { readonly strength: number; readonly rotation: number };
  readonly transmission?: { readonly factor: number };
  readonly volume?: { readonly thicknessFactor: number; readonly attenuationDistance: number; readonly attenuationColor: Prd04Vec3 };
  readonly dispersion?: number;
  readonly diffuseTransmission?: { readonly factor: number; readonly colorFactor: Prd04Vec3 };
  readonly alphaMode: "opaque" | "mask" | "blend";
  readonly alphaCutoff: number;
  readonly alphaToCoverage: boolean;
  readonly doubleSided: boolean;
  readonly unlit: boolean;
  readonly textures: Partial<Record<PhysicalMapSlot, PhysicalMapBinding>>;
}

/**
 * Abstract generated-path physical material (C-03 `ProgramFeatureSource`).
 * Concrete subclasses (`TexturedPBRMaterial`, `PBRMaterial`, …) either hold a
 * descriptor directly or derive one from their legacy options; `programFeatures`
 * is pure — the C-02 generator consumes it, no legacy uniforms change.
 */
export abstract class PhysicalMaterial extends Material implements ProgramFeatureSource {
  public readonly physicalDescriptor: PhysicalMaterialDescriptor;
  public readonly vertexColors: boolean;

  protected constructor(descriptor: PhysicalMaterialDescriptor, material?: Omit<MaterialDescriptor, "shaderKey"> & { readonly shaderKey?: string; readonly vertexColors?: boolean }) {
    const { vertexColors = false, ...rest } = material ?? {};
    super({ shaderKey: rest.shaderKey ?? "a3d-prd04-physical", ...rest });
    this.physicalDescriptor = descriptor;
    this.vertexColors = vertexColors;
  }

  programFeatures(ctx: MaterialFeatureContext): ReturnType<ProgramFeatureSource["programFeatures"]> {
    return physicalFeatureSet(this.physicalDescriptor, ctx, { vertexColors: this.vertexColors });
  }
}

export type PhysicalFeatureSet = ReturnType<ProgramFeatureSource["programFeatures"]>;   // alias only (CONTRACTS App. A)
