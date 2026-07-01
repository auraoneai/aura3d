import type {
  AuraAssetBounds,
  AuraAssetIntendedRole,
  AuraAssetLicense,
  AuraCanonicalAsset,
} from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";

export interface AuraIndexSearchResult extends Readonly<Record<string, unknown>> {
  readonly id?: string | null;
  readonly title?: string | null;
  readonly source?: string | null;
  readonly url?: string | null;
  readonly downloadUrl?: string | null;
  readonly download_url?: string | null;
  readonly downloadURL?: string | null;
  readonly sourcePage?: string | null;
  readonly source_page?: string | null;
  readonly page?: string | null;
  readonly viewerUrl?: string | null;
  readonly license?: string | null;
  readonly licenseName?: string | null;
  readonly license_name?: string | null;
  readonly licenseTitle?: string | null;
  readonly licenseUrl?: string | null;
  readonly license_url?: string | null;
  readonly thumbnail?: string | null;
  readonly attribution?: string | null;
  readonly author?: string | null;
  readonly creator?: string | null;
  readonly sourceFamily?: string | null;
  readonly source_family?: string | null;
  readonly retrievedAt?: string | null;
  readonly retrieved_at?: string | null;
  readonly semanticScore?: number | null;
  readonly semantic_score?: number | null;
  readonly score?: number | null;
  readonly workerScore?: number | null;
  readonly worker_score?: number | null;
  readonly qualityScore?: number | null;
  readonly quality_score?: number | null;
  readonly bounds?: unknown;
  readonly dimensions?: unknown;
  readonly triangles?: number | null;
  readonly triangleCount?: number | null;
  readonly triangle_count?: number | null;
  readonly meshCount?: number | null;
  readonly mesh_count?: number | null;
  readonly materialCount?: number | null;
  readonly material_count?: number | null;
  readonly textureCount?: number | null;
  readonly texture_count?: number | null;
  readonly animationClips?: readonly string[] | null;
  readonly animation_clips?: readonly string[] | null;
  readonly animationClipCount?: number | null;
  readonly animation_clip_count?: number | null;
  readonly skins?: number | null;
  readonly skinCount?: number | null;
  readonly skin_count?: number | null;
  readonly morphTargets?: number | null;
  readonly morphTargetCount?: number | null;
  readonly morph_target_count?: number | null;
  readonly intendedRole?: string | null;
  readonly intended_role?: string | null;
  readonly role?: string | null;
  readonly roleSuitability?: string | null;
  readonly role_suitability?: string | null;
  readonly suitability?: string | null;
  readonly warnings?: readonly string[] | null;
  readonly qualityWarnings?: readonly string[] | null;
  readonly quality_warnings?: readonly string[] | null;
  readonly duplicateHash?: string | null;
  readonly duplicate_hash?: string | null;
  readonly duplicateOkReason?: string | null;
  readonly duplicate_ok_reason?: string | null;
  readonly tags?: readonly string[] | null;
}

export interface AuraIndexSearchResponse {
  readonly results?: readonly AuraIndexSearchResult[];
}

export function hasAuraIndexDownloadUrl(result: AuraIndexSearchResult): boolean {
  return Boolean(stringValue(result.id) && modelDownloadUrl(result));
}

