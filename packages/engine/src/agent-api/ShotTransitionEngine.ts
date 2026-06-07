import { normalizePromptAnimationTime, type PromptAnimationId, type PromptAnimationSeconds } from "./PromptAnimationContract.js";
import type { ShotTimelineArtifact, ShotTimelineShot, ShotTransition } from "./ShotTimeline.js";

export type ShotTransitionKind = ShotTransition | "crossfade" | "dip-to-black";
export type WipeDirection = "left" | "right" | "up" | "down";

export interface ShotTransitionDescriptor {
  readonly id: PromptAnimationId;
  readonly kind: ShotTransitionKind;
  readonly fromShotId?: PromptAnimationId | undefined;
  readonly toShotId?: PromptAnimationId | undefined;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly duration: PromptAnimationSeconds;
  readonly direction?: WipeDirection | undefined;
  readonly color?: string | undefined;
  readonly matchTargetId?: PromptAnimationId | undefined;
}

export interface ShotTransitionSample {
  readonly time: PromptAnimationSeconds;
  readonly transition?: ShotTransitionDescriptor | undefined;
  readonly progress: number;
  readonly fromOpacity: number;
  readonly toOpacity: number;
  readonly overlayOpacity: number;
  readonly wipeProgress?: number | undefined;
}

export interface ShotTransitionPlan {
  readonly kind: "shot-transition-plan";
  readonly episodeId: PromptAnimationId;
  readonly transitions: readonly ShotTransitionDescriptor[];
}

export interface LegacyShotTransitionSample {
  readonly kind: "shot-transition-sample";
  readonly transition: ShotTransition;
  readonly progress: number;
  readonly outgoingOpacity: number;
  readonly incomingOpacity: number;
  readonly wipeOffset: number;
}

export function createShotTransitionPlan(input: {
  readonly timeline: ShotTimelineArtifact;
  readonly defaultDuration?: PromptAnimationSeconds | undefined;
}): ShotTransitionPlan {
  const defaultDuration = input.defaultDuration ?? 0.35;
  const transitions: ShotTransitionDescriptor[] = [];
  for (let index = 0; index < input.timeline.shots.length - 1; index += 1) {
    const fromShot = input.timeline.shots[index];
    const toShot = input.timeline.shots[index + 1];
    if (!fromShot || !toShot) continue;
    const kind = normalizeTransitionKind(fromShot.transitionOut ?? toShot.transitionIn ?? "cut");
    const duration = transitionDuration(kind, defaultDuration);
    transitions.push(createShotTransitionDescriptor(fromShot, toShot, kind, duration));
  }
  return {
    kind: "shot-transition-plan",
    episodeId: input.timeline.episodeId,
    transitions
  };
}

export function sampleShotTransition(plan: ShotTransitionPlan, time: PromptAnimationSeconds): ShotTransitionSample;
export function sampleShotTransition(transition: ShotTransition, progress: number): LegacyShotTransitionSample;
export function sampleShotTransition(
  planOrTransition: ShotTransitionPlan | ShotTransition,
  timeOrProgress: PromptAnimationSeconds
): ShotTransitionSample | LegacyShotTransitionSample {
  if (typeof planOrTransition === "string") {
    const t = Math.min(1, Math.max(0, timeOrProgress));
    return {
      kind: "shot-transition-sample",
      transition: planOrTransition,
      progress: t,
      outgoingOpacity: planOrTransition === "cut" ? 0 : planOrTransition === "hold" ? 1 : 1 - t,
      incomingOpacity: planOrTransition === "cut" ? 1 : planOrTransition === "hold" ? 0 : t,
      wipeOffset: planOrTransition === "wipe" ? t : 0
    };
  }
  const plan = planOrTransition;
  const time = timeOrProgress;
  const normalized = normalizePromptAnimationTime(time);
  const transition = plan.transitions.find((candidate) => normalized > candidate.startTime && normalized < candidate.endTime);
  if (!transition) {
    return {
      time: normalized,
      progress: 1,
      fromOpacity: 0,
      toOpacity: 1,
      overlayOpacity: 0
    };
  }
  const progress = transition.duration <= 0 ? 1 : Math.max(0, Math.min(1, (normalized - transition.startTime) / transition.duration));
  if (transition.kind === "cut" || transition.kind === "hold") {
    return { time: normalized, transition, progress: 1, fromOpacity: 0, toOpacity: 1, overlayOpacity: 0 };
  }
  if (transition.kind === "dip-to-black" || transition.kind === "fade") {
    return {
      time: normalized,
      transition,
      progress,
      fromOpacity: progress < 0.5 ? 1 - progress * 2 : 0,
      toOpacity: progress < 0.5 ? 0 : (progress - 0.5) * 2,
      overlayOpacity: 1 - Math.abs(progress - 0.5) * 2
    };
  }
  return {
    time: normalized,
    transition,
    progress,
    fromOpacity: 1 - progress,
    toOpacity: progress,
    overlayOpacity: 0,
    ...(transition.kind === "wipe" ? { wipeProgress: progress } : {})
  };
}

export function createShotTransitionDescriptor(
  fromShot: ShotTimelineShot,
  toShot: ShotTimelineShot,
  kind: ShotTransitionKind,
  duration: PromptAnimationSeconds
): ShotTransitionDescriptor {
  const startTime = normalizePromptAnimationTime(toShot.startTime);
  const endTime = normalizePromptAnimationTime(Math.min(toShot.endTime, toShot.startTime + duration));
  const actualDuration = Math.max(0, endTime - startTime);
  return {
    id: `${fromShot.shotId}:to:${toShot.shotId}`,
    kind,
    fromShotId: fromShot.shotId,
    toShotId: toShot.shotId,
    startTime,
    endTime,
    duration: normalizePromptAnimationTime(actualDuration),
    ...(kind === "wipe" ? { direction: "left" as const } : {}),
    ...(kind === "dip-to-black" || kind === "fade" ? { color: "#000000" } : {}),
    ...(kind === "match-cut" ? { matchTargetId: toShot.characters[0]?.characterId } : {})
  };
}

function normalizeTransitionKind(kind: ShotTransition): ShotTransitionKind {
  if (kind === "fade") return "crossfade";
  return kind;
}

function transitionDuration(kind: ShotTransitionKind, defaultDuration: PromptAnimationSeconds): PromptAnimationSeconds {
  if (kind === "cut") return 0;
  if (kind === "hold") return Math.max(defaultDuration, 0.5);
  return defaultDuration;
}
