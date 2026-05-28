import type { AuraAssetLoadState } from "../agent-api/index.js";

export interface AuraAssetPanelRow {
  readonly id: string;
  readonly status: AuraAssetLoadState["status"];
  readonly url: string;
  readonly message?: string;
}

export function createAuraAssetPanelRows(assets: readonly AuraAssetLoadState[]): readonly AuraAssetPanelRow[] {
  return assets.map((asset) => ({
    id: asset.id,
    status: asset.status,
    url: asset.url,
    message: asset.message
  }));
}
