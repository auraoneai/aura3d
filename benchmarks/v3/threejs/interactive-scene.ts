import { renderThreeComparisonScene } from "./render-threejs-scene";
import { interactiveComparisonScene } from "../shared/scenes/interactive-scene";

export function renderThreeInteractiveScene(origin: string, setupLines = 46) {
  return renderThreeComparisonScene(interactiveComparisonScene, { origin, setupLines });
}
