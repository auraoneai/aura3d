import { renderGalileoComparisonScene } from "./render-galileo-scene";
import { assetComparisonScene } from "../shared/scenes/asset-scene";

export function renderGalileoAssetScene(origin: string, setupLines = 14) {
  return renderGalileoComparisonScene(assetComparisonScene, { origin, setupLines });
}
