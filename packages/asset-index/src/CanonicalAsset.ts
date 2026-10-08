/**
 * Canonical, source-agnostic asset record.
 *
 * Every source adapter (Khronos, OS3A, Poly Pizza, Sketchfab, ...) normalizes
 * its native records into this one shape so the federation/ranking layer never
 * has to know which source an asset came from.
 *
 * Design rule that mirrors the rest of Aura3D: this index RECORDS license; it
 * never guesses one. An asset whose license could not be verified is marked
 * `UNVERIFIED` and is NOT auto-pullable until a verification pass resolves it.
 */

/** Spec-style license identifiers we normalize source license strings into. */
export type AuraAssetLicenseSpdx =
  | "CC0-1.0"
  | "CC-BY-4.0"
  | "CC-BY-3.0"
  | "UNVERIFIED";

export interface AuraAssetLicense {
  /** Normalized SPDX-style id, or `UNVERIFIED` when the source did not state one. */
  readonly spdx: AuraAssetLicenseSpdx;
  /** Raw license string as it appeared in the source, for provenance/debugging. */
  readonly raw: string;
  /** True only when the license came from an authoritative field in the source. */
  readonly verified: boolean;
  /** True when downstream use must carry attribution (CC-BY family). */
  readonly attributionRequired: boolean;
  /**
   * True when Aura may auto-pull and copy the file into a user project.
   * CC0 and CC-BY qualify (CC-BY also sets `attributionRequired`).
   * `UNVERIFIED` and marketplace deep-links do NOT qualify.
   */
  readonly redistributable: boolean;
  /** Human-checkable page where the license can be confirmed. */
  readonly sourcePage?: string;
}

/**
 * `glb`/`gltf` for models; `hdr` for radiance environment maps; `texture-set`
 * for a PBR map bundle (base/normal/ORM/...) assembled per-source; `image` for
 * a standalone texture file. PRD-05 §6.6 added the non-model values so HDRI and
 * texture sources federate through the same canonical record.
 */
export type AuraAssetFormat = "glb" | "gltf" | "hdr" | "texture-set" | "image";

/** One directly-fetchable file belonging to a canonical record. */
export interface AuraAssetFileEntry {
  readonly name: string;
  readonly url: string;
  readonly sizeBytes?: number;
  readonly md5?: string;
}

/** Membership of the curated §6.6 library (aura.library.json). */
export interface AuraLibraryMembership {
  /** Kit id, e.g. "characters/humanoid-pbr" or "hdri". */
  readonly kitId: string;
  /** Entry id inside the kit. */
  readonly entryId: string;
  /** Repo-relative path of the admitted bytes (e.g. assets/library/hdri/x.hdr). */
  readonly path: string;
}

/** Whether the file can be fetched directly or is a discovery deep-link only. */
export type AuraAssetAccess = "direct-download" | "deep-link-only";

export interface AuraAssetBounds {
  readonly size: readonly [number, number, number];
}

export type AuraAssetIntendedRole =
  | "character"
  | "vehicle"
  | "world"
  | "environment"
  | "track"
  | "product"
  | "weapon"
  | "prop"
  | "set-dressing"
  | "debug"
  | "abstract"
  | "unknown";

