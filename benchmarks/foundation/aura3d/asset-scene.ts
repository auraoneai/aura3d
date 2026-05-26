import { renderAura3DComparisonScene } from "./render-aura3d-scene";
import { assetComparisonScene } from "../shared/scenes/asset-scene";

export function renderAura3DAssetScene(origin: string, setupLines = 14) {
  return renderAura3DComparisonScene(assetComparisonScene, { origin, setupLines });
}
