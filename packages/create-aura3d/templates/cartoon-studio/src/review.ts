import { captionTimingProof, renderOutputPackage, visemeFrameSyncSourceProof } from "./render-plan";
import { episode, missingCartoonCharacterAssets, publicCartoonAssetInstructions, typedCartoonAssetSummary, youtubeDraftMetadata } from "./episode";

export const cartoonEpisodePackageDirectory = "dist/episodes/moon-garden-001" as const;

export const requiredCartoonEpisodePackageFiles = [
  "episode.webm",
  "thumbnail.png",
  "captions.vtt",
  "captions.srt",
  "metadata.json",
  "prompt-animation-evidence.json",
  "route-proof.json",
  "asset-provenance.json",
  "render-manifest.json",
  "dub-metadata.json",
  "batch-render-plan.json",
  "motion-quality.json",
  "visual-acceptance.json",
  "review-package.md"
] as const;

export const optionalCartoonEpisodePackageFiles = [
  "episode.mp4",
  "episode.png-sequence-fallback.json"
] as const;

export interface CartoonEpisodeReviewInput {
  readonly packageDirectory?: string;
  readonly hasWebm: boolean;
  readonly hasPngSequenceFallback: boolean;
  readonly generatedAt: string;
}

export function createCartoonEpisodeReviewPackage(input: CartoonEpisodeReviewInput): string {
  const packageDirectory = input.packageDirectory ?? cartoonEpisodePackageDirectory;
  const outputMode = input.hasWebm ? "encoded-webm" : input.hasPngSequenceFallback ? "png-sequence-fallback" : "missing-render-output";
  const typedAssetStatus = missingCartoonCharacterAssets.length === 0 ? "typed character assets present" : "starter fallback mode";
  const reviewStatus = input.hasWebm && missingCartoonCharacterAssets.length === 0 ? "ready-for-human-review" : "needs-render-upgrade-before-publish";

  return [
    "# Moon Garden 001 Review Package",
    "",
    `Generated: ${input.generatedAt}`,
    `Episode: ${episode.episodePlan.title}`,
    `Package: \`${packageDirectory}\``,
    `Output mode: \`${outputMode}\``,
    `Review status: \`${reviewStatus}\``,
    "",
    "## Required Files",
    "",
    ...requiredCartoonEpisodePackageFiles.map((file) => `- [x] \`${file}\``),
    input.hasPngSequenceFallback ? "- [x] `episode.png-sequence-fallback.json`" : "- [ ] `episode.png-sequence-fallback.json`",
    "",
    "## Episode Summary",
    "",
    `- Runtime: ${episode.episodePlan.runtime.duration}s at ${episode.episodePlan.runtime.frameRate}fps`,
    `- Resolution: ${episode.episodePlan.runtime.resolution.width}x${episode.episodePlan.runtime.resolution.height}`,
    `- Shots: ${episode.shotTimeline.shots.length}`,
    `- Captions: ${episode.captionTrack.cues.length}`,
    `- Characters: ${episode.episodePlan.characters.map((character) => character.name).join(", ")}`,
    `- YouTube draft title: ${youtubeDraftMetadata.title}`,
    "",
    "## Asset Status",
    "",
    `- Status: ${typedAssetStatus}`,
    `- Required typed assets: ${typedCartoonAssetSummary.requiredCharacterAssets.join(", ")}`,
    `- Missing typed assets: ${missingCartoonCharacterAssets.length ? missingCartoonCharacterAssets.join(", ") : "none"}`,
    "",
    "Typed asset commands:",
    "",
    "```bash",
    ...publicCartoonAssetInstructions,
    "```",
    "",
    "## Timing Proof",
    "",
    `- Caption timing: ${captionTimingProof.status}`,
    `- Max caption drift frames: ${captionTimingProof.maxDriftFrames}`,
    `- Mouth source sync: ${visemeFrameSyncSourceProof.mouthMovementWithinOneFrame ? "pass" : "fail"}`,
    "",
    "## Human Review Checklist",
    "",
    "- [ ] Both characters are readable in representative frames.",
    "- [ ] Captions do not cover important action.",
    "- [ ] Mouth movement is visible during dialogue in the browser route.",
    "- [ ] Character body motion is more than still-image wobble.",
    "- [ ] No route chrome, proof panels, or debug overlays appear in encoded output.",
    "- [ ] Reviewer name and approval date are recorded before publish-ready claims.",
    "",
    "## Boundary",
    "",
    input.hasWebm
      ? "This package includes an encoded WebM output. Human review and asset readiness are still required before public publish-ready claims."
      : "This package uses the PNG-sequence fallback marker because no real browser video encoder was attached. It is useful for package workflow proof, but it is not publish-ready video evidence.",
    "",
    `Render package metadata source: \`${renderOutputPackage.packageId}\``
  ].join("\n");
}
