/**
 * PRD-05 §6.4 — visual-quality admission gates (Phase 0 slice).
 *
 * Pure functions over parsed glTF JSON + accessor counts. Implemented here:
 * G1 (triangle band), G3 (PBR slot coverage), G4 (card ban), G5
 * (programmer-art ban), G8 (tangents when normal-mapped), G11 (derived
 * present). G2, G6, G7, G9, G10 land in Phase 4 (`assets admit`).
 *
 * "Rendered surface area" is approximated by primitive triangle counts —
 * these functions intentionally take accessor counts, not vertex buffers, so
 * they run on the JSON chunk alone.
 */

import type { AssetQualityCheck } from "../contracts/assetManifest.js";
import type { AuraCliAssetRole } from "../asset-core-types.js";
import { isBuilderGenerator, isBuilderScriptPath } from "./builder-patterns.js";
import { profileForRole, requiresPbrTextures, type AdmissionProfile } from "./profiles.js";

export type AdmissionGateId = `G${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11}`;

/** One mesh primitive reduced to what the gates read (accessor counts + attribute presence). */
export interface AdmissionPrimitive {
  readonly triangleCount: number;
  readonly materialIndex?: number;
  readonly hasTexcoord0: boolean;
  readonly hasTangent: boolean;
}

export interface AdmissionMaterial {
  readonly name?: string;
  readonly hasBaseColorTexture: boolean;
  readonly hasNormalTexture: boolean;
  readonly hasMetallicRoughnessTexture: boolean;
  /** True when the material carries an occlusion texture (aoMap). */
  readonly hasOcclusionTexture: boolean;
  /** True when the material references no texture at all (factors only). */
  readonly factorOnly: boolean;
  /** KHR_materials_unlit. */
  readonly unlit: boolean;
}

export interface AdmissionModel {
  readonly generator?: string;
  readonly primitives: readonly AdmissionPrimitive[];
  readonly materials: readonly AdmissionMaterial[];
  /** Any mesh bound to a skin. */
  readonly skinned: boolean;
  /** LOD0 triangle total across primitives. */
  readonly totalTriangles: number;
  /** World-space bounds from POSITION accessor min/max (if declared). */
  readonly boundsSize?: readonly [number, number, number];
}

/** Manifest/provenance context a gate may read besides the geometry. */
export interface AdmissionEntryContext {
  readonly id: string;
  readonly role?: AuraCliAssetRole | string;
  readonly quality?: string;
  /** `provenance.sourcePath` (or the entry `source` when provenance is absent). */
  readonly sourcePath?: string;
  /** `provenance.generation.provider` / generator id recorded by the generator pipeline. */
  readonly generationProvider?: string;
  /** Entry already carries a `derived` record (or `derived.optimize === "not-needed"`). */
  readonly derivedPresent?: boolean;
  /** `artDirection` resolved to a `stylized-flat` doc with an approved look-dev record. */
  readonly stylizedFlatApproved?: boolean;
}

function check(gate: AdmissionGateId, verdict: AssetQualityCheck["verdict"], measured: unknown, message: string): AssetQualityCheck {
  return { gate, verdict, measured, message };
}

/** G1 — LOD0 triangles within [floor, ceiling] of the role profile (§6.2). */
export function gateG1TriangleBand(model: AdmissionModel, profile: AdmissionProfile | undefined): AssetQualityCheck {
  if (!profile || (profile.trianglesFloor === undefined && profile.trianglesCeiling === undefined)) {
    return check("G1", "waived-by-role", { triangles: model.totalTriangles }, "G1: no triangle band for this role/profile.");
  }
  const triangles = model.totalTriangles;
  const measured = { triangles, floor: profile.trianglesFloor, ceiling: profile.trianglesCeiling, profile: profile.id };
  if (profile.trianglesFloor !== undefined && triangles < profile.trianglesFloor) {
    return check("G1", "fail", measured, `G1: LOD0 ${triangles} tris below ${profile.id} floor ${profile.trianglesFloor}.`);
  }
  if (profile.trianglesCeiling !== undefined && triangles > profile.trianglesCeiling) {
    return check("G1", "fail", measured, `G1: LOD0 ${triangles} tris above ${profile.id} ceiling ${profile.trianglesCeiling}.`);
  }
  return check("G1", "pass", measured, `G1: ${triangles} tris inside ${profile.id} band.`);
}

