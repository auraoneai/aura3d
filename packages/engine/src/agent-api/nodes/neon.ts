// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraSceneNode, AuraEffectNode, AuraNeonPalettePreset, AuraNeonTunnelOptions } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { camera } from "./camera.js";
import { effects } from "./effects.composite.js";
import { prefabs } from "./prefabs/index.js";
import { validateNeonVisualQA } from "../looks/structuralQA.js";

export function neonPalette(preset: AuraNeonPalettePreset): readonly [AuraColor, AuraColor, AuraColor, AuraColor] {
  if (preset === "sunset-grid") return ["#f97316", "#f43f5e", "#fde68a", "#38bdf8"];
  if (preset === "acid-aurora") return ["#a3e635", "#22d3ee", "#f0abfc", "#facc15"];
  return ["#22d3ee", "#ff42c8", "#ffd166", "#8b5cf6"];
}

export const neon = {
  tunnel: (options: AuraNeonTunnelOptions = {}): readonly AuraSceneNode[] => prefabs.neonTunnel(options),
  palettes: (): readonly AuraNeonPalettePreset[] => ["cyan-magenta", "sunset-grid", "acid-aurora"],
  bloomPreset: (intensity = 0.72): AuraNodeBuilder<AuraEffectNode> => effects.bloom({ intensity: Math.min(0.92, Math.max(0.12, intensity)), threshold: 0.68, color: "#ff42c8" }),
  cameraFlythrough: (options: { readonly seconds?: number; readonly captureFrame?: number } = {}) =>
    camera.dolly({ from: [0, 0.36, 1.6], to: [0, 0.36, -4.4], target: [0, 0.28, -5.8], fov: 54, seconds: options.seconds ?? 8, captureTime: options.captureFrame ?? 0.62 }),
  visualQA: validateNeonVisualQA
} as const;
