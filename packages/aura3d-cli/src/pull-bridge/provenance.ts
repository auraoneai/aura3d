import type {
  AuraAssetIntendedRole,
  AuraCanonicalAsset,
  ResolveCandidate,
} from "@aura3d/asset-index";
import type {
  AssetInspectionReport,
  AuraCliAssetRole,
  AuraCliResolveCandidateProvenance,
} from "../index.js";
import type { AssetResolveCandidateScore } from "./scoring.js";
import type { CliAssetSearchProfile } from "./types.js";
import { isPositiveVector3 } from "./vector3.js";

/**
 * Structural triangle floors mirrored from the Meshy admission profiles.
 *
 * `meshy/admission.ts` enforces a 1,000-triangle floor for vehicles and a
 * 3,000-triangle floor for humanoids; the role-admission hero floor is 3,000.
 * The same measured-and-below-floor classes are blocked here pre-download so a
 * no-key resolve refuses a distant-prop shell (e.g. the 792-triangle body
 * shell) without spending a download on it. A missing triangle count never
 * blocks: absent metadata is unproven, not unfit.
 */
export const PROVENANCE_VEHICLE_MIN_TRIANGLES = 1_000;
export const PROVENANCE_HUMANOID_MIN_TRIANGLES = 3_000;
/** Bounds aspect ratio above this is degenerate (mirrors Meshy `bounds-degeneracy`). */
export const PROVENANCE_MAX_BOUNDS_ASPECT_RATIO = 1_000;

