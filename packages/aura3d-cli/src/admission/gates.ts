/**
 * PRD-05 §6.4 — visual-quality admission gates (Phase 0 slice).
 *
 * Pure functions over parsed glTF JSON + accessor counts. Implemented here:
 * G1 (triangle band), G3 (PBR slot coverage), G4 (card ban), G5
 * (programmer-art ban), G8 (tangents when normal-mapped), G11 (derived
 * present). G2, G6, G7, G9, G10 landed in Phase 4 (`assets admit`) —
 * measured-input gates, pure over the reports produced by admission/texel.ts
 * and admission/textureStats.ts.
 *
 * "Rendered surface area" is approximated by primitive triangle counts —
 * these functions intentionally take accessor counts, not vertex buffers, so
 * they run on the JSON chunk alone.
 */

import type { AssetQualityCheck } from "../contracts/assetManifest.js";
import type { AuraCliAssetRole, AuraCliLookDevReview } from "../asset-core-types.js";
import type { ArtDirectionDocument } from "./artDirection.js";
import type { TexelDensityReport } from "./texel.js";
import type { TextureSanityReport } from "./textureStats.js";
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
  /** Manifest `artDirection` id (G10: resolves to assets/art-direction/<id>.json). */
  readonly artDirection?: string;
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

// ---------------------------------------------------------------------------
// Phase 4 — measured gates. Each takes its pre-computed report (never decodes
// or reads files itself) and fails when the required measurement is absent:
// release admission cannot be granted on an unmeasured surface.
// ---------------------------------------------------------------------------

/** Measured inputs for the Phase-4 gates; callers build these per entry. */
export interface AdmissionMeasured {
  /** G2: texel-density report (admission/texel.ts) at the resolved camera, 1920×1080. */
  readonly texelDensity?: TexelDensityReport;
  /** G2: same report at the §6.4 mobile viewport 390×844. */
  readonly texelDensityMobile?: TexelDensityReport;
  /** G6: per-slot texture sanity (admission/textureStats.ts). */
  readonly textureSanity?: TextureSanityReport;
  /** G7: derived file bytes + GPU bytes + draw calls (High tier). */
  readonly derivedFileBytes?: number;
  readonly gpuBytesHigh?: number;
  readonly drawCalls?: number;
  /** G9: the entry's look-dev record (manifest `lookDev`) bound to current hash. */
  readonly lookDev?: {
    readonly derivedHash?: string;
    readonly stageVersion?: string;
    readonly reviews: readonly AuraCliLookDevReview[];
  };
  /** G9: Aura-adapter look-dev score (three-minus-Aura gap > 1.5 → renderer issue). */
  readonly auraScore?: number;
  /** G10: resolved `assets/art-direction/<id>.json` (undefined = file missing). */
  readonly artDirectionDoc?: ArtDirectionDocument;
}

const TEXEL_BAND: readonly [number, number] = [0.5, 4];

