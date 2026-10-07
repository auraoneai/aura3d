// PRD-07 P1-T11 — VfxAtlas: loads the lane's vfx manifest.json and its pages.
// KTX2 pages are paged through the C-16 asset decoder registry when a
// `decodeKtx2` hook is supplied; on `AssetDecoderUnavailable` (or a missing
// transcoder) the PNG twin loads instead and `VFX_ATLAS_PNG_FALLBACK` is
// reported once per page.

import type { Texture } from "../Texture";
import type { AuraQualityTier } from "../contracts/quality";

export interface VfxAtlasManifestPage {
  readonly id: string;
  readonly uri: string;
  readonly size: number;
  readonly premultiplied: true;
  readonly colorSpace: "srgb";
}
export interface VfxAtlasManifestSequence {
  readonly page: string;
  readonly rect: readonly [number, number, number, number];
  readonly columns: number;
  readonly rows: number;
  readonly frames: number;
  readonly fps?: number;
  readonly loop?: boolean;
}
export interface VfxAtlasManifest {
  readonly version: 1;
  readonly pages: readonly VfxAtlasManifestPage[];
  readonly sequences: Readonly<Record<string, VfxAtlasManifestSequence>>;
}

export interface VfxAtlasSequence extends VfxAtlasManifestSequence {
  readonly name: string;
  readonly texture: Texture;
}

export interface VfxAtlasOptions {
  /** Directory containing manifest.json and the page images, e.g. "/aura-vfx/". */
  readonly basePath: string;
  readonly tier: AuraQualityTier;
  readonly fetchImpl?: typeof fetch;
  /** Decode a page URL into a Texture. The caller routes through C-16 `createAssetDecoderRegistry` for .ktx2 pages. */
  readonly decodeTexture: (url: string, page: VfxAtlasManifestPage) => Promise<Texture>;
  /** Called once per page when the PNG twin is used for a .ktx2 manifest entry. */
  readonly note?: (code: "VFX_ATLAS_PNG_FALLBACK", detail: string) => void;
}

function isDecoderUnavailable(error: unknown): boolean {
  return error instanceof Error && error.name === "AssetDecoderUnavailable";
}

export class VfxAtlas {
  private constructor(
    readonly manifest: VfxAtlasManifest,
    private readonly pages: ReadonlyMap<string, Texture>,
    private readonly pageSizes: ReadonlyMap<string, number>
  ) {}

  static async load(options: VfxAtlasOptions): Promise<VfxAtlas> {
    const fetcher = options.fetchImpl ?? fetch;
    const basePath = options.basePath.endsWith("/") ? options.basePath : `${options.basePath}/`;
    const manifestResponse = await fetcher(`${basePath}manifest.json`);
    if (!manifestResponse.ok) throw new Error(`VFX_ATLAS_MANIFEST_MISSING:${manifestResponse.status}`);
    const manifest = (await manifestResponse.json()) as VfxAtlasManifest;
    const want2k = options.tier === "high" || options.tier === "ultra";
    const pages = new Map<string, Texture>();
    const pageSizes = new Map<string, number>();
    for (const page of manifest.pages) {
      const primary = want2k === page.size >= 2048;
      if (!primary && manifest.pages.length > 1) continue; // only the tier's page is paged in
      const url = `${basePath}${page.uri}`;
      try {
        pages.set(page.id, await options.decodeTexture(url, page));
      } catch (error) {
        if (!(page.uri.endsWith(".ktx2") && isDecoderUnavailable(error))) throw error;
        const pngUrl = url.replace(/\.ktx2$/, ".png");
        options.note?.("VFX_ATLAS_PNG_FALLBACK", `${page.uri} → ${page.uri.replace(/\.ktx2$/, ".png")}`);
        pages.set(page.id, await options.decodeTexture(pngUrl, { ...page, uri: page.uri.replace(/\.ktx2$/, ".png") }));
      }
      pageSizes.set(page.id, page.size);
    }
    return new VfxAtlas(manifest, pages, pageSizes);
  }

  sequence(name: string): VfxAtlasSequence | null {
    const entry = this.manifest.sequences[name];
    if (!entry) return null;
    const texture = this.pages.get(entry.page);
    if (texture) return { name, texture, ...entry };
    // Tier twin: the entry's page wasn't paged; scale the rect onto the page
    // that was (bake emits a half-size twin with identical layout).
    if (this.pages.size !== 1) return null;
    const [twinId, twinTexture] = [...this.pages.entries()][0];
    const declaredSize = this.manifest.pages.find((page) => page.id === entry.page)?.size;
    const twinSize = this.pageSizes.get(twinId);
    if (!declaredSize || !twinSize) return null;
    const scale = twinSize / declaredSize;
    const [x, y, w, h] = entry.rect;
    return { name, texture: twinTexture, ...entry, rect: [x * scale, y * scale, w * scale, h * scale] };
  }
}
