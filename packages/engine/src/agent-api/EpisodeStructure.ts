import { normalizePromptAnimationTime, promptAnimationContractVersion, type PromptAnimationId, type PromptAnimationSeconds, type PromptAnimationValidationIssue, createPromptAnimationIssue } from "./PromptAnimationContract.js";

export interface EpisodeShotRef {
  readonly shotId: PromptAnimationId;
  readonly timelineShotId?: PromptAnimationId | undefined;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly beat?: string | undefined;
  readonly pacing?: "hold" | "normal" | "quick" | "montage" | undefined;
}

export interface EpisodeSceneStructure {
  readonly sceneId: PromptAnimationId;
  readonly title: string;
  readonly locationId?: PromptAnimationId | undefined;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly characterIds: readonly PromptAnimationId[];
  readonly shotRefs: readonly EpisodeShotRef[];
}

export interface EpisodeActStructure {
  readonly actId: PromptAnimationId;
  readonly title: string;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly scenes: readonly EpisodeSceneStructure[];
  readonly pacingNotes?: readonly string[] | undefined;
}

export interface EpisodeStructureMetadata {
  readonly title: string;
  readonly description?: string | undefined;
  readonly runtime: PromptAnimationSeconds;
  readonly characterIds: readonly PromptAnimationId[];
  readonly language?: string | undefined;
}

export interface EpisodeStructureArtifact {
  readonly artifact: "episode-structure";
  readonly contractId: string;
  readonly episodeId: PromptAnimationId;
  readonly metadata: EpisodeStructureMetadata;
  readonly acts: readonly EpisodeActStructure[];
  readonly generatedAt?: string | undefined;
}

export type EpisodeStructure = EpisodeStructureArtifact;

export interface LegacyEpisodeShotReference {
  readonly shotId: PromptAnimationId;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
}

export interface LegacyEpisodeScene {
  readonly sceneId: PromptAnimationId;
  readonly title: string;
  readonly locationId?: PromptAnimationId | undefined;
  readonly shots: readonly LegacyEpisodeShotReference[];
}

export interface LegacyEpisodeAct {
  readonly actId: PromptAnimationId;
  readonly title: string;
  readonly scenes: readonly LegacyEpisodeScene[];
}

export interface LegacyEpisodeStructureInput {
  readonly episodeId: PromptAnimationId;
  readonly title: string;
  readonly acts: readonly LegacyEpisodeAct[];
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
  readonly duration?: PromptAnimationSeconds | undefined;
  readonly generatedAt?: string | undefined;
}

export type CreateEpisodeStructureInput = {
  readonly episodeId: PromptAnimationId;
  readonly metadata: EpisodeStructureMetadata;
  readonly acts: readonly EpisodeActStructure[];
  readonly generatedAt?: string | undefined;
};

export function createEpisodeStructure(input: CreateEpisodeStructureInput | LegacyEpisodeStructureInput): EpisodeStructureArtifact {
  if ("title" in input) {
    const sceneShots = (scene: LegacyEpisodeScene | EpisodeSceneStructure): readonly EpisodeShotRef[] =>
      "shots" in scene ? scene.shots : scene.shotRefs;
    const legacyActs = input.acts as readonly (LegacyEpisodeAct | EpisodeActStructure)[];
    const runtime = input.duration ?? Math.max(0, ...legacyActs.flatMap((act) => act.scenes.flatMap((scene) => sceneShots(scene).map((shot) => shot.endTime))));
    return {
      artifact: "episode-structure",
      contractId: promptAnimationContractVersion,
      episodeId: input.episodeId,
      metadata: {
        title: input.title,
        runtime: normalizePromptAnimationTime(runtime),
        characterIds: typeof input.metadata.characterId === "string" ? [input.metadata.characterId] : []
      },
      acts: legacyActs.map((act) => ({
        actId: act.actId,
        title: act.title,
        startTime: normalizePromptAnimationTime(readNumber(act, "startTime") ?? Math.min(...act.scenes.flatMap((scene) => sceneShots(scene).map((shot) => shot.startTime)), 0)),
        endTime: normalizePromptAnimationTime(readNumber(act, "endTime") ?? Math.max(...act.scenes.flatMap((scene) => sceneShots(scene).map((shot) => shot.endTime)), runtime)),
        scenes: act.scenes.map((scene) => ({
          sceneId: scene.sceneId,
          title: scene.title,
          locationId: scene.locationId,
          startTime: normalizePromptAnimationTime(readNumber(scene, "startTime") ?? Math.min(...sceneShots(scene).map((shot) => shot.startTime), 0)),
          endTime: normalizePromptAnimationTime(readNumber(scene, "endTime") ?? Math.max(...sceneShots(scene).map((shot) => shot.endTime), runtime)),
          characterIds: readStringArray(scene, "characterIds"),
          shotRefs: sceneShots(scene).map((shot) => ({ ...shot }))
        }))
      })),
      ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
    };
  }
  return {
    artifact: "episode-structure",
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    metadata: {
      ...input.metadata,
      runtime: normalizePromptAnimationTime(input.metadata.runtime)
    },
    acts: input.acts.map(normalizeActStructure),
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
  };
}

