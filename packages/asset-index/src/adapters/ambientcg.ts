import type { AuraCanonicalAsset, AuraAssetFileEntry } from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * ambientCG adapter — https://ambientcg.com (free public JSON API, NO key).
 *
 * Verified live (Oct 2026):
 *   GET https://ambientcg.com/api/v2/full_json?type=Material&include=downloadData&limit=N&offset=N
 *     -> { foundAssets: [{
 *          assetId, displayName, displayCategory, tags[], popularityScore,
 *          shortLink, dataType ("Material"), dimensionX/Y/Z,
 *          downloadFolders: { default: { downloadFiletypeCategories:
 *            { zip: { downloads: [{ fullDownloadPath, fileName, size, attribute: "1K-JPG", ... }] } } } }
 *        }], nextPageHttp }
 *
 * All ambientCG content is released under CC0-1.0 (stated on the API's own
 * terms-of-use page: https://docs.ambientcg.com/legal/), so the license is
 * verified + redistributable.
 *
 * Every record is a single-zip direct download; `downloadUrl` is the 2K-JPG
 * zip (the lane's default ingest res) and `downloadFileset` carries the
 * 1K/2K PNG+JPG variants so a puller can pick. Records are `texture-set`
 * format — ambientCG materials are map bundles, not meshes.
 */

const API_URL = "https://ambientcg.com/api/v2/full_json";
const PAGE_BASE = "https://ambientcg.com/a";
/** Pages of 200 catalog rows; the full material catalog is ~2.5k rows. */
const PAGE_LIMIT = 200;
const MAX_PAGES = 14;
const PREFERRED_ZIP = "2K-JPG";
const FILESET_ZIP_ATTRS = ["1K-JPG", "2K-JPG", "1K-PNG", "2K-PNG"] as const;

interface AmbientCgDownload {
  readonly fullDownloadPath?: string;
  readonly downloadLink?: string;
  readonly fileName?: string;
  readonly size?: number;
  readonly attribute?: string;
}

interface AmbientCgAsset {
  readonly assetId?: string;
  readonly displayName?: string;
  readonly displayCategory?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly popularityScore?: number;
  readonly downloadCount?: number;
  readonly shortLink?: string;
  readonly dimensionX?: number;
  readonly dimensionY?: number;
  readonly dimensionZ?: number;
  readonly dataType?: string;
  readonly createdUsing?: readonly string[];
  readonly downloadFolders?: {
    readonly default?: {
      readonly downloadFiletypeCategories?: {
        readonly zip?: { readonly downloads?: readonly AmbientCgDownload[] };
      };
    };
  };
}

interface AmbientCgResponse {
  readonly foundAssets?: readonly AmbientCgAsset[];
  readonly nextPageHttp?: string;
}

function tokenize(text: string): string[] {
  return text
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function toCanonical(asset: AmbientCgAsset): AuraCanonicalAsset | undefined {
  const id = asset.assetId;
  if (!id) return undefined;
  const zips = asset.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads ?? [];
  const preferred = zips.find((z) => z.attribute === PREFERRED_ZIP && z.fullDownloadPath);
  if (!preferred?.fullDownloadPath) return undefined;
  const fileset: AuraAssetFileEntry[] = FILESET_ZIP_ATTRS.flatMap((attr) => {
    const zip = zips.find((z) => z.attribute === attr && z.fullDownloadPath);
    return zip ? [{ name: zip.fileName ?? `${id}-${attr}.zip`, url: zip.fullDownloadPath!, sizeBytes: zip.size }] : [];
  });
  const sourcePage = asset.shortLink ?? `${PAGE_BASE}/${id}`;
  const title = asset.displayName ?? id;
  const sizeCm = asset.dimensionX;
  const tags = Array.from(
    new Set([
      ...(asset.tags ?? []).map((t) => t.toLowerCase()),
      ...(asset.displayCategory ? [asset.displayCategory.toLowerCase()] : []),
      ...tokenize(title),
      "texture", "pbr", "material",
    ]),
  );
  return {
    id: `ambientcg:${id}`,
    source: "ambientcg",
    title,
    description: asset.description || asset.displayCategory,
    url: preferred.fullDownloadPath,
    downloadUrl: preferred.fullDownloadPath,
    downloadFileset: fileset.length > 0 ? fileset : [{ name: preferred.fileName ?? `${id}-${PREFERRED_ZIP}.zip`, url: preferred.fullDownloadPath, sizeBytes: preferred.size }],
    access: "direct-download",
    format: "texture-set",
    license: normalizeLicense("CC0-1.0", sourcePage),
    licenseName: "CC0-1.0",
    licenseUrl: "https://docs.ambientcg.com/legal/",
    fileSizeBytes: preferred.size,
    bounds: typeof sizeCm === "number" && sizeCm > 0
      ? { size: [sizeCm / 100, (asset.dimensionY ?? sizeCm) / 100, (asset.dimensionZ ?? 0) / 100] }
      : undefined,
    qualityScore: typeof asset.popularityScore === "number" ? asset.popularityScore : undefined,
    tags,
    sourcePage,
    sourceFamily: "ambientcg",
    author: "ambientCG",
    attribution: "ambientCG (CC0)",
    intendedRole: "set-dressing",
    roleSuitability: "Tiling PBR texture set (diffuse/normal/ORM-style maps in one zip) — assemble into a material entry.",
    rawCatalogMetadata: { dataType: asset.dataType, dimensionCm: [asset.dimensionX, asset.dimensionY, asset.dimensionZ] },
  };
}

async function loadAll(ctx: AdapterContext): Promise<AuraCanonicalAsset[]> {
  const out: AuraCanonicalAsset[] = [];
  let url: string | undefined = `${API_URL}?type=Material&include=downloadData&limit=${PAGE_LIMIT}&offset=0`;
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = (await ctx.fetchJson(url)) as AmbientCgResponse;
    for (const asset of res.foundAssets ?? []) {
      const record = toCanonical(asset);
      if (record) out.push(record);
    }
    url = res.nextPageHttp;
  }
  return out;
}

export function createAmbientCgAdapter(): SourceAdapter {
  let cache: AuraCanonicalAsset[] | null = null;

  return {
    id: "ambientcg",
    label: "ambientCG (CC0)",
    async search(_query: ResolveQuery, ctx: AdapterContext) {
      if (!cache) cache = await loadAll(ctx);
      return cache;
    },
  };
}