/** G2 — median-area-triangle texels/screen-pixel within [0.5, 4] at the role camera. */
export function gateG2TexelDensity(model: AdmissionModel, profile: AdmissionProfile | undefined, measured: AdmissionMeasured): AssetQualityCheck {
  void model;
  if (profile === undefined || profile.gameplayCamera === undefined) {
    return check("G2", "waived-by-role", { role: profile?.id }, "G2: no gameplay camera for this role.");
  }
  const report = measured.texelDensity;
  if (!report || report.trianglesMeasured === 0 || report.p50 === undefined) {
    return check("G2", "fail", { measured: report?.trianglesMeasured ?? 0 }, "G2: texel density not measurable — no UV+texture triangle coverage.");
  }
  const { p10, p50, p90 } = report;
  const [lo, hi] = TEXEL_BAND;
  const inBand = p50 >= lo && p50 <= hi;
  const mobile = measured.texelDensityMobile;
  const mobileOk = mobile === undefined || mobile.trianglesMeasured === 0 || (mobile.p50 !== undefined && mobile.p50 >= lo && mobile.p50 <= hi);
  const floorOk = profile.texelFloorPxPerMeter === undefined || (report.texelsPerMeterP50 ?? 0) >= profile.texelFloorPxPerMeter;
  const measuredRow = { p10, p50, p90, band: TEXEL_BAND, texelsPerMeterP50: report.texelsPerMeterP50, floor: profile.texelFloorPxPerMeter, camera: report.camera, textureSize: report.textureSize, mobile: mobile ? { p50: mobile.p50, viewport: `${mobile.camera.viewportWidth}×${mobile.camera.viewportHeight}` } : undefined };
  return inBand && floorOk && mobileOk
    ? check("G2", "pass", measuredRow, `G2: median ${p50.toFixed(2)} texels/px in band [${lo}, ${hi}].`)
    : check("G2", "fail", measuredRow, `G2: ${!inBand ? `median ${p50.toFixed(2)} texels/px outside [${lo}, ${hi}]` : !mobileOk ? `mobile median ${mobile?.p50?.toFixed(2)} outside band` : `below ${profile.texelFloorPxPerMeter ?? "—"} px/m floor`}.`);
}

/** G6 — texture sanity on 256² decoded proxies. */
export function gateG6TextureSanity(profile: AdmissionProfile | undefined, measured: AdmissionMeasured): AssetQualityCheck {
  const report = measured.textureSanity;
  if (!report) {
    return check("G6", "fail", {}, "G6: texture sanity not measured — run via `assets admit` (needs tools/asset-optimize deps).");
  }
  if (!report.available) {
    return check("G6", "fail", { reason: report.unavailableReason }, `G6: texture decode unavailable — ${report.unavailableReason ?? "sharp missing"}.`);
  }
  if (report.textures.length === 0) {
    // No textures at all: factor-only assets live or die by G5/G10, not G6.
    return check("G6", "pass", { textures: 0 }, "G6: no textures to sanity-check.");
  }
  const failures: string[] = [];
  const flags: string[] = [];
  for (const tex of report.textures) {
    const label = `${tex.slot}#${tex.materialIndex}${tex.materialName ? `(${tex.materialName})` : ""}`;
    if (tex.error?.startsWith("undecodable")) {
      // basisu/ktx2 in the measured file: the source proxy ran pre-encode.
      continue;
    }
    if (tex.width > 0 && !tex.powerOfTwo) failures.push(`${label}: non-power-of-two ${tex.width}×${tex.height}`);
    if (tex.slot === "normal" && tex.normalLength) {
      if (tex.normalLength.inUnitRange < 0.95) failures.push(`${label}: normal length outside [0.9,1.1] on ${((1 - tex.normalLength.inUnitRange) * 100).toFixed(1)}% of texels (> 5%)`);
      if (tex.normalLength.meanBlue < 0.7) failures.push(`${label}: mean B ${tex.normalLength.meanBlue.toFixed(2)} < 0.7 (not a valid tangent-space normal map)`);
    }
    if (tex.slot === "metallicRoughness" && tex.constantChannels && tex.constantChannels.length >= 3) {
      flags.push(`${label}: all ORM channels constant — replace texture with factor`);
    } else if (tex.constantChannels) {
      for (const c of tex.constantChannels) flags.push(`${label}: channel ${c} constant (σ<0.004) — replace texture with factor`);
    }
    if (tex.slot === "baseColor" && tex.luminance) {
      const metal = materialsAreMetal(measured, tex.materialIndex);
      const floor = metal ? 140 : 30;
      if (tex.luminance.inRange30to240 < 0.95 && !metal) {
        failures.push(`${label}: sRGB luminance outside [30,240] on ${((1 - tex.luminance.inRange30to240) * 100).toFixed(1)}% of texels`);
      } else if (metal && tex.luminance.mean < floor) {
        failures.push(`${label}: metal base colour mean luminance ${tex.luminance.mean.toFixed(0)} < 140`);
      }
    }
  }
  void profile;
  const measuredRow = { failures, flags, textures: report.textures.length };
  return failures.length === 0
    ? check("G6", "pass", measuredRow, `G6: ${report.textures.length} texture slot(s) sane${flags.length ? ` (${flags.length} constant-channel flags)` : ""}.`)
    : check("G6", "fail", measuredRow, `G6: ${failures.join("; ")}`);
}

