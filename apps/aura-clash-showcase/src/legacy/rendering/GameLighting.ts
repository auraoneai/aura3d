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
  /** Whether the reported intensities came from the rig the renderer received, or from source only. */
  readonly evidenceSource: "declared-preset-only" | "rendered-lighting-rig";
  /** Shadow-casting lights in the rig actually submitted to the renderer. */
  readonly shadowCastingLightCount: number;
  /** Lights in the rig actually submitted to the renderer. */
  readonly renderedLightCount: number;
}

/** The lighting rig a route actually handed to the renderer, narrowed to what this evidence needs. */
export interface RenderedLightingRigSummary {
  readonly preset: string;
  readonly lights: readonly {
    readonly role: string;
    readonly intensity: number;
    readonly castsShadow: boolean;
  }[];
}

/**
 * Build lighting evidence from the rig the renderer actually received.
 *
 * Previously this read `auraClashLightingPreset` and nothing else, and `readable` was three
 * comparisons against those literals. That made it a source-authored boolean in the exact sense this
 * repo forbids: the numbers could not disagree with the constant they were read from, so `readable`
 * was structurally always `true`.
 *
 * Worse, the preset it described was never rendered. `createAuraClashLightRig` -- the only consumer of
 * `auraClashLightingPreset` -- has no callers; the playable route lights itself with
 * `createLightingRig({ preset: "urban-neon", intensityScale: 1.08, shadows: true })`. So the evidence
 * reported the intensities of a rig the renderer never saw, and `visual-regression.spec.ts` asserted
 * `lighting.readable === true` against it.
 *
 * Passing the live rig is what makes the claim falsifiable: if the route's rig loses its shadow caster
 * or drops below the readability floor, `readable` goes false.
 */
export function createAuraClashLightingEvidence(
  rig?: RenderedLightingRigSummary
): AuraClashLightingEvidence {
  if (!rig) {
    // No rendered rig supplied: report the declared intent and refuse to claim readability.
    const declaredMinRim = Math.min(auraClashLightingPreset.rimLeft.intensity, auraClashLightingPreset.rimRight.intensity);
    return {
      contractId: auraClashLightingReviewCriteria.contractId,
      presetId: auraClashLightingPreset.id,
      readable: false,
      validatedStates: ["first", "action", "ko"],
      ambientIntensity: auraClashLightingPreset.ambient.intensity,
      keyIntensity: auraClashLightingPreset.key.intensity,
      minRimIntensity: declaredMinRim,
      silhouetteSeparation: "rim-and-key",
      backgroundSeparation: "dark-stage-with-cyan-emerald-rim",
      evidenceSource: "declared-preset-only",
      shadowCastingLightCount: 0,
      renderedLightCount: 0
    };
  }
  const intensityFor = (roles: readonly string[]): number => {
    const matches = rig.lights.filter((light) => roles.includes(light.role)).map((light) => light.intensity);
    return matches.length === 0 ? 0 : Math.min(...matches);
  };
  // `urban-neon` expresses ambient fill through its environment/accent lights rather than a discrete
  // ambient light, so the ambient-equivalent term is the accent floor.
  const ambientIntensity = intensityFor(["ambient-proxy", "fill", "accent"]);
  const keyIntensity = intensityFor(["key", "sun"]);
  const minRimIntensity = intensityFor(["rim"]);
  const shadowCastingLightCount = rig.lights.filter((light) => light.castsShadow).length;
  return {
    contractId: auraClashLightingReviewCriteria.contractId,
    presetId: rig.preset,
    // Readability requires a key, edge separation, ambient fill, and at least one shadow caster --
    // grounding is one of the review signals, and an unshadowed fighter reads as pasted on.
    readable: ambientIntensity >= 0.25 && keyIntensity >= 1 && minRimIntensity >= 0.3 && shadowCastingLightCount >= 1,
    validatedStates: ["first", "action", "ko"],
    ambientIntensity: Number(ambientIntensity.toFixed(3)),
    keyIntensity: Number(keyIntensity.toFixed(3)),
    minRimIntensity: Number(minRimIntensity.toFixed(3)),
    silhouetteSeparation: "rim-and-key",
    backgroundSeparation: "dark-stage-with-cyan-emerald-rim",
    evidenceSource: "rendered-lighting-rig",
    shadowCastingLightCount,
    renderedLightCount: rig.lights.length
  };
}

/**
 * Declared reference rig for the route's lighting intent.
 *
 * Retained as the documented intent behind `auraClashLightingPreset`, but note it is **not** the rig
 * the playable route renders with -- see `createAuraClashLightingEvidence`. The route uses
 * `createLightingRig({ preset: "urban-neon" })`, and lighting evidence is derived from that.
 */
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