/**
 * G3 — PBR completeness: TEXCOORD_0 + base colour + normal + metallic-
 * roughness on ≥ 90 % of rendered area (occlusion required on non-skinned
 * meshes, optional on skinned). Roles outside the PBR-required list record
 * `waived-by-role`.
 */
export function gateG3PbrCompleteness(model: AdmissionModel, role: AuraCliAssetRole | string | undefined, profile: AdmissionProfile | undefined, stylizedFlatApproved?: boolean): AssetQualityCheck {
  if (!requiresPbrTextures(role, profile)) {
    return check("G3", "waived-by-role", { role: role ?? "unknown", profile: profile?.id }, "G3: role does not require PBR texture coverage.");
  }
  if (stylizedFlatApproved) {
    return check("G3", "pass", { stylizedFlatApproved: true, role: role ?? "unknown", profile: profile?.id }, "G3: approved stylized-flat artDirection + look-dev record exempts PBR coverage (G10).");
  }
  const total = model.totalTriangles;
  const requiredOcclusion = !model.skinned;
  let covered = 0;
  let missingTexcoord = 0;
  let missingSlots = 0;
  for (const primitive of model.primitives) {
    const material = primitive.materialIndex !== undefined ? model.materials[primitive.materialIndex] : undefined;
    const hasTextures = primitive.hasTexcoord0 &&
      material !== undefined &&
      material.hasBaseColorTexture &&
      material.hasNormalTexture &&
      material.hasMetallicRoughnessTexture &&
      (!requiredOcclusion || material.hasOcclusionTexture);
    if (!primitive.hasTexcoord0) missingTexcoord += primitive.triangleCount;
    if (material !== undefined && !(material.hasBaseColorTexture && material.hasNormalTexture && material.hasMetallicRoughnessTexture && (!requiredOcclusion || material.hasOcclusionTexture))) {
      missingSlots += primitive.triangleCount;
    }
    if (hasTextures) covered += primitive.triangleCount;
  }
  const coverage = total > 0 ? covered / total : 0;
  const measured = { coverage, covered, total, missingTexcoord, missingSlots, requiredOcclusion, profile: profile?.id };
  return coverage >= 0.9
    ? check("G3", "pass", measured, `G3: PBR slots on ${(coverage * 100).toFixed(1)}% of rendered area.`)
    : check("G3", "fail", measured, `G3: PBR slots on ${(coverage * 100).toFixed(1)}% of rendered area (< 90%).`);
}

/**
 * G4 — card ban. Fails when LOD0 ≤ 12 triangles, `KHR_materials_unlit` on
 * > 10 % of area, or bounds thinness ratio min/max < 0.02 with ≤ 4 triangles.
 * `backdrop`/`debug`/`abstract` roles are exempt.
 */
export function gateG4CardBan(model: AdmissionModel, role: AuraCliAssetRole | string | undefined): AssetQualityCheck {
  if (role === "backdrop" || role === "debug" || role === "abstract") {
    return check("G4", "waived-by-role", { role }, "G4: role exempt from the card ban.");
  }
  const triangles = model.totalTriangles;
  if (triangles <= 12) {
    return check("G4", "fail", { triangles }, `G4: card geometry — LOD0 has only ${triangles} triangles (≤ 12).`);
  }
  let unlitTriangles = 0;
  for (const primitive of model.primitives) {
    const material = primitive.materialIndex !== undefined ? model.materials[primitive.materialIndex] : undefined;
    if (material?.unlit) unlitTriangles += primitive.triangleCount;
  }
  const unlitRatio = triangles > 0 ? unlitTriangles / triangles : 0;
  if (unlitRatio > 0.1) {
    return check("G4", "fail", { unlitRatio, unlitTriangles, triangles }, `G4: KHR_materials_unlit on ${(unlitRatio * 100).toFixed(1)}% of area (> 10%).`);
  }
  const size = model.boundsSize;
  if (size && triangles <= 4) {
    const maxDimension = Math.max(...size);
    const minDimension = Math.min(...size);
    const thinness = maxDimension > 0 ? minDimension / maxDimension : 0;
    if (thinness < 0.02) {
      return check("G4", "fail", { thinness, triangles, size }, `G4: thin card — bounds ratio ${thinness.toFixed(4)} < 0.02 with ${triangles} triangles.`);
    }
  }
  return check("G4", "pass", { triangles, unlitRatio }, "G4: no card geometry detected.");
}