export interface AuraCanonicalAsset {
  /** Globally unique, namespaced id: `${source}:${sourceLocalId}`. */
  readonly id: string;
  /** Adapter id that produced this record (e.g. `"khronos"`, `"os3a"`). */
  readonly source: string;
  readonly title: string;
  readonly description?: string;
  /** Direct file URL, or the deep-link page when access is `deep-link-only`. */
  readonly url: string;
  /** Direct model download URL, preserved separately from the source page. */
  readonly downloadUrl?: string;
  readonly access: AuraAssetAccess;
  readonly format: AuraAssetFormat;
  readonly license: AuraAssetLicense;
  readonly licenseName?: string;
  readonly licenseUrl?: string;
  readonly thumbnailUrl?: string;
  readonly fileSizeBytes?: number;
  /** Triangle count when the source exposes it; otherwise undefined (enriched later). */
  readonly triangles?: number;
  readonly triangleCount?: number;
  readonly meshCount?: number;
  readonly materialCount?: number;
  readonly textureCount?: number;
  readonly animationClipCount?: number;
  readonly animationClips?: readonly string[];
  readonly skinCount?: number;
  readonly morphTargetCount?: number;
  readonly hasAnimations?: boolean;
  readonly bounds?: AuraAssetBounds;
  readonly dimensions?: readonly [number, number, number];
  /** Source popularity signal (e.g. Sketchfab likes) — feeds quality ranking. */
  readonly likeCount?: number;
  /** Source popularity signal (e.g. Sketchfab views) — feeds quality ranking. */
  readonly viewCount?: number;
  /** Hosted catalog semantic score, when a source exposes one. */
  readonly semanticScore?: number;
  /** Source worker rank/score before Aura federation, when available. */
  readonly workerScore?: number;
  /** Source quality score before Aura federation, when available. */
  readonly qualityScore?: number;
  /** Lowercased keywords used for relevance ranking. */
  readonly tags: readonly string[];
  /** Authoritative human page for the asset (license, author, terms). */
  readonly sourcePage?: string;
  readonly sourceFamily?: string;
  readonly retrievedAt?: string;
  readonly author?: string;
  /** Free-form attribution credit captured at index time (author/creator). */
  readonly attribution?: string;
  readonly intendedRole?: AuraAssetIntendedRole;
  readonly roleSuitability?: string;
  readonly qualityWarnings?: readonly string[];
  readonly duplicateHash?: string;
  readonly duplicateOkReason?: string;
  /**
   * Multi-file pull set (PRD-05 §6.6): HDRIs carry one entry per resolution;
   * texture-sets carry one entry per map/zip. `url`/`downloadUrl` remain the
   * canonical single-file choice when the source has one.
   */
  readonly downloadFileset?: readonly AuraAssetFileEntry[];
  /** §6.6 library membership — set only for entries read from aura.library.json. */
  readonly library?: AuraLibraryMembership;
  /** True when the entry carries an approved §6.7 look-dev record (G9). */
  readonly lookDevApproved?: boolean;
  /** `assets/art-direction/<id>.json` id the entry was admitted under (G10). */
  readonly artDirection?: string;
  /** §6.7 HDRI: dominant-light direction (unit vector, equirect). */
  readonly sunDirection?: readonly [number, number, number];
  /** §6.7 HDRI: 99th-percentile relative luminance. */
  readonly luminanceP99?: number;
  /** §6.7 HDRI: estimated white balance (McCamy CCT, kelvin). */
  readonly whiteBalanceK?: number;
  readonly rawCatalogMetadata?: Readonly<Record<string, unknown>>;
}

/**
 * True when an asset may be auto-resolved and pulled into a project without a
 * human licensing decision: it must be directly downloadable and carry a
 * verified, redistributable license.
 */
export function isAutoPullable(asset: AuraCanonicalAsset): boolean {
  return (
    asset.access === "direct-download" &&
    asset.license.verified &&
    asset.license.redistributable
  );
}

const LICENSE_TABLE: Record<string, Omit<AuraAssetLicense, "raw" | "sourcePage">> = {
  cc0: { spdx: "CC0-1.0", verified: true, attributionRequired: false, redistributable: true },
  "cc0-1.0": { spdx: "CC0-1.0", verified: true, attributionRequired: false, redistributable: true },
  "public domain": { spdx: "CC0-1.0", verified: true, attributionRequired: false, redistributable: true },
  "cc-by": { spdx: "CC-BY-4.0", verified: true, attributionRequired: true, redistributable: true },
  "cc-by-4.0": { spdx: "CC-BY-4.0", verified: true, attributionRequired: true, redistributable: true },
  "cc-by-3.0": { spdx: "CC-BY-3.0", verified: true, attributionRequired: true, redistributable: true },
};

/**
 * Normalize a raw source license string into an {@link AuraAssetLicense}.
 * Anything not recognized becomes `UNVERIFIED` (non-redistributable) so the
 * resolver can never auto-pull a file whose terms we have not confirmed.
 */
export function normalizeLicense(
  raw: string | null | undefined,
  sourcePage?: string,
): AuraAssetLicense {
  const key = (raw ?? "").trim().toLowerCase();
  const hit = LICENSE_TABLE[key];
  if (hit) {
    return { ...hit, raw: raw ?? "", sourcePage };
  }
  return {
    spdx: "UNVERIFIED",
    raw: raw ?? "",
    verified: false,
    attributionRequired: true,
    redistributable: false,
    sourcePage,
  };
}
