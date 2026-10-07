import type { AuraCanonicalAsset, AuraAssetBounds, AuraAssetFileEntry } from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * Poly Haven adapter — https://polyhaven.com (free public API, NO key).
 *
 * Verified live (June 2026; HDRI/texture files verified Oct 2026):
 *   GET https://api.polyhaven.com/assets?t=models|hdris|textures
 *     -> Record<assetId, {
 *          name, type, categories: string[], tags: string[],
 *          authors: Record<author, role>, dimensions?: [x,y,z] (millimetres),
 *          polycount?: number, thumbnail_url?, date_published, description?
 *        }>
 *   GET https://api.polyhaven.com/files/{id}
 *     -> models:   { gltf: { "1k"|"2k"|"4k": { gltf: { url, size, include: {...} } } }, blend, fbx, usd }
 *        hdris:    { hdri: { "1k"|"2k"|"4k"|"8k"|"16k": { hdr: {url,size,md5}, exr: {...} } }, tonemapped, colorchart }
 *        textures: { Diffuse|nor_gl|arm|AO|Displacement|Rough|...: { "1k"|...: { jpg|png|exr: {url,size,md5} } } }
 *
 * Every Poly Haven asset is CC0 (the entire library is CC0-1.0), so the license
 * is genuinely verified + redistributable.
 *
 * PRD-05 §6.6: HDRIs and textures are DIRECT downloads —
 *   .hdr files are single-file (`dl.polyhaven.org/file/ph-assets/HDRIs/...`),
 *   texture records carry `downloadFileset` with the per-map JPG/PNG URLs the
 *   puller assembles into a material entry.
 * The file endpoints are fetched lazily for the best query matches only
 *   (bounded at FILE_ENRICH_LIMIT) — the catalog listing does not carry URLs,
 *   and constructing them from a guessed pattern without verification would be
 *   a provenance lie. Unmatched records stay `deep-link-only` on the source
 *   page, honestly.
 *
 * IMPORTANT honesty note on `access`: Poly Haven models are multi-file glTF —
 * the `.gltf` references an external `.bin` plus texture files (see the `include`
 * map on the /files endpoint). Fetching only the `.gltf` URL therefore does NOT
 * yield a self-contained, usable asset. We will not claim `direct-download` for
 * a file that cannot stand alone, so these records are `deep-link-only` pointing
 * at the canonical asset page. They are CC0 (so a future enrichment pass may
 * resolve a packaged single-file pull), but they are not auto-pullable as-is.
 */

const API_BASE = "https://api.polyhaven.com";
const ASSETS_URL = `${API_BASE}/assets`;
const FILES_URL = `${API_BASE}/files`;
const PAGE_BASE = "https://polyhaven.com/a";

/** Max per-asset /files/<id> lookups per search call, spread over matches. */
const FILE_ENRICH_LIMIT = 16;
/** Preferred resolution picked for `downloadUrl`/first fileset entry. */
const PREFERRED_HDRI_RES = "2k";
const PREFERRED_TEXTURE_RES = "2k";
const PREFERRED_TEXTURE_FORMAT = "jpg";
/** Canonical PBR slots pulled into a texture-set fileset when present. */
const TEXTURE_MAP_KEYS = ["Diffuse", "nor_gl", "arm", "AO", "Rough", "Displacement", "rough_ao"] as const;

/** Millimetres -> metres for the canonical bounds size. */
const MM_TO_M = 0.001;

interface PolyHavenAsset {
  readonly name?: string;
  readonly type?: number;
  readonly categories?: readonly string[];
  readonly tags?: readonly string[];
  readonly authors?: Record<string, string>;
  readonly dimensions?: readonly number[];
  readonly polycount?: number;
  readonly thumbnail_url?: string;
  readonly description?: string;
  readonly date_published?: number;
}

type PolyHavenType = "models" | "hdris" | "textures";

interface FilesFileVariant {
  readonly url: string;
  readonly size?: number;
  readonly md5?: string;
  readonly include?: Record<string, unknown>;
}

type FilesResponse = Record<string, Record<string, Record<string, FilesFileVariant | undefined> | FilesFileVariant | undefined> | undefined>;