export function toAuraCanonicalAsset(result: AuraIndexSearchResult): AuraCanonicalAsset | undefined {
  const id = stringValue(result.id);
  const downloadUrl = modelDownloadUrl(result);
  if (!id || !downloadUrl) return undefined;

  const title = stringValue(result.title) ?? id;
  const sourcePage = stringValue(result.sourcePage ?? result.source_page ?? result.page ?? result.viewerUrl);
  const licenseUrl = stringValue(result.licenseUrl ?? result.license_url);
  const licensePage = licenseUrl ?? sourcePage;
  const licenseName = stringValue(result.licenseName ?? result.license_name ?? result.licenseTitle ?? result.license);
  const author = stringValue(result.author ?? result.creator ?? result.attribution);
  const animationClips = stringArrayValue(result.animationClips ?? result.animation_clips);
  const tags = assetTags(result, title);
  const triangleCount = numberValue(result.triangleCount ?? result.triangle_count ?? result.triangles);
  const meshCount = numberValue(result.meshCount ?? result.mesh_count);
  const materialCount = numberValue(result.materialCount ?? result.material_count);
  const textureCount = numberValue(result.textureCount ?? result.texture_count);
  const animationClipCount = numberValue(result.animationClipCount ?? result.animation_clip_count) ?? animationClips?.length;
  const skinCount = numberValue(result.skinCount ?? result.skin_count ?? result.skins);
  const morphTargetCount = numberValue(result.morphTargetCount ?? result.morph_target_count ?? result.morphTargets);
  const bounds = boundsValue(result.bounds);
  const dimensions = vector3Value(result.dimensions);
  const semanticScore = numberValue(result.semanticScore ?? result.semantic_score ?? result.score);
  const workerScore = numberValue(result.workerScore ?? result.worker_score);
  const qualityScore = numberValue(result.qualityScore ?? result.quality_score);
  const sourceFamily = stringValue(result.sourceFamily ?? result.source_family ?? result.source);
  const retrievedAt = stringValue(result.retrievedAt ?? result.retrieved_at);
  const intendedRole = roleValue(result.intendedRole ?? result.intended_role ?? result.role);
  const roleSuitability = stringValue(result.roleSuitability ?? result.role_suitability ?? result.suitability);
  const qualityWarnings = stringArrayValue(result.qualityWarnings ?? result.quality_warnings ?? result.warnings);
  const duplicateHash = stringValue(result.duplicateHash ?? result.duplicate_hash);
  const duplicateOkReason = stringValue(result.duplicateOkReason ?? result.duplicate_ok_reason);
  const thumbnailUrl = stringValue(result.thumbnail);

  return {
    id,
    source: stringValue(result.source) ?? "aura-index",
    title,
    url: downloadUrl,
    downloadUrl,
    access: "direct-download",
    format: "glb",
    license: catalogLicense(stringValue(result.license) ?? "", licensePage),
    ...(licenseName ? { licenseName } : {}),
    ...(licenseUrl ? { licenseUrl } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(triangleCount !== undefined ? { triangles: triangleCount, triangleCount } : {}),
    ...(meshCount !== undefined ? { meshCount } : {}),
    ...(materialCount !== undefined ? { materialCount } : {}),
    ...(textureCount !== undefined ? { textureCount } : {}),
    ...(animationClipCount !== undefined ? { animationClipCount } : {}),
    ...(animationClips ? { animationClips } : {}),
    ...(skinCount !== undefined ? { skinCount } : {}),
    ...(morphTargetCount !== undefined ? { morphTargetCount } : {}),
    ...(bounds ? { bounds } : {}),
    ...(dimensions ? { dimensions } : {}),
    ...(semanticScore !== undefined ? { semanticScore } : {}),
    ...(workerScore !== undefined ? { workerScore } : {}),
    ...(qualityScore !== undefined ? { qualityScore } : {}),
    tags,
    ...(sourcePage ? { sourcePage } : {}),
    ...(sourceFamily ? { sourceFamily } : {}),
    ...(retrievedAt ? { retrievedAt } : {}),
    ...(author ? { author, attribution: author } : {}),
    ...(intendedRole ? { intendedRole } : {}),
    ...(roleSuitability ? { roleSuitability } : {}),
    ...(qualityWarnings ? { qualityWarnings } : {}),
    ...(duplicateHash ? { duplicateHash } : {}),
    ...(duplicateOkReason ? { duplicateOkReason } : {}),
    rawCatalogMetadata: { ...result },
  };
}

function catalogLicense(spdx: string, sourcePage?: string): AuraAssetLicense {
  if (spdx.startsWith("CC0")) {
    return { spdx: "CC0-1.0", raw: spdx, verified: true, attributionRequired: false, redistributable: true, sourcePage };
  }
  if (spdx.startsWith("CC-BY")) {
    return { spdx: "CC-BY-4.0", raw: spdx, verified: true, attributionRequired: true, redistributable: true, sourcePage };
  }
  return normalizeLicense(spdx, sourcePage);
}

function modelDownloadUrl(result: AuraIndexSearchResult): string | undefined {
  return stringValue(result.downloadUrl ?? result.download_url ?? result.downloadURL ?? result.url);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function assetTags(result: AuraIndexSearchResult, title: string): readonly string[] {
  return Array.from(
    new Set([
      ...tokenize(title),
      ...(result.tags ?? []).flatMap(tokenize),
      ...tokenize(stringValue(result.role ?? result.intendedRole ?? result.intended_role) ?? ""),
    ]),
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayValue(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.map(stringValue).filter((entry): entry is string => Boolean(entry));
  return out.length > 0 ? out : undefined;
}

function roleValue(value: unknown): AuraAssetIntendedRole | undefined {
  switch (stringValue(value)?.toLowerCase()) {
    case "character":
      return "character";
    case "vehicle":
      return "vehicle";
    case "world":
      return "world";
    case "environment":
      return "environment";
    case "track":
      return "track";
    case "product":
      return "product";
    case "weapon":
      return "weapon";
    case "prop":
      return "prop";
    case "set-dressing":
      return "set-dressing";
    case "debug":
      return "debug";
    case "abstract":
      return "abstract";
    case "unknown":
      return "unknown";
    default:
      return undefined;
  }
}

function vector3Value(value: unknown): readonly [number, number, number] | undefined {
  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value.slice(0, 3).map(numberValue);
    if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
      return [x, y, z];
    }
  }
  if (value && typeof value === "object") {
    const x = numberValue("x" in value ? value.x : "width" in value ? value.width : undefined);
    const y = numberValue("y" in value ? value.y : "height" in value ? value.height : undefined);
    const z = numberValue("z" in value ? value.z : "depth" in value ? value.depth : undefined);
    if (typeof x === "number" && typeof y === "number" && typeof z === "number") {
      return [x, y, z];
    }
  }
  return undefined;
}

function boundsValue(value: unknown): AuraAssetBounds | undefined {
  if (!value || typeof value !== "object") return undefined;
  const size = vector3Value("size" in value ? value.size : "dimensions" in value ? value.dimensions : value);
  return size ? { size } : undefined;
}
