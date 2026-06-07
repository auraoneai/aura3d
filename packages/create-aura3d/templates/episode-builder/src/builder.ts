import { episode, publicCartoonAssetInstructions, typedCartoonAssetSummary } from "./episode";
import { publishReadiness } from "./render-plan";

export const episodeBuilderSupport = {
  template: "episode-builder",
  formats: [
    { id: "short-form", label: "Short-form", targetMinutes: "1-3", beats: "3-5", locations: "single" },
    { id: "standard", label: "Standard", targetMinutes: "5-7", beats: "8-12", locations: "multi" },
    { id: "series-pilot", label: "Series pilot", targetMinutes: "10-15", beats: "12-20", locations: "multi" },
    { id: "educational", label: "Educational", targetMinutes: "3-5", beats: "topic segments", locations: "guided" },
    { id: "music-video", label: "Music video", targetMinutes: "2-4", beats: "song sections", locations: "choreographed" }
  ] as const,
  wizardSteps: [
    { id: "prompt", label: "Prompt", complete: true },
    { id: "format", label: "Format", complete: true },
    { id: "characters", label: "Characters", complete: episode.episodePlan.characters.length >= 2 },
    { id: "beats", label: "Beats", complete: episode.shotTimeline.shots.length >= 3 },
    { id: "publish", label: "Publish", complete: publishReadiness.ready }
  ] as const,
  compiledEpisode: {
    episodeId: episode.episodePlan.episodeId,
    title: episode.episodePlan.title,
    sourcePrompt: episode.episodePlan.production.sourcePrompt,
    shotCount: episode.shotTimeline.shots.length,
    captionCount: episode.captionTrack.cues.length,
    renderQueueItems: episode.renderQueue.items.length
  },
  typedAssets: {
    requiredCharacters: typedCartoonAssetSummary.requiredCharacterAssets,
    missingCharacters: typedCartoonAssetSummary.missingCharacterAssets,
    commands: publicCartoonAssetInstructions
  }
} as const;

export function installEpisodeBuilderPanel(target: HTMLElement): void {
  const panel = document.createElement("section");
  panel.id = "episode-builder-panel";
  panel.style.cssText = [
    "position:fixed",
    "left:18px",
    "top:18px",
    "width:min(390px,calc(100vw - 36px))",
    "display:grid",
    "gap:8px",
    "padding:12px",
    "border:1px solid rgba(248,255,242,0.22)",
    "border-radius:8px",
    "background:rgba(3,12,20,0.78)",
    "color:#f8fff2",
    "font:600 12px/1.25 system-ui,sans-serif",
    "z-index:9"
  ].join(";");

  const format = document.createElement("select");
  format.id = "episode-format";
  format.style.cssText = "height:32px;border-radius:6px;background:#182d3f;color:#f8fff2;border:1px solid rgba(125,226,255,0.42)";
  for (const option of episodeBuilderSupport.formats) {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.label;
    format.appendChild(element);
  }
  panel.appendChild(format);

  const steps = document.createElement("div");
  steps.id = "episode-builder-steps";
  steps.textContent = episodeBuilderSupport.wizardSteps.map((step) => `${step.label}:${step.complete ? "ready" : "needs evidence"}`).join(" | ");
  steps.style.cssText = "color:#7de2ff;white-space:normal";
  panel.appendChild(steps);

  const compiled = document.createElement("div");
  compiled.id = "episode-builder-compiled-plan";
  compiled.textContent = `${episodeBuilderSupport.compiledEpisode.shotCount} shots | ${episodeBuilderSupport.compiledEpisode.captionCount} captions`;
  compiled.style.cssText = "color:#f8fff2;white-space:normal";
  panel.appendChild(compiled);

  target.appendChild(panel);
}
