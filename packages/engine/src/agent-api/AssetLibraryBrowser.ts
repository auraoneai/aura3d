import type { CartoonAssetManifest, CartoonAssetManifestEntry, CartoonAssetManifestKind } from "./CartoonAssetManifest.js";

export interface AssetLibraryBrowserFilter {
  readonly kind?: CartoonAssetManifestKind;
  readonly style?: string;
  readonly license?: string;
  readonly lipSyncReady?: boolean;
}

export interface AssetLibraryBrowserSnapshot {
  readonly kind: "asset-library-browser";
  readonly total: number;
  readonly visible: number;
  readonly selectedId?: string;
  readonly assets: readonly CartoonAssetManifestEntry[];
}

export interface AssetLibraryAssetDetail {
  readonly kind: "asset-library-detail";
  readonly asset: CartoonAssetManifestEntry;
  readonly animationPreview: {
    readonly clips: readonly string[];
    readonly previewable: boolean;
  };
  readonly materialPreview: {
    readonly materialCount: number;
    readonly swatches: readonly string[];
    readonly celShadingReady: boolean;
  };
  readonly metadata: Readonly<Record<string, string | number | boolean | readonly string[]>>;
}

export class AssetLibraryBrowser {
  private filter: AssetLibraryBrowserFilter = {};
  private selectedId?: string;

  constructor(private readonly manifest: CartoonAssetManifest) {}

  setFilter(filter: AssetLibraryBrowserFilter): AssetLibraryBrowserSnapshot {
    this.filter = filter;
    return this.snapshot();
  }

  select(id: string): AssetLibraryBrowserSnapshot {
    if (!this.manifest.entries.some((entry) => entry.id === id)) throw new Error(`Unknown cartoon asset: ${id}`);
    this.selectedId = id;
    return this.snapshot();
  }

  detail(id: string = this.selectedId ?? ""): AssetLibraryAssetDetail {
    const asset = this.manifest.entries.find((entry) => entry.id === id);
    if (!asset) throw new Error(`Unknown cartoon asset: ${id}`);
    const clips = asset.preview?.animationPreviewClips ?? asset.animationClips ?? [];
    return {
      kind: "asset-library-detail",
      asset,
      animationPreview: {
        clips,
        previewable: clips.length > 0
      },
      materialPreview: {
        materialCount: asset.materialPreview?.materialCount ?? 0,
        swatches: asset.materialPreview?.swatches ?? [],
        celShadingReady: asset.materialPreview?.celShadingReady ?? asset.style.toLowerCase().includes("cartoon")
      },
      metadata: {
        ...(asset.sourcePage ? { sourcePage: asset.sourcePage } : {}),
        ...(asset.attribution ? { attribution: asset.attribution } : {}),
        license: asset.license,
        assetId: asset.assetId,
        style: asset.style,
        ...(asset.lipSyncReady !== undefined ? { lipSyncReady: asset.lipSyncReady } : {}),
        ...(asset.metadata ?? {})
      }
    };
  }

  snapshot(): AssetLibraryBrowserSnapshot {
    const assets = this.manifest.entries.filter((entry) =>
      (!this.filter.kind || entry.kind === this.filter.kind)
      && (!this.filter.style || entry.style.toLowerCase().includes(this.filter.style.toLowerCase()))
      && (!this.filter.license || entry.license === this.filter.license)
      && (this.filter.lipSyncReady === undefined || entry.lipSyncReady === this.filter.lipSyncReady)
    );
    return {
      kind: "asset-library-browser",
      total: this.manifest.entries.length,
      visible: assets.length,
      selectedId: this.selectedId,
      assets
    };
  }
}
