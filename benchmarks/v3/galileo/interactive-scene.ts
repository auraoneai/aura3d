import { renderGalileoComparisonScene } from "./render-galileo-scene";
import { interactiveComparisonScene } from "../shared/scenes/interactive-scene";

export function renderGalileoInteractiveScene(origin: string, setupLines = 12) {
  return renderGalileoComparisonScene(interactiveComparisonScene, { origin, setupLines });
}
