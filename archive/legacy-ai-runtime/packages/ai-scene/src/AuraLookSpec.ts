import type { AuraColor } from "./AuraSceneIR.js";

export interface AuraCinematicLightingSpec {
  readonly mood: string;
  readonly key: {
    readonly color: AuraColor;
    readonly intensity: number;
    readonly direction: readonly [number, number, number];
  };
  readonly rim?: {
    readonly color: AuraColor;
    readonly intensity: number;
    readonly direction: readonly [number, number, number];
  };
  readonly practicals: readonly {
    readonly id: string;
    readonly label: string;
    readonly color: AuraColor;
    readonly intensity: number;
    readonly semanticTags: readonly string[];
  }[];
}

export interface AuraLookSpec {
  readonly id: string;
  readonly moodTags: readonly string[];
  readonly colorPalette: readonly AuraColor[];
  readonly contrast: "low" | "medium" | "high";
  readonly saturation: "muted" | "natural" | "rich";
  readonly lighting: AuraCinematicLightingSpec;
  readonly postProcess: {
    readonly bloom: number;
    readonly vignette: number;
    readonly filmGrain: number;
    readonly depthHaze: number;
  };
}
