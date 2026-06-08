import {
  createPromptAnimationIssue,
  normalizePromptAnimationTime,
  promptAnimationContractVersion,
  type PromptAnimationArtifactBase,
  type PromptAnimationFrameRate,
  type PromptAnimationId,
  type PromptAnimationLanguageCode,
  type PromptAnimationSeconds,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";
import type { RuntimeNodeHandleLike, RuntimeNodeMorphTargetWeights } from "./RuntimeNodeHandle.js";

export type AuraVoiceVisemeFormat = "auravoice-visemes-v2";

export type AuraVoiceVisemeId =
  | "sil"
  | "aa"
  | "ae"
  | "ah"
  | "ao"
  | "eh"
  | "er"
  | "ih"
  | "iy"
  | "oh"
  | "ow"
  | "uh"
  | "uw"
  | "bmp"
  | "ch"
  | "d"
  | "fv"
  | "g"
  | "k"
  | "l"
  | "m"
  | "n"
  | "p"
  | "r"
  | "s"
  | "th"
  | "wq"
  | string;

export type PrimitiveMouthCard = "closed" | "narrow" | "open" | "wide" | "round" | "smile";

export interface AuraVoiceVisemeCue {
  readonly id: PromptAnimationId;
  readonly characterId: PromptAnimationId;
  readonly speakerId?: PromptAnimationId | undefined;
  readonly lineId?: PromptAnimationId | undefined;
  readonly phoneme?: string | undefined;
  readonly phonemeId?: string | undefined;
  readonly word?: string | undefined;
  readonly wordIndex?: number | undefined;
  readonly wordStartTime?: PromptAnimationSeconds | undefined;
  readonly wordEndTime?: PromptAnimationSeconds | undefined;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly visemeId: AuraVoiceVisemeId;
  readonly mouthOpenness: number;
  readonly weight: number;
  readonly weights?: Record<string, number> | undefined;
  readonly blendshapeWeights?: Record<string, number> | undefined;
  readonly blendshapeNames?: readonly string[] | undefined;
}

export interface AuraVoiceVisemeTrack extends PromptAnimationArtifactBase<"visemes"> {
  readonly format: AuraVoiceVisemeFormat;
  readonly language: PromptAnimationLanguageCode;
  readonly frameRate: PromptAnimationFrameRate;
  readonly cues: readonly AuraVoiceVisemeCue[];
}

export interface VisemeSample {
  readonly time: PromptAnimationSeconds;
  readonly characterId?: PromptAnimationId | undefined;
  readonly activeCues: readonly AuraVoiceVisemeCue[];
  readonly visemeId: AuraVoiceVisemeId;
  readonly primaryVisemeId: AuraVoiceVisemeId;
  readonly mouthOpenness: number;
  readonly primitiveMouthCard: PrimitiveMouthCard;
  readonly weights: Record<string, number>;
  readonly blendshapeWeights: Record<string, number>;
}

export interface VisemeController {
  readonly track: AuraVoiceVisemeTrack;
  sample(time: PromptAnimationSeconds, characterId?: PromptAnimationId): VisemeSample;
  validate(): readonly PromptAnimationValidationIssue[];
}

export interface PrimitiveMouthVisemeCueInput {
  readonly characterId: PromptAnimationId;
  readonly speakerId?: PromptAnimationId | undefined;
  readonly lineId?: PromptAnimationId | undefined;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly openVisemeId?: AuraVoiceVisemeId | undefined;
  readonly closeVisemeId?: AuraVoiceVisemeId | undefined;
}

export interface GlbVisemeBlendshapeExample {
  readonly description: string;
  readonly mouthFallback: "blendshape";
  readonly requiredCharacterAssetRule: string;
  readonly blendshapeMap: Record<string, string>;
  readonly sampleWeights: Record<string, number>;
  readonly notes: readonly string[];
}

export interface PrimitiveMouthExample {
  readonly description: string;
  readonly mouthFallback: "primitive-mouth-card";
  readonly runtimeNodeSuffix: string;
  readonly cards: readonly PrimitiveMouthCard[];
  readonly notes: readonly string[];
}

export const primitiveMouthVisemeExample: PrimitiveMouthExample = {
  description: "Primitive character fallback that scales a small mouth-card runtime node from sampled visemes.",
  mouthFallback: "primitive-mouth-card",
  runtimeNodeSuffix: ":mouth",
  cards: ["closed", "narrow", "open", "wide", "round", "smile"],
  notes: [
    "Use this for generated primitive characters only.",
    "Register the mouth card with game.runtimeNode(`${characterId}:mouth`) and update it from sampleVisemeTrack."
  ]
};

export const glbVisemeBlendshapeExample: GlbVisemeBlendshapeExample = {
  description: "Typed GLB character example that drives named blendshape weights from AuraVoice visemes.",
  mouthFallback: "blendshape",
  requiredCharacterAssetRule: "Add the GLB with `npx @aura3d/cli@latest assets add ./assets/character.glb --name character`, then use model(assets.character).",
  blendshapeMap: {
    sil: "mouthClose",
    aa: "mouthOpen",
    ah: "mouthOpen",
    ae: "mouthSmile",
    eh: "mouthSmile",
    iy: "mouthNarrow",
    oh: "mouthFunnel",
    ow: "mouthFunnel",
    uw: "mouthPucker",
    bmp: "mouthPress",
    m: "mouthPress",
    p: "mouthPress",
    fv: "mouthLowerLipBite",
    th: "tongueOut"
  },
  sampleWeights: {
    mouthOpen: 0.68,
    mouthFunnel: 0.12,
    mouthSmile: 0.18,
    mouthPress: 0
  },
  notes: [
    "Do not reference a string asset id; import generated typed assets from ./aura-assets.",
    "Keep primitive-mouth-card available as a fallback when a GLB does not expose matching blendshapes."
  ]
};

export function defineAuraVoiceVisemes<const TTrack extends AuraVoiceVisemeTrack>(track: TTrack): TTrack {
  return track;
}

export function createAuraVoiceVisemeTrack(input: {
  readonly episodeId: PromptAnimationId;
  readonly language: PromptAnimationLanguageCode;
  readonly frameRate: PromptAnimationFrameRate;
  readonly cues: readonly AuraVoiceVisemeCue[];
  readonly generatedAt?: string | undefined;
}): AuraVoiceVisemeTrack {
  return {
    artifact: "visemes",
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    format: "auravoice-visemes-v2",
    language: input.language,
    frameRate: input.frameRate,
    cues: input.cues,
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
  };
}

export function createPrimitiveMouthVisemeCues(input: PrimitiveMouthVisemeCueInput): readonly AuraVoiceVisemeCue[] {
  const duration = Math.max(0.001, input.endTime - input.startTime);
  const openEnd = input.startTime + duration * 0.62;
  return [
    {
      id: `${input.lineId ?? input.characterId}:${input.startTime}:primitive-mouth-open`,
      characterId: input.characterId,
      ...(input.speakerId ? { speakerId: input.speakerId } : {}),
      ...(input.lineId ? { lineId: input.lineId } : {}),
      startTime: input.startTime,
      endTime: normalizePromptAnimationTime(openEnd),
      visemeId: input.openVisemeId ?? "ah",
      mouthOpenness: 0.58,
      weight: 0.9
    },
    {
      id: `${input.lineId ?? input.characterId}:${input.startTime}:primitive-mouth-close`,
      characterId: input.characterId,
      ...(input.speakerId ? { speakerId: input.speakerId } : {}),
      ...(input.lineId ? { lineId: input.lineId } : {}),
      startTime: normalizePromptAnimationTime(openEnd),
      endTime: input.endTime,
      visemeId: input.closeVisemeId ?? "m",
      mouthOpenness: 0.12,
      weight: 0.82
    }
  ];
}

export function createGlbBlendshapeVisemeCue(
  input: Omit<AuraVoiceVisemeCue, "blendshapeWeights" | "blendshapeNames"> & {
    readonly blendshapeMap?: Record<string, string> | undefined;
  }
): AuraVoiceVisemeCue {
  const { blendshapeMap: inputBlendshapeMap, ...cue } = input;
  const blendshapeMap = inputBlendshapeMap ?? glbVisemeBlendshapeExample.blendshapeMap;
  const blendshapeName = blendshapeMap[input.visemeId] ?? blendshapeMap[String(input.visemeId)] ?? input.visemeId;
  return {
    ...cue,
    blendshapeNames: [blendshapeName],
    blendshapeWeights: {
      [blendshapeName]: Math.min(1, Math.max(0, input.weight * Math.max(input.mouthOpenness, 0.12)))
    }
  };
}

export function primitiveMouthCardForViseme(visemeId: AuraVoiceVisemeId, mouthOpenness: number): PrimitiveMouthCard {
  if (mouthOpenness <= 0.08 || visemeId === "sil") return "closed";
  if (visemeId === "oh" || visemeId === "ow" || visemeId === "uw" || visemeId === "wq") return "round";
  if (visemeId === "iy" || visemeId === "s" || visemeId === "th") return "narrow";
  if (mouthOpenness >= 0.72 || visemeId === "aa" || visemeId === "ah") return "wide";
  if (visemeId === "eh" || visemeId === "ae") return "smile";
  return "open";
}

export function sampleVisemeTrack(
  track: AuraVoiceVisemeTrack,
  time: PromptAnimationSeconds,
  characterId?: PromptAnimationId
): VisemeSample {
  const normalized = normalizePromptAnimationTime(time);
  const activeCues: AuraVoiceVisemeCue[] = [];
  let primary: AuraVoiceVisemeCue | undefined;
  let mouthOpenness = 0;
  const weights: Record<string, number> = {};
  const blendshapeWeights: Record<string, number> = {};

  for (const cue of track.cues) {
    if (characterId && cue.characterId !== characterId) continue;
    if (normalized < cue.startTime || normalized >= cue.endTime) continue;
    activeCues.push(cue);
    if (!primary || cue.weight > primary.weight) primary = cue;
    mouthOpenness = Math.max(mouthOpenness, cue.mouthOpenness * cue.weight);
    weights[cue.visemeId] = Math.max(weights[cue.visemeId] ?? 0, cue.weight);

    if (cue.weights) {
      for (const [name, value] of Object.entries(cue.weights)) {
        weights[name] = Math.max(weights[name] ?? 0, value);
      }
    }

    if (cue.blendshapeWeights) {
      for (const [name, value] of Object.entries(cue.blendshapeWeights)) {
        blendshapeWeights[name] = Math.max(blendshapeWeights[name] ?? 0, value * cue.weight);
      }
    }
  }

  const primaryVisemeId = primary?.visemeId ?? "sil";
  return {
    time: normalized,
    ...(characterId ? { characterId } : {}),
    activeCues,
    visemeId: primaryVisemeId,
    primaryVisemeId,
    mouthOpenness,
    primitiveMouthCard: primitiveMouthCardForViseme(primaryVisemeId, mouthOpenness),
    weights,
    blendshapeWeights
  };
}

/**
 * Map a sampled viseme to named morph-target (blendshape) influences for a real GPU face. Returns
 * the blendshape weights from the sample (e.g. `{ "jawOpen": 0.7, "mouthSmile": 0.2 }`), ready to
 * feed `node.setMorphTargets(...)` / `node.morphInfluence(...)`.
 */
export function visemeSampleToMorphInfluences(sample: VisemeSample): RuntimeNodeMorphTargetWeights {
  return { ...sample.blendshapeWeights };
}

/**
 * Drive a runtime node's GPU-face morph influences from a sampled viseme — real blendshape lip-sync.
 * Clears unset targets via `setMorphTargets` when available, else applies each via `morphInfluence`.
 */
export function applyVisemeMorphInfluences(
  node: Pick<RuntimeNodeHandleLike, "setMorphTargets" | "morphInfluence">,
  sample: VisemeSample
): void {
  const influences = visemeSampleToMorphInfluences(sample);
  if (node.setMorphTargets) {
    node.setMorphTargets(influences);
    return;
  }
  if (node.morphInfluence) {
    for (const [name, weight] of Object.entries(influences)) node.morphInfluence(name, weight);
  }
}

export function createVisemeController(track: AuraVoiceVisemeTrack): VisemeController {
  return {
    track,
    sample(time: PromptAnimationSeconds, characterId?: PromptAnimationId): VisemeSample {
      return sampleVisemeTrack(track, time, characterId);
    },
    validate(): readonly PromptAnimationValidationIssue[] {
      return validateVisemeTrack(track);
    }
  };
}

export function validateVisemeTrack(track: AuraVoiceVisemeTrack): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  const ids = new Set<string>();

  if (track.format !== "auravoice-visemes-v2") {
    issues.push(createPromptAnimationIssue("error", "viseme-format", "Viseme track must use AuraVoice v2 format."));
  }

  if (track.frameRate <= 0) {
    issues.push(createPromptAnimationIssue("error", "viseme-frame-rate", "Viseme track frame rate must be positive."));
  }

  track.cues.forEach((cue, index) => {
    if (ids.has(cue.id)) {
      issues.push(
        createPromptAnimationIssue("error", "viseme-id-duplicate", `Duplicate viseme cue id "${cue.id}".`, {
          path: `cues.${index}.id`,
          time: cue.startTime
        })
      );
    }
    ids.add(cue.id);

    if (cue.endTime <= cue.startTime) {
      issues.push(
        createPromptAnimationIssue("error", "viseme-duration", `Viseme cue "${cue.id}" must end after it starts.`, {
          path: `cues.${index}`,
          time: cue.startTime
        })
      );
    }

    if (cue.wordStartTime !== undefined && cue.wordEndTime !== undefined && cue.wordEndTime < cue.wordStartTime) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "viseme-word-timing-order",
          `Viseme cue "${cue.id}" word timing must not end before it starts.`,
          { path: `cues.${index}.wordEndTime`, time: cue.startTime }
        )
      );
    }

    if (cue.wordIndex !== undefined && cue.wordIndex < 0) {
      issues.push(
        createPromptAnimationIssue("error", "viseme-word-index", `Viseme cue "${cue.id}" word index must be non-negative.`, {
          path: `cues.${index}.wordIndex`,
          time: cue.startTime
        })
      );
    }

    if (cue.mouthOpenness < 0 || cue.mouthOpenness > 1) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "viseme-mouth-openness",
          `Viseme cue "${cue.id}" mouth openness must be between 0 and 1.`,
          { path: `cues.${index}.mouthOpenness`, time: cue.startTime }
        )
      );
    }

    if (cue.weight < 0 || cue.weight > 1) {
      issues.push(
        createPromptAnimationIssue("error", "viseme-weight", `Viseme cue "${cue.id}" weight must be between 0 and 1.`, {
          path: `cues.${index}.weight`,
          time: cue.startTime
        })
      );
    }
  });

  return issues;
}