export function flattenEpisodeShotRefs(episode: EpisodeStructureArtifact): readonly EpisodeShotRef[] {
  return episode.acts.flatMap((act) => act.scenes.flatMap((scene) => scene.shotRefs));
}

export function sceneStructureAtTime(
  episode: EpisodeStructureArtifact,
  time: PromptAnimationSeconds
): EpisodeSceneStructure | undefined {
  const normalized = normalizePromptAnimationTime(time);
  for (const act of episode.acts) {
    for (const scene of act.scenes) {
      if (normalized >= scene.startTime && normalized < scene.endTime) return scene;
    }
  }
  const lastAct = episode.acts[episode.acts.length - 1];
  const lastScene = lastAct?.scenes[lastAct.scenes.length - 1];
  if (lastScene && normalized === lastScene.endTime) return lastScene;
  return undefined;
}

export function validateEpisodeStructure(episode: EpisodeStructureArtifact): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  if (!episode.metadata.title.trim()) {
    issues.push(createPromptAnimationIssue("error", "episode-structure-title-missing", "Episode structure requires a title."));
  }
  if (episode.acts.length === 0) {
    issues.push(createPromptAnimationIssue("error", "episode-structure-acts-missing", "Episode structure requires at least one act."));
  }
  const sceneIds = new Set<string>();
  const shotIds = new Set<string>();
  for (const [actIndex, act] of episode.acts.entries()) {
    if (act.endTime <= act.startTime) {
      issues.push(createPromptAnimationIssue("error", "episode-act-duration", `Act "${act.actId}" must end after it starts.`, { path: `acts.${actIndex}` }));
    }
    for (const [sceneIndex, scene] of act.scenes.entries()) {
      if (sceneIds.has(scene.sceneId)) {
        issues.push(createPromptAnimationIssue("error", "episode-scene-id-duplicate", `Duplicate scene id "${scene.sceneId}".`, { path: `acts.${actIndex}.scenes.${sceneIndex}` }));
      }
      sceneIds.add(scene.sceneId);
      if (scene.endTime <= scene.startTime) {
        issues.push(createPromptAnimationIssue("error", "episode-scene-duration", `Scene "${scene.sceneId}" must end after it starts.`, { path: `acts.${actIndex}.scenes.${sceneIndex}` }));
      }
      for (const [shotIndex, shot] of scene.shotRefs.entries()) {
        if (shotIds.has(shot.shotId)) {
          issues.push(createPromptAnimationIssue("warning", "episode-shot-id-reused", `Shot id "${shot.shotId}" is reused in the episode structure.`, { path: `acts.${actIndex}.scenes.${sceneIndex}.shotRefs.${shotIndex}` }));
        }
        shotIds.add(shot.shotId);
        if (shot.endTime <= shot.startTime) {
          issues.push(createPromptAnimationIssue("error", "episode-shot-duration", `Shot "${shot.shotId}" must end after it starts.`, { path: `acts.${actIndex}.scenes.${sceneIndex}.shotRefs.${shotIndex}` }));
        }
      }
    }
  }
  return issues;
}

function readNumber(value: unknown, key: string): number | undefined {
  const record = value as Record<string, unknown>;
  return typeof record[key] === "number" ? record[key] : undefined;
}

function readStringArray(value: unknown, key: string): readonly string[] {
  const record = value as Record<string, unknown>;
  return Array.isArray(record[key]) && record[key].every((entry) => typeof entry === "string") ? record[key] : [];
}

function normalizeActStructure(act: EpisodeActStructure): EpisodeActStructure {
  return {
    ...act,
    startTime: normalizePromptAnimationTime(act.startTime),
    endTime: normalizePromptAnimationTime(act.endTime),
    scenes: act.scenes.map((scene) => ({
      ...scene,
      startTime: normalizePromptAnimationTime(scene.startTime),
      endTime: normalizePromptAnimationTime(scene.endTime),
      shotRefs: scene.shotRefs.map((shot) => ({
        ...shot,
        startTime: normalizePromptAnimationTime(shot.startTime),
        endTime: normalizePromptAnimationTime(shot.endTime)
      }))
    }))
  };
}
