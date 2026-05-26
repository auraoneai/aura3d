import { renderAura3DComparisonScene } from "./render-aura3d-scene";
import { materialComparisonScene } from "../shared/scenes/material-scene";

export function renderAura3DMaterialScene(origin: string, setupLines = 22) {
  return renderAura3DComparisonScene(materialComparisonScene, { origin, setupLines });
}
