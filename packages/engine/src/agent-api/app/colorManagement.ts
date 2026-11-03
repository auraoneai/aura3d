// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraRendererColorManagementPreset, AuraSceneCategory, AuraSceneExposurePreset } from "../nodes/types.js";
import type { AuraOutputOptions } from "../../contracts/output.js";

/** Requested output settings are resolved per app; active display settings
 * are reported separately by that app's render device after negotiation. */
export interface AuraAppOutputColorPolicy {
  readonly outputColorSpace: NonNullable<AuraOutputOptions["outputColorSpace"]>;
  readonly alphaMode: NonNullable<AuraOutputOptions["alphaMode"]>;
}

export function resolveAppOutputColorPolicy(options?: Pick<AuraOutputOptions, "outputColorSpace" | "alphaMode">): AuraAppOutputColorPolicy {
  if (options !== undefined && (options === null || typeof options !== "object" || Array.isArray(options))) {
    throw new RangeError("Invalid app output color policy.");
  }
  const outputColorSpace = options?.outputColorSpace === undefined ? "srgb" : options.outputColorSpace;
  const alphaMode = options?.alphaMode === undefined ? "opaque" : options.alphaMode;
  if (outputColorSpace !== "srgb" && outputColorSpace !== "display-p3") {
    throw new RangeError(`Unsupported output color space: ${String(outputColorSpace)}.`);
  }
  if (alphaMode !== "opaque" && alphaMode !== "straight" && alphaMode !== "premultiplied") {
    throw new RangeError(`Unsupported output alpha mode: ${String(alphaMode)}.`);
  }
  return { outputColorSpace, alphaMode };
}

export const rendererColorManagementPreset: AuraRendererColorManagementPreset = {
  kind: "aura-renderer-color-management",
  workflow: "linear",
  outputColorSpace: "srgb",
  toneMapping: "aces-filmic",
  defaultExposure: 1.05,
  notes: [
    "This preset defaults to sRGB output and ACES filmic tone mapping; mounted output is reported separately.",
    "Exposure is selected by scene category to avoid blown-out product/material whites and crushed dark scenes."
  ]
};

export const sceneExposurePresets: Record<AuraSceneCategory, AuraSceneExposurePreset> = {
  product: { category: "product", exposure: 0.92, evidence: "studio whites preserve product highlights and contact shadows" },
  material: { category: "material", exposure: 0.78, evidence: "material labs keep chrome/glass highlight detail without clipping" },
  neon: { category: "neon", exposure: 1.18, evidence: "dark neon scenes lift tunnel detail while bloom is clamped" },
  "city-night": { category: "city-night", exposure: 1.22, evidence: "night city shadows keep street/window detail" },
  "city-day": { category: "city-day", exposure: 0.98, evidence: "day city keeps sky and road markings readable" },
  space: { category: "space", exposure: 1.24, evidence: "solar and starfield scenes retain dim orbit and label cues" },
  physics: { category: "physics", exposure: 1.04, evidence: "physics contacts and ramps stay readable on neutral backgrounds" },
  chart: { category: "chart", exposure: 1.02, evidence: "thin chart labels and axes keep contrast" },
  game: { category: "game", exposure: 1.05, evidence: "mini-game UI, aim vectors, and course boundaries stay readable" }
};
