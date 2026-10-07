import type { AuraCanonicalAsset, AuraAssetIntendedRole } from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * §6.6 curated-library adapter (PRD-05 Phase 5).
 *
 * The library is the project's own `aura.library.json`: every kit/entry in it
 * was admitted through §6.4 G1–G11 with an approved §6.7 look-dev record, so
 * its records are always verified-licensed, direct-"download" (local copy),
 * and carry the §6.6 ranking signals (`library`, `lookDevApproved`,
 * `artDirection`) that make them resolve first per the §6.6 rule "catalog
 * search/resolve ranks library entries first".
 *
 * The adapter is pure: callers inject the parsed manifest so the index layer
 * stays free of filesystem assumptions (the CLI reads the file; browser-side
 * consumers can pass a bundled manifest).
 */

/** Minimal entry shape the adapter needs — a superset-free view of the CLI's library entry. */
export interface AuraLibraryEntryShape {
  readonly id: string;
  readonly kit?: string;
  readonly type: string;
  readonly format: string;
  /** Repo-relative path of the admitted bytes under assets/library/. */
  readonly libraryPath: string;
  readonly title?: string;
  readonly sizeBytes?: number;
  readonly bounds?: readonly [number, number, number];
  readonly triangleCount?: number;
  readonly meshCount?: number;
  readonly materialCount?: number;
  readonly textureCount?: number;
  readonly animationClips?: readonly { readonly name: string }[];
  readonly animations?: readonly string[];
  readonly skinned?: boolean;
  readonly role?: string;
  readonly artDirection?: string;
  readonly lookDevApproved?: boolean;
  readonly sourcePage?: string;
  readonly source?: string;
  readonly license?: string;
  readonly author?: string;
  readonly attribution?: string;
  readonly retrievedAt?: string;
  readonly tags?: readonly string[];
  /** §6.7 HDRI environment fields, carried through to canonical. */
  readonly sunDirection?: readonly [number, number, number];
  readonly luminanceP99?: number;
  readonly whiteBalanceK?: number;
  readonly downloadFileset?: readonly { readonly name: string; readonly url: string; readonly sizeBytes?: number; readonly md5?: string }[];
}

export interface AuraLibraryManifestShape {
  readonly schema: string;
  readonly kits?: readonly { readonly id: string; readonly artDirection?: string }[];
  readonly entries: readonly AuraLibraryEntryShape[];
}

export interface AuraLibraryAdapterOptions {
  readonly manifest: AuraLibraryManifestShape;
}

const ROLE_MAP: Record<string, AuraAssetIntendedRole> = {
  character: "character",
  enemy: "character",
  hero: "character",
  vehicle: "vehicle",
  world: "world",
  environment: "environment",
  track: "track",
  product: "product",
  weapon: "weapon",
  prop: "prop",
  "set-dressing": "set-dressing",
  backdrop: "set-dressing",
  debug: "debug",
  abstract: "abstract",
  hdri: "environment",
  texture: "set-dressing",
};

function toCanonical(entry: AuraLibraryEntryShape, kitArtDirection: string | undefined): AuraCanonicalAsset {
  const sourcePage = entry.sourcePage ?? entry.source ?? `library:${entry.kit ?? "misc"}/${entry.id}`;
  const license = normalizeLicense(entry.license ?? "UNVERIFIED", sourcePage);
  const role = entry.role ? ROLE_MAP[entry.role] : undefined;
  const clips = entry.animationClips?.map((c) => c.name) ?? entry.animations;
  return {
    id: `library:${entry.id}`,
    source: "aura-library",
    title: entry.title ?? entry.id,
    url: entry.libraryPath,
    downloadUrl: entry.libraryPath,
    access: "direct-download",
    format: (entry.format === "gltf" || entry.format === "glb" ? entry.format : entry.format) as AuraCanonicalAsset["format"],
    license,
    licenseName: entry.license,
    licenseUrl: sourcePage,
    fileSizeBytes: entry.sizeBytes,
    bounds: entry.bounds ? { size: entry.bounds } : undefined,
    dimensions: entry.bounds,
    triangleCount: entry.triangleCount,
    triangles: entry.triangleCount,
    meshCount: entry.meshCount,
    materialCount: entry.materialCount,
    textureCount: entry.textureCount,
    animationClips: clips,
    animationClipCount: clips?.length,
    skinCount: entry.skinned ? 1 : undefined,
    hasAnimations: clips !== undefined && clips.length > 0,
    tags: (entry.tags ?? []).map((t) => t.toLowerCase()),
    sourcePage,
    sourceFamily: entry.kit ? `library/${entry.kit}` : "aura-library",
    retrievedAt: entry.retrievedAt,
    author: entry.author,
    attribution: entry.attribution ?? entry.author,
    intendedRole: role,
    library: { kitId: entry.kit ?? "misc", entryId: entry.id, path: entry.libraryPath },
    lookDevApproved: entry.lookDevApproved === true,
    artDirection: entry.artDirection ?? kitArtDirection,
    ...(entry.sunDirection ? { sunDirection: entry.sunDirection } : {}),
    ...(entry.luminanceP99 !== undefined ? { luminanceP99: entry.luminanceP99 } : {}),
    ...(entry.whiteBalanceK !== undefined ? { whiteBalanceK: entry.whiteBalanceK } : {}),
    ...(entry.downloadFileset ? { downloadFileset: entry.downloadFileset } : {}),
    rawCatalogMetadata: { kit: entry.kit },
  };
}

export function createAuraLibraryAdapter(options: AuraLibraryAdapterOptions): SourceAdapter {
  const kitArtDirection = new Map(
    (options.manifest.kits ?? []).map((kit) => [kit.id, kit.artDirection] as const),
  );
  return {
    id: "aura-library",
    label: "Aura3D §6.6 curated library",
    async search(_query: ResolveQuery, _ctx: AdapterContext) {
      return options.manifest.entries.map((entry) => toCanonical(entry, kitArtDirection.get(entry.kit ?? "")));
    },
  };
}