function tokenize(text: string): string[] {
  return text
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function toBounds(dimensions: readonly number[] | undefined): AuraAssetBounds | undefined {
  if (!dimensions || dimensions.length < 3) return undefined;
  const [x, y, z] = dimensions;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof z !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return undefined;
  }
  return { size: [x * MM_TO_M, y * MM_TO_M, z * MM_TO_M] };
}

function authorsToAttribution(
  authors: Record<string, string> | undefined,
): string | undefined {
  if (!authors) return undefined;
  const names = Object.keys(authors).filter((n) => n.length > 0);
  return names.length > 0 ? names.join(", ") : undefined;
}

function toCanonical(id: string, asset: PolyHavenAsset, kind: PolyHavenType): AuraCanonicalAsset {
  const sourcePage = `${PAGE_BASE}/${id}`;
  const title = asset.name ?? id;
  const author = authorsToAttribution(asset.authors);
  const bounds = toBounds(asset.dimensions);
  const tags = Array.from(
    new Set([
      ...(asset.tags ?? []).map((t) => t.toLowerCase()),
      ...(asset.categories ?? []).map((c) => c.toLowerCase()),
      ...tokenize(title),
      ...(kind !== "models" ? [kind === "hdris" ? "hdri" : "texture", kind.slice(0, -1)] : []),
    ]),
  );
  const base = {
    id: `poly-haven:${id}`,
    source: "poly-haven",
    title,
    description: asset.description,
    url: sourcePage,
    sourcePage,
    thumbnailUrl: asset.thumbnail_url,
    license: normalizeLicense("CC0", sourcePage),
    licenseName: "CC0",
    licenseUrl: sourcePage,
    bounds,
    dimensions: bounds?.size,
    triangles: typeof asset.polycount === "number" ? asset.polycount : undefined,
    triangleCount: typeof asset.polycount === "number" ? asset.polycount : undefined,
    tags,
    sourceFamily: "poly-haven",
    retrievedAt: typeof asset.date_published === "number" ? new Date(asset.date_published * 1000).toISOString() : undefined,
    author,
    attribution: author,
  };
  if (kind === "models") {
    return {
      ...base,
      // Multi-file glTF: the canonical page is the honest deep-link target.
      access: "deep-link-only",
      format: "gltf",
      rawCatalogMetadata: { ...asset },
    };
  }
  return {
    ...base,
    // HDRI/texture records start deep-link-only; query-matched records get a
    // verified direct-download upgrade from /files/<id> in `enrichMatches`.
    access: "deep-link-only",
    format: kind === "hdris" ? "hdr" : "texture-set",
    intendedRole: kind === "hdris" ? "environment" : undefined,
    rawCatalogMetadata: { ...asset, polyhavenType: kind, filesEndpoint: `${FILES_URL}/${id}` },
  };
}

/** Cheap local relevance so /files lookups go to plausible matches only. */
function queryRelevance(query: string, asset: AuraCanonicalAsset): number {
  const terms = tokenize(query);
  if (terms.length === 0) return 0;
  const hay = `${asset.title} ${asset.description ?? ""} ${asset.tags.join(" ")}`.toLowerCase();
  let score = 0;
  for (const t of terms) if (hay.includes(t)) score += 1;
  return score;
}

function fileEntry(name: string, variant: FilesFileVariant | undefined): AuraAssetFileEntry | undefined {
  if (!variant?.url) return undefined;
  return { name, url: variant.url, sizeBytes: variant.size, md5: variant.md5 };
}

/** /files/<id> → canonical upgrade for an HDRI record. */
function enrichHdri(asset: AuraCanonicalAsset, files: FilesResponse): AuraCanonicalAsset {
  const hdri = files["hdri"] as Record<string, Record<string, FilesFileVariant | undefined>> | undefined;
  if (!hdri) return asset;
  const fileset: AuraAssetFileEntry[] = [];
  for (const res of ["1k", "2k", "4k", "8k"] as const) {
    const entry = fileEntry(`${res}.hdr`, hdri[res]?.["hdr"]);
    if (entry) fileset.push(entry);
  }
  if (fileset.length === 0) return asset;
  const preferred = fileset.find((f) => f.name === `${PREFERRED_HDRI_RES}.hdr`) ?? fileset[0]!;
  return {
    ...asset,
    url: preferred.url,
    downloadUrl: preferred.url,
    access: "direct-download",
    downloadFileset: fileset,
    fileSizeBytes: preferred.sizeBytes,
    rawCatalogMetadata: { ...(asset.rawCatalogMetadata ?? {}), filesVerified: true },
  };
}

