import { renderThreeComparisonScene } from "./render-threejs-scene";
import { assetComparisonScene } from "../shared/scenes/asset-scene";

export function renderThreeAssetScene(origin: string, setupLines = 42) {
  return renderThreeComparisonScene(assetComparisonScene, { origin, setupLines });
}
