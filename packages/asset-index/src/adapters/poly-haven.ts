import type { AuraCanonicalAsset, AuraAssetBounds } from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * Poly Haven adapter — https://polyhaven.com (free public API, NO key).
 *
 * Verified live (June 2026):
 *   GET https://api.polyhaven.com/assets?t=models
 *     -> Record<assetId, {
 *          name, type, categories: string[], tags: string[],
 *          authors: Record<author, role>, dimensions?: [x,y,z] (millimetres),
 *          polycount?: number, thumbnail_url?, date_published, description?
 *        }>
 *   GET https://api.polyhaven.com/files/{id}
 *     -> { gltf: { "1k"|"2k"|"4k": { gltf: { url, size, include: {...} } } }, blend, fbx, usd }
 *
 * Every Poly Haven asset is CC0 (the entire library is CC0-1.0), so the license
 * is genuinely verified + redistributable.
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
const ASSETS_URL = `${API_BASE}/assets?t=models`;
const PAGE_BASE = "https://polyhaven.com/a";

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

function toCanonical(id: string, asset: PolyHavenAsset): AuraCanonicalAsset {
  const sourcePage = `${PAGE_BASE}/${id}`;
  const title = asset.name ?? id;
  const tags = Array.from(
    new Set([
      ...(asset.tags ?? []).map((t) => t.toLowerCase()),
      ...(asset.categories ?? []).map((c) => c.toLowerCase()),
      ...tokenize(title),
    ]),
  );
  return {
    id: `poly-haven:${id}`,
    source: "poly-haven",
    title,
    description: asset.description,
    // Multi-file glTF: the canonical page is the honest deep-link target.
    url: sourcePage,
    access: "deep-link-only",
    format: "gltf",
    // Entire Poly Haven library is CC0 — a verified, redistributable license.
    license: normalizeLicense("CC0", sourcePage),
    thumbnailUrl: asset.thumbnail_url,
    triangles: typeof asset.polycount === "number" ? asset.polycount : undefined,
    bounds: toBounds(asset.dimensions),
    tags,
    sourcePage,
    attribution: authorsToAttribution(asset.authors),
  };
}

async function loadAll(ctx: AdapterContext): Promise<AuraCanonicalAsset[]> {
  const raw = await ctx.fetchJson(ASSETS_URL);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("poly-haven /assets did not return an object map");
  }
  const out: AuraCanonicalAsset[] = [];
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (id && value && typeof value === "object") {
      out.push(toCanonical(id, value as PolyHavenAsset));
    }
  }
  return out;
}

export function createPolyHavenAdapter(): SourceAdapter {
  let cache: AuraCanonicalAsset[] | null = null;

  return {
    id: "poly-haven",
    label: "Poly Haven (CC0)",
    async search(_query: ResolveQuery, ctx: AdapterContext) {
      if (!cache) cache = await loadAll(ctx);
      return cache;
    },
  };
}