/** /files/<id> → canonical upgrade for a texture-set record (per-map pulls). */
function enrichTexture(asset: AuraCanonicalAsset, files: FilesResponse): AuraCanonicalAsset {
  const fileset: AuraAssetFileEntry[] = [];
  for (const mapKey of TEXTURE_MAP_KEYS) {
    const map = files[mapKey] as Record<string, Record<string, FilesFileVariant | undefined>> | undefined;
    if (!map) continue;
    const res = map[PREFERRED_TEXTURE_RES] ?? map["1k"];
    const variant = res?.[PREFERRED_TEXTURE_FORMAT] ?? res?.["png"];
    const entry = fileEntry(`${mapKey}.${PREFERRED_TEXTURE_FORMAT}`, variant);
    if (entry) fileset.push(entry);
  }
  if (fileset.length === 0) return asset;
  return {
    ...asset,
    // No single-file URL exists; url stays the source page and the puller
    // consumes downloadFileset (assembled locally into a material entry).
    access: "direct-download",
    downloadFileset: fileset,
    textureCount: fileset.length,
    rawCatalogMetadata: { ...(asset.rawCatalogMetadata ?? {}), filesVerified: true },
  };
}

async function loadAll(ctx: AdapterContext): Promise<AuraCanonicalAsset[]> {
  const [models, hdris, textures] = await Promise.all([
    ctx.fetchJson(`${ASSETS_URL}?t=models`),
    ctx.fetchJson(`${ASSETS_URL}?t=hdris`),
    ctx.fetchJson(`${ASSETS_URL}?t=textures`),
  ]);
  const out: AuraCanonicalAsset[] = [];
  const push = (raw: unknown, kind: PolyHavenType) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`poly-haven /assets?t=${kind} did not return an object map`);
    }
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (id && value && typeof value === "object") {
        out.push(toCanonical(id, value as PolyHavenAsset, kind));
      }
    }
  };
  push(models, "models");
  push(hdris, "hdris");
  push(textures, "textures");
  return out;
}

/**
 * Fetch /files/<id> for the best query matches among HDRI/texture records and
 * upgrade them to verified direct-downloads. Bounded + parallel; failures leave
 * the record deep-link-only (still CC0-correct, just not pullable).
 */
async function enrichMatches(
  query: ResolveQuery,
  assets: AuraCanonicalAsset[],
  ctx: AdapterContext,
): Promise<AuraCanonicalAsset[]> {
  const enrichable = assets
    .filter((a) => (a.rawCatalogMetadata as { polyhavenType?: string } | undefined)?.polyhavenType !== undefined)
    .map((asset) => ({ asset, relevance: queryRelevance(query.text, asset) }))
    .filter((m) => m.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, FILE_ENRICH_LIMIT);
  if (enrichable.length === 0) return assets;

  const byId = new Map(enrichable.map(({ asset }) => [asset.id, asset]));
  await Promise.all(
    enrichable.map(async ({ asset }) => {
      const localId = asset.id.slice("poly-haven:".length);
      try {
        const files = (await ctx.fetchJson(`${FILES_URL}/${localId}`)) as FilesResponse;
        const kind = (asset.rawCatalogMetadata as { polyhavenType?: string }).polyhavenType;
        const upgraded = kind === "hdris" ? enrichHdri(asset, files) : enrichTexture(asset, files);
        byId.set(asset.id, upgraded);
      } catch {
        // leave the deep-link-only record as-is
      }
    }),
  );
  return assets.map((asset) => byId.get(asset.id) ?? asset);
}

export function createPolyHavenAdapter(): SourceAdapter {
  let cache: AuraCanonicalAsset[] | null = null;

  return {
    id: "poly-haven",
    label: "Poly Haven (CC0)",
    async search(query: ResolveQuery, ctx: AdapterContext) {
      if (!cache) cache = await loadAll(ctx);
      return enrichMatches(query, cache, ctx);
    },
  };
}
