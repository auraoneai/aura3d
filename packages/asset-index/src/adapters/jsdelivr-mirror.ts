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
}

interface MirrorManifest {
  readonly schema?: string;
  readonly cdnBase?: string;
  readonly assets?: readonly MirrorAsset[];
}

function tokenize(text: string): string[] {
  return text
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function toCanonical(asset: MirrorAsset, cdnBase: string): AuraCanonicalAsset | null {
  if (!asset.path || typeof asset.id !== "string") return null;
  const title = asset.title ?? asset.id;
  const provenance = asset.source ?? "mirror";
  const tags = Array.from(
    new Set([
      ...tokenize(title),
      ...(asset.tags ?? []).flatMap(tokenize),
      ...tokenize(asset.pack ?? ""),
    ]),
  );
  return {
    id: asset.id,
    source: `mirror:${provenance}`,
    title,
    url: `${cdnBase}/${asset.path}`,
    access: "direct-download",
    format: "glb",
    license: normalizeLicense(asset.license ?? "CC0"),
    triangles: asset.triangles,
    hasAnimations: asset.animated,
    tags,
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
    const out: AuraCanonicalAsset[] = [];
    for (const asset of assets) {
      const canonical = toCanonical(asset, cdnBase);
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