/** Metal determination for a material: ORM median metallic ≥ 0.9 or factor ≥ 0.9. */
function materialsAreMetal(measured: AdmissionMeasured, materialIndex: number): boolean {
  const orm = measured.textureSanity?.textures.find((t) => t.slot === "metallicRoughness" && t.materialIndex === materialIndex);
  const bMedian = orm?.channels?.[2]?.mean;
  return bMedian !== undefined && bMedian / 255 >= 0.9;
}

/** G7 — derived file bytes + GPU bytes + draw calls within the §17.2 role budget. */
export function gateG7Budget(profile: AdmissionProfile | undefined, measured: AdmissionMeasured): AssetQualityCheck {
  if (profile === undefined || profile.fileBytesHigh === undefined) {
    return check("G7", "waived-by-role", { profile: profile?.id }, "G7: no budget for this role.");
  }
  const fileBytes = measured.derivedFileBytes;
  if (fileBytes === undefined) {
    return check("G7", "fail", {}, "G7: no derived measurement — run `assets optimize` first.");
  }
  const over: string[] = [];
  if (fileBytes > profile.fileBytesHigh) over.push(`file ${Math.round(fileBytes / 1e6 * 10) / 10} MB > ${Math.round(profile.fileBytesHigh / 1e6)} MB`);
  if (measured.gpuBytesHigh !== undefined && profile.gpuBytesHigh !== undefined && measured.gpuBytesHigh > profile.gpuBytesHigh) {
    over.push(`gpu ${Math.round(measured.gpuBytesHigh / 1e6 * 10) / 10} MB > ${Math.round(profile.gpuBytesHigh / 1e6)} MB`);
  }
  const measuredRow = { fileBytes, fileBytesHigh: profile.fileBytesHigh, gpuBytesHigh: measured.gpuBytesHigh, gpuBudget: profile.gpuBytesHigh, drawCalls: measured.drawCalls };
  return over.length === 0
    ? check("G7", "pass", measuredRow, `G7: file ${Math.round(fileBytes / 1e3)} KB within ${profile.id} budget.`)
    : check("G7", "fail", measuredRow, `G7: over ${profile.id} budget — ${over.join(", ")}.`);
}

/** G9 — look-dev record: three-adapter score ≥ 6.5, no axis < 4, hero needs a named human; Aura gap > 1.5 is a renderer issue, not an asset failure. */
export interface GateG9Result extends AssetQualityCheck {
  /** Set when Aura-minus-three gap > 1.5 — file a renderer issue (qr-ic-regression), not an asset failure. */
  readonly rendererIssue?: boolean;
}

const G9_AXES = ["silhouette", "surfaceDetail", "materialBelievability", "texelSharpness", "lodTransitions", "artefacts"] as const;

