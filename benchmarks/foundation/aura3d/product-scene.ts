import { renderAura3DComparisonScene } from "./render-aura3d-scene";
import { productComparisonScene } from "../shared/scenes/product-scene";

export function renderAura3DProductScene(origin: string, setupLines = 28) {
  return renderAura3DComparisonScene(productComparisonScene, { origin, setupLines });
}
