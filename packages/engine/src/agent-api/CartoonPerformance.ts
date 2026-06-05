import {
  createPromptAnimationIssue,
  normalizePromptAnimationTime,
  promptAnimationContractVersion,
  type PromptAnimationArtifactBase,
  type PromptAnimationFrameRate,
  type PromptAnimationId,
  type PromptAnimationSeconds,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";
import type { AuraColor, AuraVec3 } from "./index.js";
import type { DialogueTrackArtifact } from "./DialoguePerformance.js";

export type CartoonPerformanceAction =
  | "idle"
  | "speak"
  | "listen"
  | "gesture"
  | "walk"
  | "run"
  | "react"
  | "look-at"
  | "enter"
  | "exit"
  | "blink"
  | "hold"
  | "nod"
  | "wave"
  | "point"
  | "reach"
  | "turn"
  | "lean";

export type CartoonPerformancePosture = "neutral" | "upright" | "lean-forward" | "lean-back" | "crouch" | "bounce";
export type CartoonFacialBrow = "neutral" | "raised" | "soft" | "furrowed" | "arched";
export type CartoonFacialEyeShape = "open" | "soft" | "wide" | "squint" | "closed";
export type CartoonFacialMouthShape = "neutral" | "smile" | "frown" | "open" | "round" | "wide";
export type CartoonGazeMode = "camera" | "target" | "speaker" | "listener" | "offscreen" | "down" | "up";

export interface CartoonPerformanceBodyState {
  readonly position?: AuraVec3 | undefined;
  readonly rotation?: AuraVec3 | undefined;
  readonly scale?: number | AuraVec3 | undefined;
  readonly rootMotion?: AuraVec3 | undefined;
  readonly posture?: CartoonPerformancePosture | string | undefined;
  readonly headTilt?: number | undefined;
  readonly torsoLean?: number | undefined;
  readonly shoulderRaise?: number | undefined;
  readonly armPose?: "neutral" | "open" | "crossed" | "pointing" | "waving" | "holding-prop" | string | undefined;
  readonly handPose?: "relaxed" | "open" | "point" | "fist" | "pinch" | string | undefined;
  readonly energy?: number | undefined;
}

export interface CartoonPerformanceFacialState {
  readonly brow?: CartoonFacialBrow | string | undefined;
  readonly eyes?: CartoonFacialEyeShape | string | undefined;
  readonly eyeOpen?: number | undefined;
  readonly mouth?: CartoonFacialMouthShape | string | undefined;
  readonly cheek?: "neutral" | "lifted" | "puffed" | string | undefined;
  readonly colorAccent?: AuraColor | undefined;
  readonly blinkRate?: number | undefined;
}

export interface CartoonPerformanceGestureState {
  readonly gestureId?: PromptAnimationId | undefined;
  readonly label?: string | undefined;
  readonly hand?: "left" | "right" | "both" | undefined;
  readonly amplitude?: number | undefined;
  readonly frequency?: number | undefined;
  readonly loop?: boolean | undefined;
  readonly phase?: number | undefined;
}

export interface CartoonPerformanceBlockingState {
  readonly position?: AuraVec3 | undefined;
  readonly rotation?: AuraVec3 | undefined;
  readonly scale?: number | AuraVec3 | undefined;
  readonly visible?: boolean | undefined;
  readonly layer?: "foreground" | "midground" | "background" | string | undefined;
  readonly anchorId?: PromptAnimationId | undefined;
  readonly propId?: PromptAnimationId | undefined;
}

export interface CartoonPerformanceGazeState {
  readonly mode: CartoonGazeMode | string;
  readonly targetId?: PromptAnimationId | undefined;
  readonly target?: AuraVec3 | undefined;
  readonly intensity?: number | undefined;
  readonly leadTime?: PromptAnimationSeconds | undefined;
}

export interface CartoonEmotionPose {
  readonly id: PromptAnimationId;
  readonly emotion: string;
  readonly body: CartoonPerformanceBodyState;
  readonly facial: CartoonPerformanceFacialState;
  readonly gaze?: CartoonPerformanceGazeState | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface CartoonGesture {
  readonly id: PromptAnimationId;
  readonly label: string;
  readonly action: CartoonPerformanceAction | string;
  readonly defaultDuration: PromptAnimationSeconds;
  readonly body: CartoonPerformanceBodyState;
  readonly gesture: CartoonPerformanceGestureState;
  readonly facial?: CartoonPerformanceFacialState | undefined;
  readonly reducedMotionSafe: boolean;
  readonly notes?: readonly string[] | undefined;
}

export const cartoonEmotionPoseLibrary: Record<string, CartoonEmotionPose> = {
  neutral: {
    id: "neutral",
    emotion: "neutral",
    body: { posture: "neutral", armPose: "neutral", handPose: "relaxed", energy: 0.35 },
    facial: { brow: "neutral", eyes: "open", eyeOpen: 0.88, mouth: "neutral" },
    gaze: { mode: "camera", intensity: 0.5 }
  },
  happy: {
    id: "happy",
    emotion: "happy",
    body: { posture: "upright", headTilt: 0.08, armPose: "open", handPose: "open", energy: 0.72 },
    facial: { brow: "raised", eyes: "soft", eyeOpen: 0.82, mouth: "smile", cheek: "lifted" },
    gaze: { mode: "listener", intensity: 0.72 }
  },
  excited: {
    id: "excited",
    emotion: "excited",
    body: { posture: "bounce", headTilt: 0.04, torsoLean: 0.08, armPose: "waving", handPose: "open", energy: 1 },
    facial: { brow: "raised", eyes: "wide", eyeOpen: 1, mouth: "wide", cheek: "lifted" },
    gaze: { mode: "camera", intensity: 0.92 },
    notes: ["Keep reduced-motion variants to small bounces and slow waves."]
  },
  curious: {
    id: "curious",
    emotion: "curious",
    body: { posture: "lean-forward", headTilt: -0.12, torsoLean: 0.12, armPose: "neutral", handPose: "pinch", energy: 0.56 },
    facial: { brow: "arched", eyes: "wide", eyeOpen: 0.96, mouth: "round" },
    gaze: { mode: "target", intensity: 0.86 }
  },
  concerned: {
    id: "concerned",
    emotion: "concerned",
    body: { posture: "lean-forward", headTilt: 0.1, torsoLean: 0.06, armPose: "open", handPose: "relaxed", energy: 0.44 },
    facial: { brow: "furrowed", eyes: "soft", eyeOpen: 0.76, mouth: "frown" },
    gaze: { mode: "speaker", intensity: 0.78 }
  },
  sad: {
    id: "sad",
    emotion: "sad",
    body: { posture: "lean-back", headTilt: 0.16, torsoLean: -0.08, armPose: "neutral", handPose: "relaxed", energy: 0.22 },
    facial: { brow: "soft", eyes: "soft", eyeOpen: 0.62, mouth: "frown" },
    gaze: { mode: "down", intensity: 0.64 }
  },
  surprised: {
    id: "surprised",
    emotion: "surprised",
    body: { posture: "upright", headTilt: -0.04, shoulderRaise: 0.24, armPose: "open", handPose: "open", energy: 0.84 },
    facial: { brow: "raised", eyes: "wide", eyeOpen: 1, mouth: "round" },
    gaze: { mode: "target", intensity: 0.95 }
  },
  whisper: {
    id: "whisper",
    emotion: "whisper",
    body: { posture: "lean-forward", headTilt: -0.06, torsoLean: 0.18, armPose: "neutral", handPose: "open", energy: 0.3 },
    facial: { brow: "soft", eyes: "squint", eyeOpen: 0.58, mouth: "round" },
    gaze: { mode: "listener", intensity: 0.88 }
  },
  shout: {
    id: "shout",
    emotion: "shout",
    body: { posture: "upright", headTilt: 0, shoulderRaise: 0.18, armPose: "open", handPose: "open", energy: 1 },
    facial: { brow: "raised", eyes: "wide", eyeOpen: 1, mouth: "wide" },
    gaze: { mode: "target", intensity: 1 },
    notes: ["Use only for stylized cartoon emphasis; avoid aggressive staging."]
  }
};

export const cartoonGestureLibrary: Record<string, CartoonGesture> = {
  "small-wave": {
    id: "small-wave",
    label: "Small friendly wave",
    action: "wave",
    defaultDuration: 1.2,
    body: { posture: "upright", armPose: "waving", handPose: "open", energy: 0.62 },
    gesture: { gestureId: "small-wave", hand: "right", amplitude: 0.42, frequency: 1.2, loop: false },
    facial: { mouth: "smile", eyes: "soft" },
    reducedMotionSafe: true
  },
  "two-hand-wave": {
    id: "two-hand-wave",
    label: "Two hand celebration wave",
    action: "wave",
    defaultDuration: 1,
    body: { posture: "bounce", armPose: "waving", handPose: "open", energy: 0.92 },
    gesture: { gestureId: "two-hand-wave", hand: "both", amplitude: 0.7, frequency: 1.4, loop: false },
    facial: { mouth: "wide", eyes: "wide" },
    reducedMotionSafe: false
  },
  "gentle-point": {
    id: "gentle-point",
    label: "Gentle point to a safe object",
    action: "point",
    defaultDuration: 0.9,
    body: { posture: "lean-forward", armPose: "pointing", handPose: "point", energy: 0.5 },
    gesture: { gestureId: "gentle-point", hand: "right", amplitude: 0.36, frequency: 0.7, loop: false },
    reducedMotionSafe: true
  },
  "curious-lean": {
    id: "curious-lean",
    label: "Curious lean toward target",
    action: "lean",
    defaultDuration: 1.1,
    body: { posture: "lean-forward", torsoLean: 0.16, headTilt: -0.12, handPose: "pinch", energy: 0.48 },
    gesture: { gestureId: "curious-lean", hand: "both", amplitude: 0.2, frequency: 0.35, loop: false },
    facial: { brow: "arched", mouth: "round" },
    reducedMotionSafe: true
  },
  "soft-nod": {
    id: "soft-nod",
    label: "Soft agreement nod",
    action: "nod",
    defaultDuration: 0.8,
    body: { posture: "neutral", headTilt: 0.1, energy: 0.4 },
    gesture: { gestureId: "soft-nod", amplitude: 0.18, frequency: 0.8, loop: false },
    facial: { mouth: "smile", eyes: "soft" },
    reducedMotionSafe: true
  }
};

export interface CartoonPerformanceCue {
  readonly id: PromptAnimationId;
  readonly shotId?: PromptAnimationId | undefined;
  readonly characterId: PromptAnimationId;
  readonly lineId?: PromptAnimationId | undefined;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly action: CartoonPerformanceAction | string;
  readonly emotion?: string | undefined;
  readonly emotionPoseId?: PromptAnimationId | undefined;
  readonly intensity?: number | undefined;
  readonly animationClip?: string | undefined;
  readonly visemeTrackId?: PromptAnimationId | undefined;
  readonly body?: CartoonPerformanceBodyState | undefined;
  readonly facial?: CartoonPerformanceFacialState | undefined;
  readonly gestureId?: PromptAnimationId | undefined;
  readonly gesture?: CartoonPerformanceGestureState | undefined;
  readonly blocking?: CartoonPerformanceBlockingState | undefined;
  readonly gaze?: CartoonPerformanceGazeState | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface CartoonPerformanceArtifact extends PromptAnimationArtifactBase<"cartoon-performance"> {
  readonly frameRate: PromptAnimationFrameRate;
  readonly cues: readonly CartoonPerformanceCue[];
}

export interface CartoonPerformanceCoverage {
  readonly cueCount: number;
  readonly speakingCueCount: number;
  readonly bodyCueCount: number;
  readonly facialCueCount: number;
  readonly gestureCueCount: number;
  readonly blockingCueCount: number;
  readonly gazeCueCount: number;
  readonly animatedCharacterIds: readonly PromptAnimationId[];
  readonly uncoveredDialogueLineIds: readonly PromptAnimationId[];
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export interface CartoonCharacterPerformanceState {
  readonly time: PromptAnimationSeconds;
  readonly characterId: PromptAnimationId;
  readonly activeCues: readonly CartoonPerformanceCue[];
  readonly primaryCue?: CartoonPerformanceCue | undefined;
  readonly action: CartoonPerformanceAction | string;
  readonly emotion: string;
  readonly intensity: number;
  readonly emotionPose: CartoonEmotionPose;
  readonly gesture?: CartoonGesture | undefined;
  readonly body: CartoonPerformanceBodyState;
  readonly facial: CartoonPerformanceFacialState;
  readonly blocking?: CartoonPerformanceBlockingState | undefined;
  readonly gaze?: CartoonPerformanceGazeState | undefined;
  readonly animationClip?: string | undefined;
}

export function defineCartoonPerformance<const TPerformance extends CartoonPerformanceArtifact>(
  performance: TPerformance
): TPerformance {
  return performance;
}

export function createCartoonPerformance(input: {
  readonly episodeId: PromptAnimationId;
  readonly frameRate: PromptAnimationFrameRate;
  readonly cues: readonly CartoonPerformanceCue[];
  readonly generatedAt?: string | undefined;
}): CartoonPerformanceArtifact {
  return {
    artifact: "cartoon-performance",
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    frameRate: input.frameRate,
    cues: input.cues,
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
  };
}

export function createDialogueCartoonPerformance(
  dialogue: DialogueTrackArtifact,
  options: {
    readonly frameRate?: PromptAnimationFrameRate | undefined;
    readonly shotByLineId?: Record<string, PromptAnimationId> | undefined;
    readonly visemeTrackId?: PromptAnimationId | undefined;
  } = {}
): CartoonPerformanceArtifact {
  const cues: CartoonPerformanceCue[] = dialogue.lines.map((line) => ({
    id: `${line.lineId}:speak`,
    ...(options.shotByLineId?.[line.lineId] ? { shotId: options.shotByLineId[line.lineId] } : {}),
    characterId: line.speakerId,
    lineId: line.lineId,
    startTime: line.startTime,
    endTime: line.endTime,
    action: "speak",
    emotion: line.emotion,
    emotionPoseId: resolveCartoonEmotionPose(line.emotion).id,
    intensity: line.emotion === "shout" || line.emotion === "excited" ? 1 : 0.66,
    body: resolveCartoonEmotionPose(line.emotion).body,
    facial: resolveCartoonEmotionPose(line.emotion).facial,
    gestureId: line.emotion === "excited" ? "two-hand-wave" : line.emotion === "curious" ? "curious-lean" : undefined,
    ...(line.emotion === "excited" || line.emotion === "curious"
      ? { gesture: resolveCartoonGesture(line.emotion === "excited" ? "two-hand-wave" : "curious-lean")?.gesture }
      : {}),
    gaze: { mode: "listener", intensity: 0.74 },
    ...(options.visemeTrackId ? { visemeTrackId: options.visemeTrackId } : {}),
    notes: [line.delivery]
  }));

  return createCartoonPerformance({
    episodeId: dialogue.episodeId,
    frameRate: options.frameRate ?? 30,
    cues
  });
}

export function resolveCartoonEmotionPose(emotionOrPoseId: string | undefined): CartoonEmotionPose {
  const key = normalizeLibraryKey(emotionOrPoseId ?? "neutral");
  return cartoonEmotionPoseLibrary[key] ?? cartoonEmotionPoseLibrary.neutral;
}

export function resolveCartoonGesture(gestureId: string | undefined): CartoonGesture | undefined {
  if (!gestureId) return undefined;
  return cartoonGestureLibrary[normalizeLibraryKey(gestureId)];
}

export function sampleCartoonCharacterPerformance(
  performance: CartoonPerformanceArtifact,
  time: PromptAnimationSeconds,
  characterId: PromptAnimationId
): CartoonCharacterPerformanceState {
  const normalized = normalizePromptAnimationTime(time);
  const activeCues = cartoonPerformanceCuesAtTime(performance, normalized, characterId);
  const primaryCue =
    activeCues.find((cue) => cue.action === "speak") ??
    activeCues.find((cue) => cue.gesture || cue.gestureId) ??
    activeCues[activeCues.length - 1];
  const emotionPose = resolveCartoonEmotionPose(primaryCue?.emotionPoseId ?? primaryCue?.emotion);
  const gesture = resolveCartoonGesture(primaryCue?.gestureId ?? primaryCue?.gesture?.gestureId);
  const body = {
    ...emotionPose.body,
    ...(gesture?.body ?? {}),
    ...(primaryCue?.body ?? {})
  };
  const facial = {
    ...emotionPose.facial,
    ...(gesture?.facial ?? {}),
    ...(primaryCue?.facial ?? {})
  };
  return {
    time: normalized,
    characterId,
    activeCues,
    ...(primaryCue ? { primaryCue } : {}),
    action: primaryCue?.action ?? "idle",
    emotion: primaryCue?.emotion ?? emotionPose.emotion,
    intensity: clampUnit(primaryCue?.intensity ?? body.energy ?? 0.35),
    emotionPose,
    ...(gesture ? { gesture } : {}),
    body,
    facial,
    ...(primaryCue?.blocking ? { blocking: primaryCue.blocking } : {}),
    gaze: primaryCue?.gaze ?? emotionPose.gaze,
    ...(primaryCue?.animationClip ? { animationClip: primaryCue.animationClip } : {})
  };
}

export function cartoonPerformanceCuesAtTime(
  performance: CartoonPerformanceArtifact,
  time: PromptAnimationSeconds,
  characterId?: PromptAnimationId
): readonly CartoonPerformanceCue[] {
  const normalized = normalizePromptAnimationTime(time);
  return performance.cues.filter((cue) => {
    if (characterId && cue.characterId !== characterId) return false;
    return normalized >= cue.startTime && normalized < cue.endTime;
  });
}

export function validateCartoonPerformance(
  performance: CartoonPerformanceArtifact
): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  const ids = new Set<string>();
  for (const [index, cue] of performance.cues.entries()) {
    if (ids.has(cue.id)) {
      issues.push(
        createPromptAnimationIssue("error", "performance-cue-id-duplicate", `Duplicate performance cue id "${cue.id}".`, {
          path: `cues.${index}.id`,
          time: cue.startTime
        })
      );
    }
    ids.add(cue.id);

    if (cue.endTime <= cue.startTime) {
      issues.push(
        createPromptAnimationIssue("error", "performance-cue-duration", `Performance cue "${cue.id}" must end after it starts.`, {
          path: `cues.${index}`,
          time: cue.startTime
        })
      );
    }

    if (cue.intensity !== undefined && (cue.intensity < 0 || cue.intensity > 1)) {
      issues.push(
        createPromptAnimationIssue("error", "performance-cue-intensity", `Performance cue "${cue.id}" intensity must be between 0 and 1.`, {
          path: `cues.${index}.intensity`,
          time: cue.startTime
        })
      );
    }

    if (cue.body?.energy !== undefined && (cue.body.energy < 0 || cue.body.energy > 1)) {
      issues.push(
        createPromptAnimationIssue("error", "performance-body-energy", `Performance cue "${cue.id}" body energy must be between 0 and 1.`, {
          path: `cues.${index}.body.energy`,
          time: cue.startTime
        })
      );
    }

    if (cue.facial?.eyeOpen !== undefined && (cue.facial.eyeOpen < 0 || cue.facial.eyeOpen > 1)) {
      issues.push(
        createPromptAnimationIssue("error", "performance-facial-eye-open", `Performance cue "${cue.id}" eyeOpen must be between 0 and 1.`, {
          path: `cues.${index}.facial.eyeOpen`,
          time: cue.startTime
        })
      );
    }

    if (cue.gestureId && !resolveCartoonGesture(cue.gestureId)) {
      issues.push(
        createPromptAnimationIssue("warning", "performance-gesture-library-missing", `Performance cue "${cue.id}" uses custom gesture "${cue.gestureId}".`, {
          path: `cues.${index}.gestureId`,
          time: cue.startTime
        })
      );
    }
  }
  return issues;
}

export function createCartoonPerformanceCoverage(
  performance: CartoonPerformanceArtifact,
  dialogue?: DialogueTrackArtifact
): CartoonPerformanceCoverage {
  const animatedCharacterIds = new Set<string>();
  const coveredLineIds = new Set<string>();
  let speakingCueCount = 0;
  let bodyCueCount = 0;
  let facialCueCount = 0;
  let gestureCueCount = 0;
  let blockingCueCount = 0;
  let gazeCueCount = 0;

  for (const cue of performance.cues) {
    animatedCharacterIds.add(cue.characterId);
    if (cue.action === "speak") speakingCueCount += 1;
    if (cue.body) bodyCueCount += 1;
    if (cue.facial) facialCueCount += 1;
    if (cue.gesture || cue.gestureId) gestureCueCount += 1;
    if (cue.blocking) blockingCueCount += 1;
    if (cue.gaze) gazeCueCount += 1;
    if (cue.lineId) coveredLineIds.add(cue.lineId);
  }

  const uncoveredDialogueLineIds: string[] = [];
  if (dialogue) {
    for (const line of dialogue.lines) {
      if (!coveredLineIds.has(line.lineId)) uncoveredDialogueLineIds.push(line.lineId);
    }
  }

  const issues = [...validateCartoonPerformance(performance)];
  for (const lineId of uncoveredDialogueLineIds) {
    issues.push(
      createPromptAnimationIssue("error", "performance-dialogue-uncovered", `Dialogue line "${lineId}" has no speaking cue.`, {
        path: `dialogue.${lineId}`
      })
    );
  }

  return {
    cueCount: performance.cues.length,
    speakingCueCount,
    bodyCueCount,
    facialCueCount,
    gestureCueCount,
    blockingCueCount,
    gazeCueCount,
    animatedCharacterIds: [...animatedCharacterIds],
    uncoveredDialogueLineIds,
    issues
  };
}

function normalizeLibraryKey(value: string): string {
  return value.toLowerCase().trim().replace(/_/g, "-");
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
