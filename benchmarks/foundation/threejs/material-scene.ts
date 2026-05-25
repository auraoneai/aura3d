import { renderThreeComparisonScene } from "./render-threejs-scene";
import { materialComparisonScene } from "../shared/scenes/material-scene";

export function renderThreeMaterialScene(origin: string, setupLines = 50) {
  return renderThreeComparisonScene(materialComparisonScene, { origin, setupLines });
}
