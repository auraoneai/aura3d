// PRD-07 P1-T11 — VfxAtlas: loads the lane's vfx manifest.json and its pages.
// KTX2 pages are paged through the C-16 asset decoder registry when a
// `decodeKtx2` hook is supplied; on `AssetDecoderUnavailable` (or a missing
// transcoder) the PNG twin loads instead and `VFX_ATLAS_PNG_FALLBACK` is
// reported once per page.

import type { Texture } from "../Texture";
import type { AuraQualityTier } from "../contracts/quality";

export interface VfxAtlasManifestSequence {
  readonly page: string;
  readonly rect: readonly [number, number, number, number];
  readonly columns: number;
  readonly rows: number;
  readonly frames: number;
  readonly fps?: number;
  readonly loop?: boolean;
}
export interface VfxAtlasManifestPage {
  readonly id: string;
  readonly uri: string;
  readonly size: number;
  readonly premultiplied: boolean;
  readonly colorSpace: "srgb" | "linear";
}
/** §6.9/P6-T2 — decal atlas block: albedo + tangent-normal + roughness twins per size. */
export interface VfxAtlasManifestDecals {
  readonly entries: Readonly<Record<string, { readonly page: string; readonly rect: readonly [number, number, number, number] }>>;
  readonly albedo: readonly VfxAtlasManifestPage[];
  readonly normal: readonly VfxAtlasManifestPage[];
  readonly roughness: readonly VfxAtlasManifestPage[];
}
export interface VfxAtlasManifest {
  readonly version: 1;
  readonly pages: readonly VfxAtlasManifestPage[];
  readonly sequences: Readonly<Record<string, VfxAtlasManifestSequence>>;
  readonly decals?: VfxAtlasManifestDecals;
}

export interface VfxAtlasSequence extends VfxAtlasManifestSequence {
  readonly name: string;
  readonly texture: Texture;
}

/** Resolved decal: atlas rects plus the three channel textures at the tier's size. */
export interface VfxAtlasDecal {
  readonly name: string;
  readonly rect: readonly [number, number, number, number];
  readonly albedo: Texture;
  readonly normal: Texture;
  readonly roughness: Texture;
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
    private readonly pageSizes: ReadonlyMap<string, number>,
    private readonly decalTextures?: { readonly albedo: Texture; readonly normal: Texture; readonly roughness: Texture }
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
    // P6-T2 decal channels: page the tier-size variant of each channel.
    let decalTextures: VfxAtlas["decalTextures"];
    if (manifest.decals) {
      const pick = async (channel: readonly VfxAtlasManifestPage[]) => {
        const page: VfxAtlasManifestPage | undefined = channel.find((candidate) => (candidate.size >= 2048) === want2k) ?? channel[0];
        if (!page) return null;
        pageSizes.set(page.id, page.size);
        return options.decodeTexture(`${basePath}${page.uri}`, page);
      };
      const [albedo, normal, roughness] = await Promise.all([
        pick(manifest.decals.albedo),
        pick(manifest.decals.normal),
        pick(manifest.decals.roughness)
      ]);
      if (albedo && normal && roughness) decalTextures = { albedo, normal, roughness };
    }
    return new VfxAtlas(manifest, pages, pageSizes, decalTextures);
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

  /** P6-T2 — decal entry (scorch/crack/tyre-track/puddle), rect scaled to the paged channel size. */
  decal(name: string): VfxAtlasDecal | null {
    const decals = this.manifest.decals;
    const entry = decals?.entries[name];
    if (!decals || !entry || !this.decalTextures) return null;
    const declaredSize = decals.albedo.find((page) => page.id === entry.page)?.size;
    const pagedSize = this.pageSizes.get(entry.page) ?? declaredSize;
    const scale = declaredSize && pagedSize ? pagedSize / declaredSize : 1;
    const [x, y, w, h] = entry.rect;
    return {
      name,
      rect: [x * scale, y * scale, w * scale, h * scale],
      albedo: this.decalTextures.albedo,
      normal: this.decalTextures.normal,
      roughness: this.decalTextures.roughness
    };
  }
}
