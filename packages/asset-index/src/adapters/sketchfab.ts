import type { AuraCanonicalAsset } from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveConstraints,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * Sketchfab Data API v3 adapter.
 *
 * Verified live (https://api.sketchfab.com/v3):
 *
 *   GET /v3/search?type=models&downloadable=true[&license=<slug>][&q=<text>]
 *     -> { results: [{
 *            uid, name, viewerUrl, isDownloadable,
 *            faceCount, vertexCount,
 *            license: { uid, label },        // e.g. label "CC0 Public Domain", "CC Attribution"
 *            thumbnails: { images: [{ uid, size, width, height, url }] },
 *            tags: [{ name, slug, uri }],
 *            archives: { glb?: {...}, gltf?: {...}, ... }
 *          }, ...], next, previous, cursors }
 *
 *   GET /v3/models/{uid}/download   (Authorization: Token <token>)
 *     -> { gltf?: { url, size, expires }, usdz?: { url, size, expires }, ... }
 *        where `url` is a SHORT-LIVED (expires ~300s) archive link. It cannot be
 *        embedded in the index; it must be exchanged at PULL time.
 *
 * License model: Sketchfab's search `license` object only exposes `{ uid, label }`
 * (no SPDX/slug), so we map the human label onto a license slug and normalize it
 * via `normalizeLicense`. Only CC0 / CC-BY families become verified +
 * redistributable; everything else (and any model with no/unknown license)
 * resolves to UNVERIFIED and is never auto-pulled.
 *
 * Because the file URL is a token exchange resolved at pull time, the canonical
 * `url` points at the per-model download-resolve API endpoint
 * (`/v3/models/{uid}/download`). The CLI pull bridge must perform the
 * `Authorization: Token <SKETCHFAB_API_TOKEN>` exchange and follow the returned
 * temporary `gltf.url` (see integrationNotes). We mark `access:'direct-download'`
 * ONLY when a token is present AND the license is verified/redistributable;
 * otherwise `access:'deep-link-only'` with the Sketchfab model page as sourcePage.
 */

const API_BASE = "https://api.sketchfab.com/v3";

/** Default page size for a search fan-out. */
const SEARCH_COUNT = 24;

interface SketchfabImage {
  readonly uid?: string;
  readonly size?: number;
  readonly width?: number;
  readonly height?: number;
  readonly url?: string;
}

interface SketchfabThumbnails {
  readonly images?: readonly SketchfabImage[];
}

interface SketchfabTag {
  readonly name?: string;
  readonly slug?: string;
  readonly uri?: string;
}

interface SketchfabLicense {
  readonly uid?: string;
  readonly label?: string;
}

interface SketchfabModel {
  readonly uid: string;
  readonly name?: string;
  readonly description?: string;
  readonly viewerUrl?: string;
  readonly isDownloadable?: boolean;
  readonly faceCount?: number;
  readonly vertexCount?: number;
  readonly license?: SketchfabLicense | null;
  readonly thumbnails?: SketchfabThumbnails;
  readonly tags?: readonly SketchfabTag[];
  readonly user?: { readonly displayName?: string; readonly username?: string };
}

interface SketchfabSearchResponse {
  readonly results?: readonly SketchfabModel[];
  /** Absolute URL of the next page (cursor pagination), if any. */
  readonly next?: string;
}

/**
 * Map a Sketchfab license LABEL (the only stable text the search API exposes)
 * onto a string `normalizeLicense` recognizes. Anything outside the CC0 / CC-BY
 * families is left as the raw label so it normalizes to UNVERIFIED.
 */
function licenseKeyFromLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const l = label.toLowerCase();
  if (l.includes("cc0") || l.includes("public domain")) return "CC0";
  // "CC Attribution" (and only Attribution) maps to plain CC-BY; the
  // ShareAlike / NoDerivs / NonCommercial variants intentionally fall through
  // to their raw label and become UNVERIFIED (not freely redistributable here).
  if (l === "cc attribution" || l === "cc-by" || l === "cc by") return "CC-BY";
  return label;
}

