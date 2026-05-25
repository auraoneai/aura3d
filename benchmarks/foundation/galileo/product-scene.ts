import { renderGalileoComparisonScene } from "./render-galileo-scene";
import { productComparisonScene } from "../shared/scenes/product-scene";

export function renderGalileoProductScene(origin: string, setupLines = 28) {
  return renderGalileoComparisonScene(productComparisonScene, { origin, setupLines });
}
