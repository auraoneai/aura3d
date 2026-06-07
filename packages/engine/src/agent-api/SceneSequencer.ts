import { createShotTransitionPlan, sampleShotTransition, type ShotTransitionPlan, type ShotTransitionSample } from "./ShotTransitionEngine.js";
import { sceneStructureAtTime, type EpisodeSceneStructure, type EpisodeStructureArtifact } from "./EpisodeStructure.js";
import { getShotAtTime, type ShotTimelineArtifact, type ShotTimelineShot } from "./ShotTimeline.js";
import { normalizePromptAnimationTime, promptAnimationContractVersion, type PromptAnimationId, type PromptAnimationSeconds } from "./PromptAnimationContract.js";

export interface SceneSequencerSceneBinding {
  readonly sceneId: PromptAnimationId;
  readonly graphId?: PromptAnimationId | undefined;
  readonly route?: string | undefined;
  readonly thumbnailPath?: string | undefined;
  readonly characterIds?: readonly PromptAnimationId[] | undefined;
}

export interface SceneSequencerPlan {
  readonly artifact: "scene-sequencer";
  readonly contractId: string;
  readonly episodeId: PromptAnimationId;
  readonly episode: EpisodeStructureArtifact;
  readonly timeline: ShotTimelineArtifact;
  readonly scenes: readonly SceneSequencerSceneBinding[];
  readonly transitions: ShotTransitionPlan;
  readonly generatedAt?: string | undefined;
}

export interface SceneSequencerSample {
  readonly time: PromptAnimationSeconds;
  readonly scene?: EpisodeSceneStructure | undefined;
  readonly sceneBinding?: SceneSequencerSceneBinding | undefined;
  readonly shot?: ShotTimelineShot | undefined;
  readonly transition: ShotTransitionSample;
  readonly activeCharacterIds: readonly PromptAnimationId[];
}

export type SceneSequencer = SceneSequencerPlan;

export interface LegacySceneSequencerSnapshot {
  readonly kind: "scene-sequencer";
  readonly currentTime: number;
  readonly currentSceneId?: string | undefined;
  readonly currentShotId?: string | undefined;
  readonly sceneCount: number;
  readonly shotCount: number;
  readonly structure: EpisodeStructureArtifact;
}

export interface LegacySceneSequencer {
  readonly snapshot: LegacySceneSequencerSnapshot;
  seek(time: number): LegacySceneSequencerSnapshot;
  currentShot(): ShotTimelineShot | undefined;
}

export function createSceneSequencer(input: {
  readonly episode: EpisodeStructureArtifact;
  readonly timeline: ShotTimelineArtifact;
  readonly scenes?: readonly SceneSequencerSceneBinding[] | undefined;
  readonly transitions?: ShotTransitionPlan | undefined;
  readonly generatedAt?: string | undefined;
}): SceneSequencerPlan;
export function createSceneSequencer(timeline: ShotTimelineArtifact, structure: EpisodeStructureArtifact): LegacySceneSequencer;
export function createSceneSequencer(
  input: {
    readonly episode: EpisodeStructureArtifact;
    readonly timeline: ShotTimelineArtifact;
    readonly scenes?: readonly SceneSequencerSceneBinding[] | undefined;
    readonly transitions?: ShotTransitionPlan | undefined;
    readonly generatedAt?: string | undefined;
  } | ShotTimelineArtifact,
  structure?: EpisodeStructureArtifact
): SceneSequencerPlan | LegacySceneSequencer {
  if ("artifact" in input && input.artifact === "shot-timeline") {
    let currentTime = 0;
    if (!structure) throw new Error("Legacy createSceneSequencer(timeline, structure) requires an episode structure.");
    const currentShot = () => getShotAtTime(input, currentTime);
    const snapshot = (): LegacySceneSequencerSnapshot => {
      const shot = currentShot();
      return {
        kind: "scene-sequencer",
        currentTime,
        currentSceneId: shot?.sceneId,
        currentShotId: shot?.shotId,
        sceneCount: structure.acts.flatMap((act) => act.scenes).length,
        shotCount: input.shots.length,
        structure
      };
    };
    return {
      get snapshot() {
        return snapshot();
      },
      seek(time) {
        currentTime = Math.max(0, Math.min(input.duration, time));
        return snapshot();
      },
      currentShot
    };
  }
  const planInput = input as {
    readonly episode: EpisodeStructureArtifact;
    readonly timeline: ShotTimelineArtifact;
    readonly scenes?: readonly SceneSequencerSceneBinding[] | undefined;
    readonly transitions?: ShotTransitionPlan | undefined;
    readonly generatedAt?: string | undefined;
  };
  const sceneIds = new Set(planInput.episode.acts.flatMap((act) => act.scenes.map((scene) => scene.sceneId)));
  const provided = new Map((planInput.scenes ?? []).map((scene) => [scene.sceneId, scene]));
  const scenes: SceneSequencerSceneBinding[] = [...sceneIds].map((sceneId) => provided.get(sceneId) ?? { sceneId });
  return {
    artifact: "scene-sequencer",
    contractId: promptAnimationContractVersion,
    episodeId: planInput.episode.episodeId,
    episode: planInput.episode,
    timeline: planInput.timeline,
    scenes,
    transitions: planInput.transitions ?? createShotTransitionPlan({ timeline: planInput.timeline }),
    ...(planInput.generatedAt ? { generatedAt: planInput.generatedAt } : {})
  };
}

export function sampleSceneSequencer(plan: SceneSequencerPlan, time: PromptAnimationSeconds): SceneSequencerSample {
  const normalized = normalizePromptAnimationTime(time);
  const scene = sceneStructureAtTime(plan.episode, normalized);
  const shot = getShotAtTime(plan.timeline, normalized);
  const sceneBinding = plan.scenes.find((candidate) => candidate.sceneId === (shot?.sceneId ?? scene?.sceneId));
  const activeCharacterIds = shot?.characters.map((character) => character.characterId) ?? scene?.characterIds ?? [];
  return {
    time: normalized,
    ...(scene ? { scene } : {}),
    ...(sceneBinding ? { sceneBinding } : {}),
    ...(shot ? { shot } : {}),
    transition: sampleShotTransition(plan.transitions, normalized),
    activeCharacterIds
  };
}
