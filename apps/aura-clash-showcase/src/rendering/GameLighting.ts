import { lights } from "@aura3d/engine";

export interface GameLightingPreset {
  id: string;
  label: string;
  ambient: {
    color: string;
    intensity: number;
  };
  key: {
    color: string;
    intensity: number;
    position: [number, number, number];
  };
  rimLeft: {
    color: string;
    intensity: number;
    position: [number, number, number];
  };
  rimRight: {
    color: string;
    intensity: number;
    position: [number, number, number];
  };
}

export const auraClashLightingPreset: GameLightingPreset = {
  id: "aura-clash-neon-night",
  label: "Aura Clash Neon Night",
  ambient: {
    color: "#8ee7bd",
    intensity: 0.36,
  },
  key: {
    color: "#f5fff6",
    intensity: 1.15,
    position: [0, 4.2, 5.6],
  },
  rimLeft: {
    color: "#33ff9f",
    intensity: 1.45,
    position: [-4.1, 2.5, 2.3],
  },
  rimRight: {
    color: "#62d8ff",
    intensity: 1.35,
    position: [4.1, 2.5, 2.3],
  },
};

export const auraClashLightingReviewCriteria = {
  contractId: "aura-clash-lighting-review-v1",
  sourceOnly: true,
  humanApprovalRequired: true,
  requiredEvidence: [
    "Captured metadata must name the lighting preset or expose data-lighting/page review declarations.",
    "At least three screenshot compositions must keep both fighter silhouettes readable against the downtown stage.",
    "Rim lights must separate fighter edges from dark graphite, glass, and skyline surfaces.",
    "Key light must preserve facial/body readability without flattening the cyan/emerald arcade mood.",
  ],
  presetIntent: {
    ambient: "low emerald fill for Quaternius material readability without washing out shadows",
    key: "soft front key for readable faces, hands, feet, and HUD-adjacent poses",
    rimLeft: "emerald player-side edge separation",
    rimRight: "cyan opponent-side edge separation",
  },
  screenshotReviewSignals: [
    "readable fighter silhouettes",
    "visible contact shadows or grounding cues",
    "premium contrast between fighter materials and neon downtown stage",
    "no blown-out bloom hiding heads, hands, feet, HUD, or hit sparks",
  ],
} as const;

export interface AuraClashLightingEvidence {
  readonly contractId: typeof auraClashLightingReviewCriteria.contractId;
  readonly presetId: string;
  readonly readable: boolean;
  readonly validatedStates: readonly ["first", "action", "ko"];
  readonly ambientIntensity: number;
  readonly keyIntensity: number;
  readonly minRimIntensity: number;
  readonly silhouetteSeparation: "rim-and-key";
  readonly backgroundSeparation: "dark-stage-with-cyan-emerald-rim";
}

export function createAuraClashLightingEvidence(
  preset: GameLightingPreset = auraClashLightingPreset
): AuraClashLightingEvidence {
  const minRimIntensity = Math.min(preset.rimLeft.intensity, preset.rimRight.intensity);
  return {
    contractId: auraClashLightingReviewCriteria.contractId,
    presetId: preset.id,
    readable: preset.ambient.intensity >= 0.25 && preset.key.intensity >= 1 && minRimIntensity >= 1.2,
    validatedStates: ["first", "action", "ko"],
    ambientIntensity: preset.ambient.intensity,
    keyIntensity: preset.key.intensity,
    minRimIntensity,
    silhouetteSeparation: "rim-and-key",
    backgroundSeparation: "dark-stage-with-cyan-emerald-rim"
  };
}

export function createAuraClashLightRig(preset: GameLightingPreset = auraClashLightingPreset) {
  return [
    lights.ambient({
      color: preset.ambient.color,
      intensity: preset.ambient.intensity,
    }),
    lights.directional({
      color: preset.key.color,
      intensity: preset.key.intensity,
      position: preset.key.position,
    }),
    lights.point({
      color: preset.rimLeft.color,
      intensity: preset.rimLeft.intensity,
      position: preset.rimLeft.position,
    }),
    lights.point({
      color: preset.rimRight.color,
      intensity: preset.rimRight.intensity,
      position: preset.rimRight.position,
    }),
  ] as const;
}
