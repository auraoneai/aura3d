import { renderAura3DComparisonScene } from "./render-aura3d-scene";
import { interactiveComparisonScene } from "../shared/scenes/interactive-scene";

export function renderAura3DInteractiveScene(origin: string, setupLines = 12) {
  return renderAura3DComparisonScene(interactiveComparisonScene, { origin, setupLines });
}
