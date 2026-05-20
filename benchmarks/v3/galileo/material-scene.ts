import { renderGalileoComparisonScene } from "./render-galileo-scene";
import { materialComparisonScene } from "../shared/scenes/material-scene";

export function renderGalileoMaterialScene(origin: string, setupLines = 22) {
  return renderGalileoComparisonScene(materialComparisonScene, { origin, setupLines });
}