function tokenize(text: string): string[] {
  return text
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Map our constraint license families to Sketchfab `license` query slugs. */
function licenseSlugs(constraints: ResolveConstraints | undefined): string[] {
  const fams = constraints?.license;
  if (!fams || fams.length === 0) return [];
  const slugs: string[] = [];
  for (const fam of fams) {
    if (fam === "CC0") slugs.push("cc0");
    else if (fam === "CC-BY") slugs.push("by");
  }
  return slugs;
}

function buildSearchUrl(query: ResolveQuery): string {
  const params = new URLSearchParams();
  params.set("type", "models");
  params.set("downloadable", "true");
  params.set("count", String(SEARCH_COUNT));
  const text = query.text.trim();
  if (text) params.set("q", text);
  // Sketchfab accepts repeated `license` params; restrict server-side when the
  // caller already constrained to specific redistributable families.
  for (const slug of licenseSlugs(query.constraints)) {
    params.append("license", slug);
  }
  return `${API_BASE}/search?${params.toString()}`;
}

function bestThumbnail(thumbs: SketchfabThumbnails | undefined): string | undefined {
  const images = thumbs?.images;
  if (!images || images.length === 0) return undefined;
  let best: SketchfabImage | undefined;
  for (const img of images) {
    if (!img?.url) continue;
    if (!best || (img.size ?? 0) > (best.size ?? 0)) best = img;
  }
  return best?.url;
}

function toCanonical(
  model: SketchfabModel,
  hasToken: boolean,
): AuraCanonicalAsset | null {
  if (!model.uid || model.isDownloadable === false) return null;

  const sourcePage =
    model.viewerUrl ?? `https://sketchfab.com/3d-models/${model.uid}`;
  const license = normalizeLicense(
    licenseKeyFromLabel(model.license?.label),
    sourcePage,
  );

  // The file URL is a short-lived token exchange resolved at PULL time, so the
  // canonical url is the download-resolve API endpoint. It is only a real
  // "direct-download" when we actually hold a token AND the license permits it.
  const canResolve = hasToken && license.verified && license.redistributable;
  const access = canResolve ? "direct-download" : "deep-link-only";
  const url = canResolve
    ? `${API_BASE}/models/${model.uid}/download`
    : sourcePage;

  const title = model.name ?? model.uid;
  const tagNames = (model.tags ?? [])
    .map((t) => t?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0)
    .flatMap((n) => tokenize(n));
  const tags = Array.from(new Set([...tokenize(title), ...tagNames]));

  return {
    id: `sketchfab:${model.uid}`,
    source: "sketchfab",
    title,
    description: model.description,
    url,
    access,
    // glTF-archive downloads default to .glb when resolved by the bridge.
    format: "glb",
    license,
    thumbnailUrl: bestThumbnail(model.thumbnails),
    triangles: typeof model.faceCount === "number" ? model.faceCount : undefined,
    tags,
    sourcePage,
    attribution: model.user?.displayName ?? model.user?.username,
  };
}

export interface SketchfabAdapterOptions {
  /** API token. Defaults to `process.env.SKETCHFAB_API_TOKEN`. */
  readonly token?: string;
  /**
   * Max result pages to walk per search via cursor pagination (24 models/page).
   * Default 1 (one page). A deep crawl raises this to enumerate the whole
   * downloadable catalog for a license filter. Sketchfab search is public, so
   * paging needs no auth; the token still gates auto-pull access.
   */
  readonly maxPages?: number;
  /**
   * Milliseconds to pause between paged requests. Default 0. A deep crawl sets
   * this (e.g. 350) to stay under Sketchfab's rate limit, which returns 429 when
   * cursors are walked too fast.
   */
  readonly throttleMs?: number;
}

export function createSketchfabAdapter(
  options: SketchfabAdapterOptions = {},
): SourceAdapter {
  // Resolve token presence once at construction. Absent token => degrade
  // gracefully: search() returns [] without throwing. Present token only
  // upgrades redistributable models to direct-download (the actual exchange
  // happens later in the CLI pull bridge). An explicit option lets the Cloudflare
  // Worker pass its secret binding without depending on `process.env`.
  const envToken =
    typeof process !== "undefined" ? process.env?.SKETCHFAB_API_TOKEN : undefined;
  const token = (options.token ?? envToken)?.trim();
  const hasToken = typeof token === "string" && token.length > 0;
  const maxPages = Math.max(1, options.maxPages ?? 1);
  const throttleMs = Math.max(0, options.throttleMs ?? 0);

  return {
    id: "sketchfab",
    label: "Sketchfab (downloadable, CC-licensed)",
    async search(query: ResolveQuery, ctx: AdapterContext) {
      if (!hasToken) {
        // No API token: cannot resolve downloads, so contribute nothing rather
        // than surfacing deep-links we can never auto-pull.
        return [];
      }
      const assets: AuraCanonicalAsset[] = [];
      let url: string | undefined = buildSearchUrl(query);
      for (let page = 0; page < maxPages && url; page++) {
        if (page > 0 && throttleMs) await new Promise((r) => setTimeout(r, throttleMs));
        const raw = (await ctx.fetchJson(url)) as SketchfabSearchResponse;
        for (const model of raw?.results ?? []) {
          if (model && typeof model.uid === "string") {
            const canonical = toCanonical(model, hasToken);
            if (canonical) assets.push(canonical);
          }
        }
        url = raw?.next; // cursor to the next page
      }
      return assets;
    },
  };
}
