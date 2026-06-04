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

export type AuraAssetFormat = "glb" | "gltf";

/** Whether the file can be fetched directly or is a discovery deep-link only. */
export type AuraAssetAccess = "direct-download" | "deep-link-only";

export interface AuraAssetBounds {
  readonly size: readonly [number, number, number];
}

export interface AuraCanonicalAsset {
  /** Globally unique, namespaced id: `${source}:${sourceLocalId}`. */
  readonly id: string;
  /** Adapter id that produced this record (e.g. `"khronos"`, `"os3a"`). */
  readonly source: string;
  readonly title: string;
  readonly description?: string;
  /** Direct file URL, or the deep-link page when access is `deep-link-only`. */
  readonly url: string;
  readonly access: AuraAssetAccess;
  readonly format: AuraAssetFormat;
  readonly license: AuraAssetLicense;
  readonly thumbnailUrl?: string;
  readonly fileSizeBytes?: number;
  /** Triangle count when the source exposes it; otherwise undefined (enriched later). */
  readonly triangles?: number;
  readonly hasAnimations?: boolean;
  readonly bounds?: AuraAssetBounds;
  /** Lowercased keywords used for relevance ranking. */
  readonly tags: readonly string[];
  /** Authoritative human page for the asset (license, author, terms). */
  readonly sourcePage?: string;
  /** Free-form attribution credit captured at index time (author/creator). */
  readonly attribution?: string;
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
