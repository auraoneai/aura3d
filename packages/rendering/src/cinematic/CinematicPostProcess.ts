import type { RendererPostProcessOptions } from "../Renderer";
import { createCinematicBloomPass, type CinematicBloomPass } from "./BloomPass";
import { createCinematicDepthHazePass, type CinematicDepthHazePass } from "./DepthHazePass";
import { createCinematicFilmGrainPass, type CinematicFilmGrainPass } from "./FilmGrainPass";
import { createCinematicVignettePass, type CinematicVignettePass } from "./VignettePass";
import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export type CinematicColorGradePreset = "neon-noir" | "warm-sunrise" | "cool-moonlit" | "studio-neutral";

export interface CinematicPostProcessStack {
  readonly id: string;
  readonly colorGradePreset: CinematicColorGradePreset;
  readonly bloom: CinematicBloomPass;
  readonly vignette: CinematicVignettePass;
  readonly filmGrain: CinematicFilmGrainPass;
  readonly depthHaze: CinematicDepthHazePass;
  readonly rendererOptions: RendererPostProcessOptions;
  readonly rendererOwnedEvidence: readonly CinematicRendererEvidenceFlag[];
  readonly diagnostics: readonly string[];
}

export function createCinematicPostProcessStack(options: {
  readonly id?: string;
  readonly colorGradePreset?: CinematicColorGradePreset;
  readonly fogOrHaze?: boolean;
  readonly glow?: boolean;
} = {}): CinematicPostProcessStack {
  const colorGradePreset = options.colorGradePreset ?? "neon-noir";
  const bloom = createCinematicBloomPass({ intensity: options.glow === false ? 0.08 : 0.28 });
  const vignette = createCinematicVignettePass();
  const filmGrain = createCinematicFilmGrainPass();
  const depthHaze = createCinematicDepthHazePass({ density: options.fogOrHaze === false ? 0.06 : 0.22 });
  return {
    id: options.id ?? "cinematic-postprocess",
    colorGradePreset,
    bloom,
    vignette,
    filmGrain,
    depthHaze,
    rendererOptions: {
      targetFormat: "rgba16f",
      bloom: { threshold: bloom.threshold, intensity: bloom.intensity, radius: bloom.radius },
      toneMapping: { operator: "filmic", exposure: exposureFor(colorGradePreset), whitePoint: 1.18, inputColorSpace: "linear", outputColorSpace: "srgb" },
      colorGrade: colorGradeFor(colorGradePreset, vignette.intensity),
      filmGrain: { intensity: filmGrain.intensity, seed: filmGrain.animated ? 17 : 1, monochrome: true },
      fxaa: true
    },
    rendererOwnedEvidence: [
      bloom.rendererOwnedEvidence,
      vignette.rendererOwnedEvidence,
      filmGrain.rendererOwnedEvidence,
      depthHaze.rendererOwnedEvidence,
      createRendererOwnedEvidenceFlag({
        id: `postprocess:color-grade:${colorGradePreset}`,
        feature: "postprocess",
        label: `Color grade ${colorGradePreset}`,
        source: "renderer-postprocess",
        sceneContent: false
      })
    ],
    diagnostics: ["Cinematic postprocess stack is renderer-owned; route DOM overlays cannot satisfy effect evidence."]
  };
}

function exposureFor(preset: CinematicColorGradePreset): number {
  if (preset === "warm-sunrise") return 1.12;
  if (preset === "cool-moonlit") return 1.3;
  if (preset === "studio-neutral") return 1.02;
  return 1.22;
}

function colorGradeFor(preset: CinematicColorGradePreset, vignette: number): NonNullable<RendererPostProcessOptions["colorGrade"]> {
  switch (preset) {
    case "warm-sunrise":
      return { contrast: 1.08, saturation: 1.08, vibrance: 0.14, vignette, sharpening: 0.16 };
    case "cool-moonlit":
      return { contrast: 1.16, saturation: 0.9, vibrance: 0.08, vignette: vignette + 0.04, sharpening: 0.18 };
    case "studio-neutral":
      return { contrast: 1.04, saturation: 1, vibrance: 0.06, vignette: 0.06, sharpening: 0.18 };
    case "neon-noir":
      return { contrast: 1.18, saturation: 1.12, vibrance: 0.2, vignette: vignette + 0.06, sharpening: 0.16 };
  }
}
