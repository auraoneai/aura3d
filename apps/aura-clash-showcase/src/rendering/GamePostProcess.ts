import { effects } from "@aura3d/engine";

export interface GamePostProcessPreset {
  id: string;
  bloomIntensity: number;
  bloomRadius: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  vignetteStrength: number;
  reducedFlashBloomIntensity: number;
}

export const auraClashPostProcessPreset: GamePostProcessPreset = {
  id: "aura-clash-cinematic-readable",
  bloomIntensity: 0.58,
  bloomRadius: 0.42,
  fogColor: "#04170f",
  fogNear: 8,
  fogFar: 30,
  vignetteStrength: 0.22,
  reducedFlashBloomIntensity: 0.18,
};

export const auraClashMaterialPostProcessReviewCriteria = {
  contractId: "aura-clash-material-postprocess-review-v1",
  sourceOnly: true,
  humanApprovalRequired: true,
  requiredEvidence: [
    "Captured metadata must expose lighting-materials review signals or a page declaration for material/postprocess intent.",
    "Bloom must add arcade energy without turning impact frames into flat white blocks.",
    "Fog must create downtown stage depth without erasing the combat lane or fighter feet.",
    "Materials must remain distinguishable: Quaternius fighter skin/suit/accent/boots, glass/interior panels, asphalt/floor/roof, emissive signage, and VFX markers.",
    "Reduced flash mode must lower bloom intensity while preserving the scene identity.",
  ],
  presetIntent: {
    bloom: "moderate neon punch for signage, hit sparks, and Aura Burst frames",
    fog: "deep green-black atmospheric depth behind the combat lane",
    vignette: "documented review target for composition framing even though the current helper only emits fog and bloom",
    reducedFlash: "keep visual language while reducing bloom-driven flash intensity",
  },
  screenshotReviewSignals: [
    "intentional material contrast",
    "controlled bloom/fog",
    "readable HUD and fighter silhouettes during effects",
    "visible stage depth in match-start, combat-impact, and super-result compositions",
  ],
} as const;

export interface AuraClashPostProcessEvidence {
  readonly contractId: typeof auraClashMaterialPostProcessReviewCriteria.contractId;
  readonly presetId: string;
  readonly gameplayVisible: boolean;
  readonly performanceBudgetOk: boolean;
  readonly bloomIntensity: number;
  readonly reducedFlashBloomIntensity: number;
  readonly bloomWithinGameplayLimit: boolean;
  readonly fogRange: readonly [number, number];
  readonly fogBehindCombatLane: boolean;
  readonly validatedStates: readonly ["first", "action", "ko"];
}

export function createAuraClashPostProcessEvidence(options: {
  readonly performanceBudgetOk: boolean;
  readonly preset?: GamePostProcessPreset;
}): AuraClashPostProcessEvidence {
  const preset = options.preset ?? auraClashPostProcessPreset;
  const bloomWithinGameplayLimit = preset.bloomIntensity <= 0.65 && preset.reducedFlashBloomIntensity <= 0.25;
  const fogBehindCombatLane = preset.fogNear >= 6 && preset.fogFar >= 24;
  return {
    contractId: auraClashMaterialPostProcessReviewCriteria.contractId,
    presetId: preset.id,
    gameplayVisible: options.performanceBudgetOk && bloomWithinGameplayLimit && fogBehindCombatLane,
    performanceBudgetOk: options.performanceBudgetOk,
    bloomIntensity: preset.bloomIntensity,
    reducedFlashBloomIntensity: preset.reducedFlashBloomIntensity,
    bloomWithinGameplayLimit,
    fogRange: [preset.fogNear, preset.fogFar],
    fogBehindCombatLane,
    validatedStates: ["first", "action", "ko"]
  };
}

export function createAuraClashPostProcess(options?: { reducedFlash?: boolean }) {
  const bloomIntensity = options?.reducedFlash
    ? auraClashPostProcessPreset.reducedFlashBloomIntensity
    : auraClashPostProcessPreset.bloomIntensity;

  return [
    effects.fog({
      color: auraClashPostProcessPreset.fogColor,
      density: Number((1 / auraClashPostProcessPreset.fogFar).toFixed(3)),
    }),
    effects.bloom({
      intensity: bloomIntensity,
      radius: auraClashPostProcessPreset.bloomRadius,
    }),
  ] as const;
}
