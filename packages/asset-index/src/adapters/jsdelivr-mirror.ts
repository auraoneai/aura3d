import type { AuraCanonicalAsset } from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * jsDelivr CC0 mirror adapter.
 *
 * Reads a manifest of CC0 GLBs that an extraction pipeline mirrored from
 * ZIP-pack sources (Kenney, Quaternius, curated OpenGameArt) into a public
 * GitHub repo, which jsDelivr fronts as a free CDN. We host nothing ourselves:
 * the files live in the mirror repo and are served from `cdn.jsdelivr.net/gh/...`.
 *
 * Manifest shape (schema "aura3d-cc0-mirror/1"):
 *   { schema, cdnBase, assets: [
 *       { id, source, pack?, title, path, license, tags?, triangles?, animated? }
 *   ] }
 * Each asset's download URL is `${cdnBase}/${path}`. Only CC0/CC-BY entries are
 * mirrored, so every record is verified and auto-pullable.
 */

// Manifest is read from raw GitHub (always fresh — no CDN cache lag), while the
// GLB files it points at are served from jsDelivr (fast, content-stable).
const DEFAULT_MANIFEST_URL =
  "https://raw.githubusercontent.com/gchahal1982/aura3d-cc0-assets/main/manifest.json";

interface MirrorAsset {
  readonly id: string;
  readonly source?: string;
  readonly pack?: string;
  readonly title?: string;
  readonly path: string;
  readonly license?: string;
  readonly tags?: readonly string[];
  readonly triangles?: number;
  readonly animated?: boolean;
  /**
   * Curation score from a one-time `screen:assets` pass (0..1). Written by the
   * mirror pipeline from retained screening verdicts; feeds `qualityScore` so
   * ranking boosts proven picks with no key and no browser.
   */
  readonly qualityScore?: number;
  /** True when the asset is a curated hero shortlist pick. */
  readonly heroCandidate?: boolean;
}

interface MirrorManifest {
  readonly schema?: string;
  readonly cdnBase?: string;
  readonly assets?: readonly MirrorAsset[];
  /**
   * Curated hero shortlist: manifest ids promoted by a `screen:assets` pass.
   * Kept top-level so curation survives per-asset rewrites; entries also carry
   * `heroCandidate: true` individually.
   */
  readonly heroCandidates?: readonly string[];
  readonly screening?: {
    readonly report?: string;
    readonly generatedAt?: string;
  };
}

function tokenize(text: string): string[] {
  return text
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function toCanonical(asset: MirrorAsset, cdnBase: string, heroIds: ReadonlySet<string>): AuraCanonicalAsset | null {
  if (!asset.path || typeof asset.id !== "string") return null;
  const title = asset.title ?? asset.id;
  const provenance = asset.source ?? "mirror";
  const downloadUrl = `${cdnBase}/${asset.path}`;
  const sourcePage = `https://github.com/gchahal1982/aura3d-cc0-assets/blob/main/${asset.path}`;
  const tags = Array.from(
    new Set([
      ...tokenize(title),
      ...(asset.tags ?? []).flatMap(tokenize),
      ...tokenize(asset.pack ?? ""),
    ]),
  );
  const heroCandidate = asset.heroCandidate === true || heroIds.has(asset.id);
  const qualityScore = typeof asset.qualityScore === "number" && Number.isFinite(asset.qualityScore)
    ? asset.qualityScore
    : heroCandidate ? 0.9 : undefined;
  return {
    id: asset.id,
    source: `mirror:${provenance}`,
    title,
    url: downloadUrl,
    downloadUrl,
    access: "direct-download",
    format: "glb",
    license: normalizeLicense(asset.license ?? "CC0", sourcePage),
    licenseName: asset.license ?? "CC0",
    triangles: asset.triangles,
    triangleCount: asset.triangles,
    hasAnimations: asset.animated,
    ...(qualityScore !== undefined ? { qualityScore } : {}),
    tags,
    sourcePage,
    sourceFamily: provenance,
    author: provenance,
    attribution: provenance,
    rawCatalogMetadata: { ...asset, ...(heroCandidate ? { heroCandidate: true } : {}) },
  };
}

export interface JsDelivrMirrorOptions {
  /** Manifest URL. Defaults to the Aura3D CC0 mirror on jsDelivr. */
  readonly manifestUrl?: string;
}

export function createJsDelivrMirrorAdapter(
  options: JsDelivrMirrorOptions = {},
): SourceAdapter {
  const manifestUrl = options.manifestUrl ?? DEFAULT_MANIFEST_URL;
  let cache: readonly AuraCanonicalAsset[] | null = null;

  async function load(ctx: AdapterContext): Promise<readonly AuraCanonicalAsset[]> {
    if (cache) return cache;
    const manifest = (await ctx.fetchJson(manifestUrl)) as MirrorManifest;
    const cdnBase = manifest.cdnBase;
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    if (!cdnBase || assets.length === 0) {
      cache = [];
      return cache;
    }
    const heroIds = new Set(Array.isArray(manifest.heroCandidates) ? manifest.heroCandidates : []);
    const out: AuraCanonicalAsset[] = [];
    for (const asset of assets) {
      const canonical = toCanonical(asset, cdnBase, heroIds);
      if (canonical) out.push(canonical);
    }
    cache = out;
    return out;
  }

  return {
    id: "jsdelivr-mirror",
    label: "Aura3D CC0 mirror (jsDelivr)",
    async search(_query: ResolveQuery, ctx: AdapterContext) {
      return load(ctx);
    },
  };
}
