import type { AuraColor, AuraVec3 } from "./index.js";
import {
  createPromptAnimationIssue,
  normalizePromptAnimationTime,
  promptAnimationContractVersion,
  promptAnimationFrameAtTime,
  type PromptAnimationArtifactBase,
  type PromptAnimationFrameRate,
  type PromptAnimationId,
  type PromptAnimationSeconds,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";
import type { AnimationPerformanceArtifact, AnimationPerformanceCue } from "./AnimationPerformance.js";
import type { CaptionCue, CaptionTrackArtifact } from "./DialoguePerformance.js";
import { sampleVisemeTrack, type AuraVoiceVisemeId, type AuraVoiceVisemeTrack, type PrimitiveMouthCard } from "./VisemeController.js";

export type ShotCameraMove =
  | "static"
  | "cut"
  | "dolly"
  | "truck"
  | "pan"
  | "tilt"
  | "push-in"
  | "orbit"
  | "rack-focus"
  | "handheld";

export type ShotTransition = "cut" | "fade" | "wipe" | "match-cut" | "hold";
export type ShotBlockingAction = "idle" | "speak" | "gesture" | "walk" | "run" | "look" | "react" | "enter" | "exit";

export interface ShotCameraInstruction {
  readonly move: ShotCameraMove;
  readonly position?: AuraVec3 | undefined;
  readonly target?: AuraVec3 | undefined;
  readonly from?: AuraVec3 | undefined;
  readonly to?: AuraVec3 | undefined;
  readonly fov?: number | undefined;
  readonly focusTargetId?: PromptAnimationId | undefined;
  readonly focusDistance?: number | undefined;
  readonly rackFocusToId?: PromptAnimationId | undefined;
  readonly shake?: number | undefined;
  readonly colorGrade?: "warm" | "cool" | "night" | "soft" | "high-contrast" | undefined;
  readonly backgroundColor?: AuraColor | undefined;
  readonly notes?: readonly string[] | undefined;
}

export interface ShotCharacterBlocking {
  readonly characterId: PromptAnimationId;
  readonly position?: AuraVec3 | undefined;
  readonly lookAt?: AuraVec3 | PromptAnimationId | undefined;
  readonly facing?: "left" | "right" | "camera" | "three-quarter" | undefined;
  readonly action: ShotBlockingAction | string;
  readonly pose?: string | undefined;
  readonly gestureId?: PromptAnimationId | undefined;
  readonly animationClip?: string | undefined;
  readonly emotion?: string | undefined;
  readonly mouthTrackId?: PromptAnimationId | undefined;
  readonly hold?: boolean | undefined;
}

export interface ShotPropBlocking {
  readonly propId: PromptAnimationId;
  readonly position?: AuraVec3 | undefined;
  readonly visible?: boolean | undefined;
  readonly action?: string | undefined;
}

export interface ShotHoldTrimInstruction {
  readonly holdStart?: PromptAnimationSeconds | undefined;
  readonly holdEnd?: PromptAnimationSeconds | undefined;
  readonly trimStart?: PromptAnimationSeconds | undefined;
  readonly trimEnd?: PromptAnimationSeconds | undefined;
  readonly reason?: string | undefined;
}

export interface ShotTimelineShot {
  readonly id: PromptAnimationId;
  readonly shotId: PromptAnimationId;
  readonly sceneId: PromptAnimationId;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly transitionIn?: ShotTransition | undefined;
  readonly transitionOut?: ShotTransition | undefined;
  readonly camera: ShotCameraInstruction;
  readonly characters: readonly ShotCharacterBlocking[];
  readonly props?: readonly ShotPropBlocking[] | undefined;
  readonly holdTrim?: ShotHoldTrimInstruction | undefined;
  readonly captureTimes: readonly PromptAnimationSeconds[];
  readonly captions?: readonly PromptAnimationId[] | undefined;
  readonly intent?: string | undefined;
}

export interface ShotTimelineArtifact extends PromptAnimationArtifactBase<"shot-timeline"> {
  readonly frameRate: PromptAnimationFrameRate;
  readonly duration: PromptAnimationSeconds;
  readonly shots: readonly ShotTimelineShot[];
}

export interface ShotTimelineInput {
  readonly episodeId: PromptAnimationId;
  readonly frameRate: PromptAnimationFrameRate;
  readonly shots: readonly ShotTimelineShot[];
  readonly duration?: PromptAnimationSeconds | undefined;
  readonly generatedAt?: string | undefined;
}

export interface ShotTimelineDiagnostics {
  readonly shotCount: number;
  readonly duration: PromptAnimationSeconds;
  readonly captureCount: number;
  readonly uniqueSceneIds: readonly PromptAnimationId[];
  readonly frameRate: PromptAnimationFrameRate;
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export interface ShotPlaybackRuntimeNodeHandle {
  setPosition?(x: number, y: number, z: number): unknown;
  setRotation?(x: number, y: number, z: number): unknown;
  setScale?(scale: number | AuraVec3): unknown;
  setVisible?(visible: boolean): unknown;
  play?(clip: string, options?: { readonly loop?: boolean; readonly restart?: boolean; readonly speed?: number }): unknown;
}

export interface ShotPlaybackRuntimeApp {
  readonly nodes: {
    get(id: string): ShotPlaybackRuntimeNodeHandle | undefined;
  };
  onFrame(callback: (frame: { readonly dt: number; readonly time: number; readonly frame: number; readonly paused: boolean }) => void): () => void;
}

export interface ShotPlaybackPlanInput {
  readonly timeline: ShotTimelineArtifact;
  readonly performance?: AnimationPerformanceArtifact | undefined;
  readonly captions?: CaptionTrackArtifact | undefined;
  readonly visemes?: AuraVoiceVisemeTrack | undefined;
  readonly runtimeNodeByCharacterId?: Record<string, PromptAnimationId> | undefined;
  readonly loop?: boolean | undefined;
}

export interface ShotPlaybackCharacterMouthState {
  readonly visemeId: AuraVoiceVisemeId;
  readonly mouthOpenness: number;
  readonly primitiveMouthCard: PrimitiveMouthCard;
  readonly blendshapeWeights: Record<string, number>;
}

export interface ShotPlaybackNodeUpdate {
  readonly nodeId: PromptAnimationId;
  readonly characterId?: PromptAnimationId | undefined;
  readonly position?: AuraVec3 | undefined;
  readonly rotation?: AuraVec3 | undefined;
  readonly scale?: number | AuraVec3 | undefined;
  readonly visible?: boolean | undefined;
  readonly animationClip?: string | undefined;
  readonly action?: string | undefined;
  readonly emotion?: string | undefined;
  readonly gazeTargetId?: PromptAnimationId | undefined;
  readonly activeCueIds: readonly PromptAnimationId[];
  readonly mouth?: ShotPlaybackCharacterMouthState | undefined;
}

export interface ShotPlaybackFramePlan {
  readonly time: PromptAnimationSeconds;
  readonly frame: number;
  readonly shot?: ShotTimelineShot | undefined;
  readonly shotId?: PromptAnimationId | undefined;
  readonly sceneId?: PromptAnimationId | undefined;
  readonly caption?: CaptionCue | undefined;
  readonly nodeUpdates: readonly ShotPlaybackNodeUpdate[];
}

export interface ShotPlaybackPlan {
  readonly kind: "shot-playback-plan";
  readonly timeline: ShotTimelineArtifact;
  readonly performance?: AnimationPerformanceArtifact | undefined;
  readonly captions?: CaptionTrackArtifact | undefined;
  readonly visemes?: AuraVoiceVisemeTrack | undefined;
  readonly runtimeNodeByCharacterId: Record<string, PromptAnimationId>;
  readonly loop: boolean;
}

export interface ApplyShotPlaybackFrameOptions {
  readonly primitiveMouthNodeByCharacterId?: Record<string, PromptAnimationId> | undefined;
  readonly onCaption?: ((caption: CaptionCue | undefined, framePlan: ShotPlaybackFramePlan) => void) | undefined;
  readonly playAnimationClips?: boolean | undefined;
}

export interface InstallShotPlaybackOptions extends ApplyShotPlaybackFrameOptions {
  readonly timeOffset?: PromptAnimationSeconds | undefined;
  readonly useRuntimeTime?: boolean | undefined;
}

export function defineShotTimeline<const TTimeline extends ShotTimelineArtifact>(timeline: TTimeline): TTimeline {
  return timeline;
}

export function createShotTimeline(input: ShotTimelineInput): ShotTimelineArtifact {
  let duration = input.duration ?? 0;
  for (const shot of input.shots) {
    duration = Math.max(duration, shot.endTime);
  }

  return {
    artifact: "shot-timeline",
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    frameRate: input.frameRate,
    duration: normalizePromptAnimationTime(duration),
    shots: input.shots,
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
  };
}

export function shotTimeline(input: ShotTimelineInput): ShotTimelineArtifact {
  return createShotTimeline(input);
}

export function createShotPlaybackPlan(input: ShotPlaybackPlanInput): ShotPlaybackPlan {
  const runtimeNodeByCharacterId: Record<string, PromptAnimationId> = {};
  for (const shot of input.timeline.shots) {
    for (const character of shot.characters) {
      runtimeNodeByCharacterId[character.characterId] =
        input.runtimeNodeByCharacterId?.[character.characterId] ?? character.characterId;
    }
  }
  return {
    kind: "shot-playback-plan",
    timeline: input.timeline,
    ...(input.performance ? { performance: input.performance } : {}),
    ...(input.captions ? { captions: input.captions } : {}),
    ...(input.visemes ? { visemes: input.visemes } : {}),
    runtimeNodeByCharacterId,
    loop: input.loop ?? false
  };
}

export function sampleShotPlaybackPlan(
  plan: ShotPlaybackPlan,
  time: PromptAnimationSeconds
): ShotPlaybackFramePlan {
  const sampledTime = normalizeShotPlaybackTime(plan, time);
  const shot = getShotAtTime(plan.timeline, sampledTime);
  if (!shot) {
    return {
      time: sampledTime,
      frame: promptAnimationFrameAtTime(sampledTime, plan.timeline.frameRate),
      nodeUpdates: []
    };
  }

  const caption = plan.captions?.cues.find((cue) => sampledTime >= cue.startTime && sampledTime < cue.endTime);
  const nodeUpdates = shot.characters.map((character) => {
    const activeCues = activePerformanceCues(plan.performance, sampledTime, character.characterId, shot.shotId);
    const primaryCue =
      activeCues.find((cue) => cue.action === "speak") ??
      activeCues.find((cue) => cue.animationClip || cue.blocking || cue.body) ??
      activeCues[activeCues.length - 1];
    const viseme = plan.visemes ? sampleVisemeTrack(plan.visemes, sampledTime, character.characterId) : undefined;
    const blockingPosition = primaryCue?.blocking?.position ?? primaryCue?.body?.position ?? character.position;
    const blockingRotation = primaryCue?.blocking?.rotation ?? primaryCue?.body?.rotation ?? facingRotation(character.facing);
    const scale = primaryCue?.blocking?.scale ?? primaryCue?.body?.scale;
    return {
      nodeId: plan.runtimeNodeByCharacterId[character.characterId] ?? character.characterId,
      characterId: character.characterId,
      ...(blockingPosition ? { position: blockingPosition } : {}),
      ...(blockingRotation ? { rotation: blockingRotation } : {}),
      ...(scale !== undefined ? { scale } : {}),
      visible: primaryCue?.blocking?.visible ?? true,
      ...(primaryCue?.animationClip ?? character.animationClip
        ? { animationClip: primaryCue?.animationClip ?? character.animationClip }
        : {}),
      action: primaryCue?.action ?? character.action,
      ...(primaryCue?.emotion ?? character.emotion ? { emotion: primaryCue?.emotion ?? character.emotion } : {}),
      ...(primaryCue?.gaze?.targetId
        ? { gazeTargetId: primaryCue.gaze.targetId }
        : typeof character.lookAt === "string"
          ? { gazeTargetId: character.lookAt }
          : {}),
      activeCueIds: activeCues.map((cue) => cue.id),
      ...(viseme
        ? {
            mouth: {
              visemeId: viseme.primaryVisemeId,
              mouthOpenness: viseme.mouthOpenness,
              primitiveMouthCard: viseme.primitiveMouthCard,
              blendshapeWeights: viseme.blendshapeWeights
            }
          }
        : {})
    };
  });

  return {
    time: sampledTime,
    frame: promptAnimationFrameAtTime(sampledTime, plan.timeline.frameRate),
    shot,
    shotId: shot.shotId,
    sceneId: shot.sceneId,
    ...(caption ? { caption } : {}),
    nodeUpdates
  };
}

export function applyShotPlaybackFrame(
  app: { readonly nodes: { get(id: string): ShotPlaybackRuntimeNodeHandle | undefined } },
  framePlan: ShotPlaybackFramePlan,
  options: ApplyShotPlaybackFrameOptions = {}
): void {
  for (const update of framePlan.nodeUpdates) {
    const node = app.nodes.get(update.nodeId);
    if (node) applyNodeUpdate(node, update, options.playAnimationClips ?? true);

    const mouthNodeId = update.characterId ? options.primitiveMouthNodeByCharacterId?.[update.characterId] : undefined;
    const mouthNode = mouthNodeId ? app.nodes.get(mouthNodeId) : undefined;
    if (mouthNode && update.mouth) applyPrimitiveMouthUpdate(mouthNode, update.mouth, update.position);
  }

  options.onCaption?.(framePlan.caption, framePlan);
}

export function installShotPlayback(
  app: ShotPlaybackRuntimeApp,
  plan: ShotPlaybackPlan,
  options: InstallShotPlaybackOptions = {}
): () => void {
  let localTime = options.timeOffset ?? 0;
  return app.onFrame((frame) => {
    const sampledTime = options.useRuntimeTime === false ? localTime : frame.time + (options.timeOffset ?? 0);
    applyShotPlaybackFrame(app, sampleShotPlaybackPlan(plan, sampledTime), options);
    localTime = normalizePromptAnimationTime(localTime + frame.dt);
  });
}

export function shotDuration(shot: ShotTimelineShot): PromptAnimationSeconds {
  return normalizePromptAnimationTime(shot.endTime - shot.startTime);
}

export function getShotAtTime(
  timeline: ShotTimelineArtifact,
  time: PromptAnimationSeconds
): ShotTimelineShot | undefined {
  const normalized = normalizePromptAnimationTime(time);
  for (const shot of timeline.shots) {
    if (normalized >= shot.startTime && normalized < shot.endTime) return shot;
  }
  const lastShot = timeline.shots[timeline.shots.length - 1];
  if (lastShot && normalized === lastShot.endTime) return lastShot;
  return undefined;
}

export function getShotTimelineCaptureTimes(timeline: ShotTimelineArtifact): readonly PromptAnimationSeconds[] {
  const times = new Set<number>();
  for (const shot of timeline.shots) {
    for (const captureTime of shot.captureTimes) {
      times.add(normalizePromptAnimationTime(captureTime));
    }
  }
  return [...times].sort((a, b) => a - b);
}

export function validateShotTimeline(timeline: ShotTimelineArtifact): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  const shotIds = new Set<string>();
  let previousEnd = 0;

  if (timeline.frameRate <= 0) {
    issues.push(createPromptAnimationIssue("error", "shot-timeline-frame-rate", "Shot timeline frame rate must be positive."));
  }

  if (timeline.shots.length === 0) {
    issues.push(createPromptAnimationIssue("error", "shot-timeline-empty", "Shot timeline must contain at least one shot."));
  }

  timeline.shots.forEach((shot, index) => {
    if (!shot.shotId) {
      issues.push(
        createPromptAnimationIssue("error", "shot-id-missing", `Shot at index ${index} is missing a stable shot id.`, {
          path: `shots.${index}.shotId`
        })
      );
    }
    if (shotIds.has(shot.shotId)) {
      issues.push(
        createPromptAnimationIssue("error", "shot-id-duplicate", `Duplicate shot id "${shot.shotId}".`, {
          path: `shots.${index}.shotId`
        })
      );
    }
    shotIds.add(shot.shotId);

    if (shot.endTime <= shot.startTime) {
      issues.push(
        createPromptAnimationIssue("error", "shot-duration-invalid", `Shot "${shot.shotId}" must end after it starts.`, {
          path: `shots.${index}`,
          time: shot.startTime
        })
      );
    }

    if (index > 0 && shot.startTime < previousEnd) {
      issues.push(
        createPromptAnimationIssue("error", "shot-overlap", `Shot "${shot.shotId}" overlaps the previous shot.`, {
          path: `shots.${index}`,
          time: shot.startTime
        })
      );
    }

    for (const captureTime of shot.captureTimes) {
      if (captureTime < shot.startTime || captureTime > shot.endTime) {
        issues.push(
          createPromptAnimationIssue(
            "error",
            "shot-capture-outside-bounds",
            `Capture time ${captureTime}s is outside shot "${shot.shotId}".`,
            {
              path: `shots.${index}.captureTimes`,
              frame: promptAnimationFrameAtTime(captureTime, timeline.frameRate),
              time: captureTime
            }
          )
        );
      }
    }

    previousEnd = Math.max(previousEnd, shot.endTime);
  });

  if (previousEnd > timeline.duration) {
    issues.push(
      createPromptAnimationIssue(
        "error",
        "shot-timeline-duration-short",
        "Shot timeline duration is shorter than its final shot.",
        { time: previousEnd }
      )
    );
  }

  return issues;
}

export function createShotTimelineDiagnostics(timeline: ShotTimelineArtifact): ShotTimelineDiagnostics {
  const sceneIds = new Set<string>();
  for (const shot of timeline.shots) sceneIds.add(shot.sceneId);
  const captureTimes = getShotTimelineCaptureTimes(timeline);
  return {
    shotCount: timeline.shots.length,
    duration: timeline.duration,
    captureCount: captureTimes.length,
    uniqueSceneIds: [...sceneIds],
    frameRate: timeline.frameRate,
    issues: validateShotTimeline(timeline)
  };
}

function activePerformanceCues(
  performance: AnimationPerformanceArtifact | undefined,
  time: PromptAnimationSeconds,
  characterId: PromptAnimationId,
  shotId: PromptAnimationId
): readonly AnimationPerformanceCue[] {
  if (!performance) return [];
  return performance.cues.filter((cue) => {
    if (cue.characterId !== characterId) return false;
    if (cue.shotId && cue.shotId !== shotId) return false;
    return time >= cue.startTime && time < cue.endTime;
  });
}

function normalizeShotPlaybackTime(plan: ShotPlaybackPlan, time: PromptAnimationSeconds): PromptAnimationSeconds {
  const normalized = normalizePromptAnimationTime(time);
  if (!plan.loop || plan.timeline.duration <= 0) return normalized;
  return normalizePromptAnimationTime(normalized % plan.timeline.duration);
}

function facingRotation(facing: ShotCharacterBlocking["facing"]): AuraVec3 | undefined {
  if (facing === "left") return [0, -0.35, 0];
  if (facing === "right") return [0, 0.35, 0];
  if (facing === "three-quarter") return [0, 0.18, 0];
  return undefined;
}

function applyNodeUpdate(node: ShotPlaybackRuntimeNodeHandle, update: ShotPlaybackNodeUpdate, playAnimationClips: boolean): void {
  if (update.visible !== undefined) node.setVisible?.(update.visible);
  if (update.position) node.setPosition?.(update.position[0], update.position[1], update.position[2]);
  if (update.rotation) node.setRotation?.(update.rotation[0], update.rotation[1], update.rotation[2]);
  if (update.scale !== undefined) node.setScale?.(update.scale);
  if (playAnimationClips && update.animationClip) node.play?.(update.animationClip, { loop: true });
}

function applyPrimitiveMouthUpdate(
  mouthNode: ShotPlaybackRuntimeNodeHandle,
  mouth: ShotPlaybackCharacterMouthState,
  bodyPosition?: AuraVec3 | undefined
): void {
  const openness = Math.min(1, Math.max(0, mouth.mouthOpenness));
  const width =
    mouth.primitiveMouthCard === "round"
      ? 0.16
      : mouth.primitiveMouthCard === "wide"
        ? 0.34
        : mouth.primitiveMouthCard === "narrow"
          ? 0.12
          : mouth.primitiveMouthCard === "smile"
            ? 0.3
            : 0.22;
  const height = mouth.primitiveMouthCard === "closed" ? 0.025 : 0.035 + openness * 0.12;
  if (bodyPosition) mouthNode.setPosition?.(bodyPosition[0], bodyPosition[1] + 0.05, bodyPosition[2] + 0.32);
  mouthNode.setScale?.([width, height, 0.025]);
  mouthNode.setVisible?.(mouth.primitiveMouthCard !== "closed" || openness > 0.04);
}