function catalogTriangles(asset: AuraCanonicalAsset): number | undefined {
  const value = asset.triangleCount ?? asset.triangles;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function provenanceMinTriangles(asset: AuraCanonicalAsset, profile: CliAssetSearchProfile): number | undefined {
  if (asset.intendedRole === "vehicle") return PROVENANCE_VEHICLE_MIN_TRIANGLES;
  if (asset.intendedRole === "character") return PROVENANCE_HUMANOID_MIN_TRIANGLES;
  if (profile === "fighting-character" || profile === "animation-character") return PROVENANCE_HUMANOID_MIN_TRIANGLES;
  return undefined;
}

function boundsAspectWarnings(
  size: readonly [number, number, number] | undefined,
  label: string,
): readonly string[] {
  if (!size) return [];
  if (!(size.length === 3 && size.every((value) => typeof value === "number" && Number.isFinite(value) && value > 0))) {
    return [`${label} bounds are not positive and finite; inspect export scale and stray geometry`];
  }
  const ratio = Math.max(...size) / Math.min(...size);
  return ratio > PROVENANCE_MAX_BOUNDS_ASPECT_RATIO
    ? [`${label} bounds aspect ratio ${ratio.toFixed(1)} is degenerate; check export scale and stray geometry`]
    : [];
}

export function createPreDownloadCandidateBlockingWarnings(
  asset: AuraCanonicalAsset,
  profile: CliAssetSearchProfile = "general",
): readonly string[] {
  const warnings: string[] = [];
  if (asset.duplicateHash && !asset.duplicateOkReason) {
    warnings.push(`duplicate hash ${asset.duplicateHash} has no allowlist/explanation`);
  }
  if (asset.access === "direct-download" && !(asset.downloadUrl ?? asset.url)) {
    warnings.push("direct-download candidate is missing a download URL");
  }
  const triangles = catalogTriangles(asset);
  const floor = provenanceMinTriangles(asset, profile);
  if (triangles !== undefined && floor !== undefined && triangles < floor) {
    const role = asset.intendedRole === "vehicle" ? "vehicle" : "humanoid";
    warnings.push(
      `catalog reports ${triangles} triangles, below the ${role} structural floor of ${floor}; this is a distant-prop shell, not a hero subject`,
    );
  }
  warnings.push(...boundsAspectWarnings(asset.bounds?.size ?? asset.dimensions, "catalog"));
  return warnings;
}

export function createPostDownloadCandidateBlockingWarnings(
  asset: AuraCanonicalAsset,
  inspection: AssetInspectionReport,
  profile: CliAssetSearchProfile,
): readonly string[] {
  const warnings: string[] = [];
  const expectedBounds = asset.bounds?.size ?? asset.dimensions;
  if (isPositiveVector3(expectedBounds) && !isPositiveVector3(inspection.bounds)) {
    warnings.push("catalog advertised bounds/dimensions, but downloaded file produced no bounds");
  }
  if (typeof asset.materialCount === "number" && asset.materialCount > 0 && inspection.materials.length === 0) {
    warnings.push("catalog advertised materials, but downloaded file has none");
  }
  if (typeof asset.textureCount === "number" && asset.textureCount > 0 && inspection.textures.length === 0) {
    warnings.push("catalog advertised textures, but downloaded file has none");
  }
  const expectedAnimationCount = asset.animationClipCount ?? asset.animationClips?.length;
  const requiresAnimation = asset.hasAnimations === true ||
    (typeof expectedAnimationCount === "number" && expectedAnimationCount > 0) ||
    profile === "fighting-character" ||
    profile === "animation-character";
  if (requiresAnimation && inspection.animations.length === 0) {
    warnings.push("catalog/profile expected animation clips, but downloaded file has none");
  }
  if (typeof asset.skinCount === "number" && asset.skinCount > 0 && (inspection.skeleton?.skinCount ?? 0) === 0) {
    warnings.push("catalog advertised skins/skeletons, but downloaded file has none");
  }
  if (inspection.warnings.some((warning) => warning.includes("invisible or unreadable"))) {
    warnings.push("downloaded file contains invisible or unreadable materials");
  }
  // Mirror the Meshy triangle floor post-download: a catalog count that looked
  // fine (or was absent) still refuses when the role needs a hero subject and
  // the measured catalog count is a shell. Profile-aware so an explicit
  // character profile enforces the humanoid floor even when the catalog left
  // `intendedRole` blank.
  const postTriangles = catalogTriangles(asset);
  const postFloor = provenanceMinTriangles(asset, profile);
  if (postTriangles !== undefined && postFloor !== undefined && postTriangles < postFloor) {
    const role = postFloor === PROVENANCE_VEHICLE_MIN_TRIANGLES && asset.intendedRole === "vehicle" ? "vehicle" : "humanoid";
    warnings.push(
      `catalog reports ${postTriangles} triangles, below the ${role} structural floor of ${postFloor}; this is a distant-prop shell, not a hero subject`,
    );
  }
  if (inspection.bounds) {
    warnings.push(...boundsAspectWarnings(inspection.bounds, "downloaded file"));
  }
  return warnings;
}

export function createResolveCandidateProvenance(
  candidate: ResolveCandidate,
  query: string,
  score: AssetResolveCandidateScore,
  inspection: AssetInspectionReport,
): AuraCliResolveCandidateProvenance {
  const { asset } = candidate;
  return {
    catalogId: asset.id,
    query,
    source: asset.source,
    ...(asset.sourceFamily ? { sourceFamily: asset.sourceFamily } : {}),
    ...(asset.retrievedAt ? { retrievedAt: asset.retrievedAt } : {}),
    scoreTotal: score.total,
    scoreBreakdown: {
      semantic: score.semantic,
      sourceQuality: score.sourceQuality,
      license: score.license,
      inspection: score.inspection,
      roleFit: score.roleFit,
    },
    reasons: score.reasons,
    penalties: score.penalties,
    ...(asset.sourcePage ? { sourcePage: asset.sourcePage } : {}),
    ...(asset.downloadUrl ?? asset.url ? { downloadUrl: asset.downloadUrl ?? asset.url } : {}),
    license: asset.license.spdx,
    ...(asset.licenseName ?? asset.license.raw ? { licenseName: asset.licenseName ?? asset.license.raw } : {}),
    ...(asset.licenseUrl ?? asset.license.sourcePage ? { licenseUrl: asset.licenseUrl ?? asset.license.sourcePage } : {}),
    ...(asset.license.raw ? { licenseRaw: asset.license.raw } : {}),
    ...(asset.author ? { author: asset.author } : {}),
    ...(asset.attribution ? { attribution: asset.attribution } : {}),
    ...(typeof asset.semanticScore === "number" ? { semanticScore: asset.semanticScore } : {}),
    ...(typeof asset.workerScore === "number" ? { workerScore: asset.workerScore } : {}),
    ...(typeof asset.qualityScore === "number" ? { qualityScore: asset.qualityScore } : {}),
    ...(asset.bounds?.size ? { bounds: asset.bounds.size } : {}),
    ...(asset.dimensions ? { dimensions: asset.dimensions } : {}),
    ...(typeof (asset.triangleCount ?? asset.triangles) === "number" ? { triangleCount: asset.triangleCount ?? asset.triangles } : {}),
    ...(typeof asset.meshCount === "number" ? { meshCount: asset.meshCount } : {}),
    ...(typeof asset.materialCount === "number" ? { materialCount: asset.materialCount } : {}),
    ...(typeof asset.textureCount === "number" ? { textureCount: asset.textureCount } : {}),
    ...(typeof (asset.animationClipCount ?? asset.animationClips?.length) === "number" ? { animationClipCount: asset.animationClipCount ?? asset.animationClips?.length } : {}),
    ...(asset.animationClips ? { animationClips: asset.animationClips } : {}),
    ...(typeof asset.skinCount === "number" ? { skinCount: asset.skinCount } : {}),
    ...(typeof asset.morphTargetCount === "number" ? { morphTargetCount: asset.morphTargetCount } : {}),
    ...(asset.intendedRole ? { intendedRole: asset.intendedRole } : {}),
    ...(asset.roleSuitability ? { roleSuitability: asset.roleSuitability } : {}),
    ...(asset.qualityWarnings ? { qualityWarnings: asset.qualityWarnings } : {}),
    ...(asset.duplicateHash ? { duplicateHash: asset.duplicateHash } : {}),
    ...(asset.duplicateOkReason ? { duplicateOkReason: asset.duplicateOkReason } : {}),
    postDownloadInspection: {
      ...(inspection.bounds ? { bounds: inspection.bounds } : {}),
      materialCount: inspection.materials.length,
      textureCount: inspection.textures.length,
      animationClipCount: inspection.animations.length,
      skinCount: inspection.skeleton?.skinCount ?? 0,
      morphTargetCount: inspection.morphTargets?.targetCount ?? 0,
      warnings: inspection.warnings,
    },
    ...(asset.rawCatalogMetadata ? { rawCatalogMetadata: asset.rawCatalogMetadata } : {}),
  };
}

export function mapCanonicalRoleToCli(role: AuraAssetIntendedRole | undefined): AuraCliAssetRole {
  return role ?? "unknown";
}
