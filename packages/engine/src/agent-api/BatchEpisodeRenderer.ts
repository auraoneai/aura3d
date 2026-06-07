import type { CartoonRenderQueueArtifact } from "./CartoonRenderQueue.js";
import type { PromptAnimationId } from "./PromptAnimationContract.js";

export interface BatchEpisodeDefinition {
  readonly episodeId: PromptAnimationId;
  readonly title: string;
  readonly renderQueue: CartoonRenderQueueArtifact;
  readonly outputDirectory: string;
}

export interface CartoonShowBibleBatch {
  readonly kind: "cartoon-show-bible-batch";
  readonly showId: PromptAnimationId;
  readonly title: string;
  readonly episodes: readonly BatchEpisodeDefinition[];
}

export interface BatchEpisodeRenderPlan {
  readonly kind: "batch-episode-render-plan";
  readonly showId: PromptAnimationId;
  readonly episodeCount: number;
  readonly totalFrameCount: number;
  readonly jobs: readonly BatchEpisodeRenderJob[];
}

export interface BatchEpisodeRenderJob {
  readonly episodeId: PromptAnimationId;
  readonly title: string;
  readonly route: string;
  readonly frameCount: number;
  readonly outputDirectory: string;
  readonly requiredOutputIds: readonly PromptAnimationId[];
}

export function createBatchEpisodeRenderPlan(batch: CartoonShowBibleBatch): BatchEpisodeRenderPlan {
  const jobs = batch.episodes.map((episode): BatchEpisodeRenderJob => ({
    episodeId: episode.episodeId,
    title: episode.title,
    route: episode.renderQueue.route,
    frameCount: episode.renderQueue.items.length,
    outputDirectory: episode.outputDirectory,
    requiredOutputIds: episode.renderQueue.outputs
      .filter((output) => output.required !== false)
      .map((output) => output.id)
  }));
  return {
    kind: "batch-episode-render-plan",
    showId: batch.showId,
    episodeCount: jobs.length,
    totalFrameCount: jobs.reduce((sum, job) => sum + job.frameCount, 0),
    jobs
  };
}