export function gateG9LookDev(entry: AdmissionEntryContext, profile: AdmissionProfile | undefined, measured: AdmissionMeasured): GateG9Result {
  const record = measured.lookDev;
  if (!record || record.reviews.length === 0) {
    return check("G9", "fail", { reviews: 0 }, "G9: no look-dev record — run `assets lookdev` + `assets review`.");
  }
  const boundHash = record.derivedHash;
  // Reviews bound to the current derived hash only.
  const threeReviews = record.reviews.filter((r) => r.judge?.kind === "vision-model");
  const humanReviews = record.reviews.filter((r) => r.judge?.kind === "human" && r.verdict === "accept");
  const scored = threeReviews.filter((r) => r.score !== undefined);
  if (scored.length === 0) {
    return check("G9", "fail", { reviews: record.reviews.length, boundHash }, "G9: no vision-model score on record.");
  }
  const meanScore = scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length;
  const minAxis = Math.min(...scored.flatMap((r) => G9_AXES.map((a) => r.axes?.[a] ?? 10)));
  const hero = profile !== undefined && (profile.id === "hero-character" || profile.id === "hero-vehicle" || entry.role === "hero");
  const humanRequired = hero;
  const fails: string[] = [];
  if (meanScore < 6.5) fails.push(`three-adapter score ${meanScore.toFixed(2)} < 6.5`);
  if (minAxis < 4) fails.push(`axis ${minAxis.toFixed(1)} < 4`);
  if (humanRequired && humanReviews.length === 0) fails.push("hero role requires a named human review");
  if (scored.some((r) => r.verdict !== "accept")) fails.push("latest reviews include a reject verdict");
  const gap = measured.auraScore !== undefined ? meanScore - measured.auraScore : undefined;
  const rendererIssue = gap !== undefined && gap > 1.5;
  const measuredRow = { meanScore, minAxis, reviews: scored.length, humanReviews: humanReviews.length, boundHash, auraScore: measured.auraScore, auraMinusThreeGap: gap, rendererIssue };
  const result: GateG9Result = fails.length === 0
    ? check("G9", "pass", measuredRow, `G9: look-dev score ${meanScore.toFixed(2)} (axes ≥ ${minAxis.toFixed(1)}${humanReviews.length ? ", human-reviewed" : ""}).`)
    : check("G9", "fail", measuredRow, `G9: ${fails.join("; ")}.`);
  return rendererIssue ? { ...result, rendererIssue: true } : result;
}

/** G10 — art-direction document exists; `stylized-flat` additionally needs UVs + human review. */
export function gateG10ArtDirection(model: AdmissionModel, entry: AdmissionEntryContext, measured: AdmissionMeasured): AssetQualityCheck {
  if (entry.artDirection === undefined) {
    return check("G10", "fail", {}, "G10: release assets require an `artDirection` id (assets/art-direction/<id>.json).");
  }
  const doc = measured.artDirectionDoc;
  if (!doc) {
    return check("G10", "fail", { artDirection: entry.artDirection }, `G10: no assets/art-direction/${entry.artDirection}.json file.`);
  }
  const measuredRow = { artDirection: entry.artDirection, shading: doc.shading, palette: doc.palette?.length ?? 0, texelDensity: doc.texelDensity };
  if (doc.shading === "stylized-flat") {
    if (!entry.stylizedFlatApproved) {
      return check("G10", "fail", measuredRow, "G10: stylized-flat requires the approved look-dev record on the current hash.");
    }
    const noUv = model.primitives.some((p) => p.triangleCount > 0 && !p.hasTexcoord0);
    if (noUv) return check("G10", "fail", measuredRow, "G10: stylized-flat still requires TEXCOORD_0 on every rendered primitive.");
  }
  return check("G10", "pass", measuredRow, `G10: art direction "${entry.artDirection}" (${doc.shading ?? "unspecified shading"}) on file.`);
}

/** Runs all admission gates; measured gates need `measured` inputs (Phase 4). */
export function runAdmissionGates(model: AdmissionModel, entry: AdmissionEntryContext, measured: AdmissionMeasured = {}): readonly AssetQualityCheck[] {
  const profile = profileForRole(entry.role, model.boundsSize);
  return [
    gateG1TriangleBand(model, profile),
    gateG2TexelDensity(model, profile, measured),
    gateG3PbrCompleteness(model, entry.role, profile, entry.stylizedFlatApproved),
    gateG4CardBan(model, entry.role),
    gateG5ProgrammerArt(model, entry),
    gateG6TextureSanity(profile, measured),
    gateG7Budget(profile, measured),
    gateG8Tangents(model),
    gateG9LookDev(entry, profile, measured),
    gateG10ArtDirection(model, entry, measured),
    gateG11Derived(entry),
  ];
}