export interface GateG5Result extends AssetQualityCheck {
  /** True when the failure is the in-repo builder provenance (role `proxy` cap). */
  readonly builderProvenance?: boolean;
}

/**
 * G5 — programmer-art ban. Fails when > 10 % of area lacks TEXCOORD_0, when
 * every material is factor-only without an approved stylized-flat art
 * direction, or when provenance/generator matches the in-repo builder list.
 */
export function gateG5ProgrammerArt(model: AdmissionModel, entry: AdmissionEntryContext): GateG5Result {
  // Builder provenance is the strictest G5 subtype (caps at prototype + role
  // proxy) — detect it even when the UV/factor checks would also fail, so the
  // migration and admit verb can apply the right cap.
  const builderSource = isBuilderScriptPath(entry.sourcePath) ? entry.sourcePath : undefined;
  const builderGenerator =
    (isBuilderGenerator(model.generator) ? model.generator : undefined) ??
    (isBuilderGenerator(entry.generationProvider) ? entry.generationProvider : undefined);
  if (builderSource || builderGenerator) {
    return {
      ...check("G5", "fail", { builderSource, builderGenerator, generator: model.generator }, "G5: in-repo builder provenance — capped at prototype (role proxy allowed)."),
      builderProvenance: true,
    };
  }
  const total = model.totalTriangles;
  let noUvTriangles = 0;
  for (const primitive of model.primitives) {
    if (!primitive.hasTexcoord0) noUvTriangles += primitive.triangleCount;
  }
  const noUvRatio = total > 0 ? noUvTriangles / total : 0;
  if (noUvRatio > 0.1) {
    return { ...check("G5", "fail", { noUvRatio, noUvTriangles, total }, `G5: no TEXCOORD_0 on ${(noUvRatio * 100).toFixed(1)}% of area (> 10%).`) };
  }
  const allFactorOnly = model.materials.length > 0 && model.materials.every((material) => material.factorOnly);
  if (allFactorOnly && !entry.stylizedFlatApproved) {
    return { ...check("G5", "fail", { factorOnlyMaterials: model.materials.length, stylizedFlatApproved: entry.stylizedFlatApproved ?? false }, "G5: every material is factor-only with no approved stylized-flat art direction.") };
  }
  return { ...check("G5", "pass", { noUvRatio, generator: model.generator }, "G5: UVs present and no builder provenance.") };
}

/** G8 — every primitive whose material has a normal map must carry TANGENT. */
export function gateG8Tangents(model: AdmissionModel): AssetQualityCheck {
  const missing: number[] = [];
  for (let index = 0; index < model.primitives.length; index += 1) {
    const primitive = model.primitives[index];
    const material = primitive.materialIndex !== undefined ? model.materials[primitive.materialIndex] : undefined;
    if (material?.hasNormalTexture && !primitive.hasTangent) missing.push(index);
  }
  return missing.length === 0
    ? check("G8", "pass", { normalMapped: model.primitives.filter((p) => p.materialIndex !== undefined && model.materials[p.materialIndex]?.hasNormalTexture).length }, "G8: tangents present on every normal-mapped primitive.")
    : check("G8", "fail", { missingPrimitives: missing }, `G8: ${missing.length} normal-mapped primitive(s) missing TANGENT.`);
}

/** G11 — `release` requires a `derived` record (or `optimize: "not-needed"` with measurements). */
export function gateG11Derived(entry: AdmissionEntryContext): AssetQualityCheck {
  return entry.derivedPresent
    ? check("G11", "pass", { derived: true }, "G11: derived record present.")
    : check("G11", "fail", { derived: false }, "G11: no derived record — run `assets optimize` before release.");
}

/** Runs the Phase-0 implemented gates for one entry + parsed model. */
export function runAdmissionGates(model: AdmissionModel, entry: AdmissionEntryContext): readonly AssetQualityCheck[] {
  const profile = profileForRole(entry.role, model.boundsSize);
  return [
    gateG1TriangleBand(model, profile),
    gateG3PbrCompleteness(model, entry.role, profile, entry.stylizedFlatApproved),
    gateG4CardBan(model, entry.role),
    gateG5ProgrammerArt(model, entry),
    gateG8Tangents(model),
    gateG11Derived(entry),
  ];
}
