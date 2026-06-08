import type { AnimationRenderOutputPackageMetadata } from "./AnimationRenderQueue.js";
import type { PromptAnimationEpisodePlan, PromptAnimationYouTubeDraftMetadata } from "./PromptAnimationContract.js";

export interface YouTubeMetadataArtifact {
  readonly kind: "youtube-metadata";
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly categoryId: string;
  readonly defaultLanguage: string;
  readonly privacyStatus: "private" | "unlisted" | "public";
  readonly madeForKids: boolean;
  readonly captionsRequired: boolean;
  readonly thumbnailPath: string;
}

export function generateYouTubeMetadata(input: {
  readonly episodePlan?: PromptAnimationEpisodePlan | undefined;
  readonly packageMetadata: AnimationRenderOutputPackageMetadata;
  readonly overrides?: Partial<PromptAnimationYouTubeDraftMetadata> | undefined;
}): YouTubeMetadataArtifact {
  const draft = {
    ...input.packageMetadata.youtubeDraft,
    ...input.episodePlan?.youtube,
    ...input.overrides
  };
  const title = trimForYouTube(draft.title || input.episodePlan?.title || input.packageMetadata.episodeId, 100);
  const tags = uniqueTags([...(draft.tags ?? []), "Aura3D", "animation"]);
  return {
    kind: "youtube-metadata",
    title,
    description: draft.description ?? input.episodePlan?.production.sourcePrompt ?? title,
    tags,
    categoryId: draft.categoryId ?? "1",
    defaultLanguage: draft.defaultLanguage ?? input.packageMetadata.language,
    privacyStatus: draft.privacyStatus ?? "private",
    madeForKids: draft.madeForKids ?? input.episodePlan?.safety.childSafe ?? true,
    captionsRequired: input.episodePlan?.safety.captionRequired ?? input.packageMetadata.outputs.captions.length > 0,
    thumbnailPath: input.packageMetadata.outputs.thumbnail?.path ?? input.packageMetadata.thumbnailCapture.outputPath
  };
}

export function createYouTubeMetadataArtifact(draft: PromptAnimationYouTubeDraftMetadata): YouTubeMetadataArtifact {
  return {
    kind: "youtube-metadata",
    title: trimForYouTube(draft.title, 100),
    description: draft.description ?? "",
    tags: uniqueTags(draft.tags ?? []),
    madeForKids: draft.madeForKids ?? true,
    privacyStatus: draft.privacyStatus ?? "private",
    defaultLanguage: draft.defaultLanguage ?? "en",
    categoryId: draft.categoryId ?? "1",
    captionsRequired: true,
    thumbnailPath: ""
  };
}

function uniqueTags(tags: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = tag.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    result.push(trimForYouTube(normalized, 30));
  }
  return result.slice(0, 15);
}

function trimForYouTube(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength - 1).trimEnd();
}
