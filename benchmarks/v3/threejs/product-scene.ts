import { renderThreeComparisonScene } from "./render-threejs-scene";
import { productComparisonScene } from "../shared/scenes/product-scene";

export function renderThreeProductScene(origin: string, setupLines = 58) {
  return renderThreeComparisonScene(productComparisonScene, { origin, setupLines });
}
