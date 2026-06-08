import type { AnimationAssetManifest, AnimationAssetManifestEntry, AnimationAssetManifestKind } from "./AnimationAssetManifest.js";

export interface AssetLibraryBrowserFilter {
  readonly kind?: AnimationAssetManifestKind;
  readonly profile?: string;
  readonly style?: string;
  readonly license?: string;
  readonly lipSyncReady?: boolean;
}

export interface AssetLibraryMarketplaceSource {
  readonly id: string;
  readonly label: string;
  readonly assetCount: number;
  readonly offlineCatalog?: boolean | undefined;
}

export interface AssetLibraryBrowserSnapshot {
  readonly kind: "asset-library-browser";
  readonly total: number;
  readonly visible: number;
  readonly selectedId?: string;
  readonly assets: readonly AnimationAssetManifestEntry[];
  readonly evidence: {
    readonly typedAssetReferencesOnly: boolean;
    readonly licenseMetadata: boolean;
    readonly editorDropReady: boolean;
    readonly externalServicesIntegrated: false;
  };
}

export interface AssetLibraryAssetDetail {
  readonly kind: "asset-library-detail";
  readonly asset: AnimationAssetManifestEntry;
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

export interface AssetLibraryEditorReference {
  readonly kind: "aura-asset-ref";
  readonly id: string;
  readonly name: string;
  readonly type: "glb" | "audio" | "unknown";
  readonly source: string;
  readonly license: string;
  readonly category: AnimationAssetManifestKind;
  readonly profile?: string | undefined;
  readonly style: string;
  readonly clips?: readonly string[] | undefined;
  readonly lipSyncReady?: boolean | undefined;
}

export interface AssetLibraryMarketplaceSnapshot {
  readonly kind: "asset-library-marketplace-browser";
  readonly sourceCount: number;
  readonly assetCount: number;
  readonly offlineCatalogOnly: boolean;
  readonly externalServicesIntegrated: false;
  readonly sources: readonly AssetLibraryMarketplaceSource[];
  readonly selectedId?: string | undefined;
  readonly visibleAssetIds: readonly string[];
}

export class AssetLibraryBrowser {
  private filter: AssetLibraryBrowserFilter = {};
  private selectedId?: string;

  constructor(private readonly manifest: AnimationAssetManifest) {}

  setFilter(filter: AssetLibraryBrowserFilter): AssetLibraryBrowserSnapshot {
    this.filter = filter;
    return this.snapshot();
  }

  select(id: string): AssetLibraryBrowserSnapshot {
    if (!this.manifest.entries.some((entry) => entry.id === id)) throw new Error(`Unknown animation asset: ${id}`);
    this.selectedId = id;
    return this.snapshot();
  }

  detail(id: string = this.selectedId ?? ""): AssetLibraryAssetDetail {
    const asset = this.manifest.entries.find((entry) => entry.id === id);
    if (!asset) throw new Error(`Unknown animation asset: ${id}`);
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
        celShadingReady: asset.materialPreview?.celShadingReady ?? asset.style.toLowerCase().includes("animation")
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

  editorReference(id: string = this.selectedId ?? ""): AssetLibraryEditorReference {
    const asset = this.manifest.entries.find((entry) => entry.id === id);
    if (!asset) throw new Error(`Unknown animation asset: ${id}`);
    if (!asset.assetId.startsWith("assets.")) {
      throw new Error(`Animation asset "${id}" is not a typed Aura3D asset reference.`);
    }
    if (!asset.license.trim()) {
      throw new Error(`Animation asset "${id}" is missing license metadata.`);
    }
    return {
      kind: "aura-asset-ref",
      id: asset.id,
      name: asset.id,
      type: asset.kind === "audio" ? "audio" : asset.assetId.endsWith(".glb") ? "glb" : "unknown",
      source: asset.assetId,
      license: asset.license,
      category: asset.kind,
      profile: asset.profile,
      style: asset.style,
      clips: asset.animationClips,
      lipSyncReady: asset.lipSyncReady ?? asset.mouthCueReady
    };
  }

  marketplaceSnapshot(sources: readonly AssetLibraryMarketplaceSource[] = []): AssetLibraryMarketplaceSnapshot {
    const snapshot = this.snapshot();
    const inferredSources = sources.length > 0
      ? sources
      : [{
        id: "aura3d-typed-manifest",
        label: "Aura3D typed asset manifest",
        assetCount: this.manifest.entries.length,
        offlineCatalog: true
      }];
    return {
      kind: "asset-library-marketplace-browser",
      sourceCount: inferredSources.length,
      assetCount: inferredSources.reduce((count, source) => count + source.assetCount, 0),
      offlineCatalogOnly: inferredSources.every((source) => source.offlineCatalog !== false),
      externalServicesIntegrated: false,
      sources: inferredSources,
      selectedId: this.selectedId,
      visibleAssetIds: snapshot.assets.map((asset) => asset.id)
    };
  }

  snapshot(): AssetLibraryBrowserSnapshot {
    const assets = this.manifest.entries.filter((entry) =>
      (!this.filter.kind || entry.kind === this.filter.kind)
      && (!this.filter.profile || entry.profile === this.filter.profile)
      && (!this.filter.style || entry.style.toLowerCase().includes(this.filter.style.toLowerCase()))
      && (!this.filter.license || entry.license === this.filter.license)
      && (this.filter.lipSyncReady === undefined || entry.lipSyncReady === this.filter.lipSyncReady)
    );
    return {
      kind: "asset-library-browser",
      total: this.manifest.entries.length,
      visible: assets.length,
      selectedId: this.selectedId,
      assets,
      evidence: {
        typedAssetReferencesOnly: assets.every((asset) => asset.assetId.startsWith("assets.")),
        licenseMetadata: assets.every((asset) => asset.license.trim().length > 0),
        editorDropReady: assets.every((asset) => asset.assetId.startsWith("assets.") && asset.license.trim().length > 0),
        externalServicesIntegrated: false
      }
    };
  }
}
