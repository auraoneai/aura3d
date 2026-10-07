// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEnvironmentMapPreset } from "./types.js";
import { envSourceBuilders } from "./environments.js";
import { worldEnvBuilders } from "./environments.world.js";
import { lazyNamespace } from "../lazyNamespace.js";


export const environments = lazyNamespace(() => ({
  ...envSourceBuilders,
  ...worldEnvBuilders
} as const));

export const environmentMapPresets: readonly AuraEnvironmentMapPreset[] = [
  { id: "studio", label: "Studio softbox IBL", purpose: ["studio", "rubber", "fabric"], intensity: 1.15, color: "#f8fbff", evidence: "neutral broad highlights for product and material staging" },
  { id: "material-lab", label: "Material lab IBL", purpose: ["chrome", "glass", "clearcoat"], intensity: 1.35, color: "#ffffff", evidence: "white, dark, warm, and cool reflection-card balance" },
  { id: "product-hero", label: "Product hero IBL", purpose: ["product", "sneaker", "turntable"], intensity: 1.2, color: "#eef6ff", evidence: "soft product photography reflections and controlled plinth contact" },
  { id: "night-cinematic", label: "Night cinematic IBL", purpose: ["neon", "city-night", "particles"], intensity: 0.78, color: "#78d7ff", evidence: "cool low-key environment with room for emissive lighting" },
  { id: "metal-studio", label: "Metal studio IBL", purpose: ["metal", "chrome", "brushed-metal"], intensity: 1.42, color: "#f8fbff", evidence: "bright and dark reflection shapes for mirror metal readability" },
  { id: "glass-studio", label: "Glass studio IBL", purpose: ["glass", "frosted-glass", "clear-glass"], intensity: 1.28, color: "#d8f7ff", evidence: "contrast cards and cool tint for transparency/refraction cues" }
];
