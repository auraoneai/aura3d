// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraSceneNode, AuraDataBars3DPrefabOptions, AuraChartTheme, AuraChartVisualQAResult } from "./types.js";
import { camera } from "./camera.js";
import { neon } from "./neon.js";
import { prefabs } from "./prefabs/index.js";
import { validateChartVisualQA } from "../looks/structuralQA.js";

export function chartThemePalette(theme: AuraChartTheme): { readonly floor: AuraColor; readonly wall: AuraColor; readonly side: AuraColor } {
  if (theme === "light-analytics") return { floor: "#dbeafe", wall: "#eff6ff", side: "#bfdbfe" };
  if (theme === "neon-analytics") return { floor: "#10051f", wall: "#1f1147", side: "#0e7490" };
  return { floor: "#16242a", wall: "#0b1217", side: "#101923" };
}

export function dataBarColor(value: number, colorScale?: readonly AuraColor[]): AuraColor {
  if (colorScale && colorScale.length >= 3) {
    if (value < 0.34) return colorScale[0]!;
    if (value < 0.67) return colorScale[1]!;
    return colorScale[2]!;
  }
  if (value < 0.34) return "#20d6f2";
  if (value < 0.67) return "#ffd166";
  return "#ef476f";
}

export const charts = {
  barGrid3D: (options: AuraDataBars3DPrefabOptions = {}): readonly AuraSceneNode[] => prefabs.dataBars3D(options),
  dataBars3D: (options: AuraDataBars3DPrefabOptions = {}): readonly AuraSceneNode[] => prefabs.dataBars3D(options),
  configure: (options: AuraDataBars3DPrefabOptions = {}): AuraDataBars3DPrefabOptions => ({ ...options }),
  withDataset: (dataset: readonly (readonly number[])[], options: Omit<AuraDataBars3DPrefabOptions, "dataset"> = {}): AuraDataBars3DPrefabOptions => ({ ...options, dataset }),
  themes: (): readonly AuraChartTheme[] => ["dark-analytics", "light-analytics", "neon-analytics"],
  cameraPreset: (preset: "readable-6x6" | "dashboard" | "hover-detail" = "readable-6x6") =>
    preset === "hover-detail"
      ? camera.perspective({ position: [3.2, 2.6, 4.1], target: [0.45, 1.0, -0.35], fov: 38 })
      : preset === "dashboard"
        ? camera.perspective({ position: [3.9, 3.1, 4.8], target: [0, 0.86, 0], fov: 42 })
        : camera.perspective({ position: [5.6, 4.4, 7.4], target: [0, 1.15, 0], fov: 36 }),
  visualQA: (nodes: readonly AuraSceneNode[]): AuraChartVisualQAResult => validateChartVisualQA(nodes)
} as const;
