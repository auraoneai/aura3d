import { episode, publicCartoonAssetInstructions, typedCartoonAssetSummary } from "./episode";
import { publishReadiness, renderPlan } from "./render-plan";

export const cartoonStudioSupport = {
  template: "cartoon-studio",
  panels: ["timeline", "assets", "performance", "render"] as const,
  timelineTracks: [
    {
      id: "shots",
      label: "Shots",
      clips: episode.shotTimeline.shots.map((shot) => ({
        id: shot.shotId,
        startTime: shot.startTime,
        endTime: shot.endTime,
        cameraMove: shot.camera.move,
        transitionOut: shot.transitionOut ?? "cut"
      }))
    },
    {
      id: "dialogue",
      label: "Dialogue",
      clips: episode.dialogueTrack.lines.map((line) => ({
        id: line.lineId,
        speakerId: line.speakerId,
        startTime: line.startTime,
        endTime: line.endTime,
        text: line.text
      }))
    },
    {
      id: "render",
      label: "Render",
      clips: renderPlan.items.map((item) => ({
        id: item.id,
        time: item.time,
        outputIds: item.outputIds,
        width: item.viewport.width,
        height: item.viewport.height
      }))
    }
  ],
  assetLibrary: {
    requiredCharacters: typedCartoonAssetSummary.requiredCharacterAssets,
    optionalProps: typedCartoonAssetSummary.optionalPropAssets,
    missingCharacters: typedCartoonAssetSummary.missingCharacterAssets,
    commands: publicCartoonAssetInstructions
  },
  renderPipeline: {
    outputs: renderPlan.outputs.map((output) => output.kind),
    itemCount: renderPlan.items.length,
    publishReadyFromCurrentEvidence: publishReadiness.ready,
    issueCount: publishReadiness.issues.length
  }
} as const;

export function installCartoonStudioPanel(target: HTMLElement): void {
  const panel = document.createElement("section");
  panel.id = "cartoon-studio-panel";
  panel.style.cssText = [
    "position:fixed",
    "left:18px",
    "top:18px",
    "width:min(360px,calc(100vw - 36px))",
    "display:grid",
    "grid-template-columns:repeat(4,1fr)",
    "gap:6px",
    "padding:10px",
    "border:1px solid rgba(248,255,242,0.22)",
    "border-radius:8px",
    "background:rgba(3,12,20,0.78)",
    "color:#f8fff2",
    "font:600 12px/1.2 system-ui,sans-serif",
    "z-index:9"
  ].join(";");

  for (const name of cartoonStudioSupport.panels) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.dataset.panel = name;
    button.style.cssText = [
      "min-width:0",
      "height:30px",
      "border:1px solid rgba(125,226,255,0.42)",
      "border-radius:6px",
      "background:rgba(24,45,63,0.84)",
      "color:#f8fff2",
      "font:inherit",
      "text-transform:capitalize"
    ].join(";");
    panel.appendChild(button);
  }

  const status = document.createElement("div");
  status.id = "cartoon-studio-status";
  status.textContent = `${episode.shotTimeline.shots.length} shots | ${episode.dialogueTrack.lines.length} lines | ${renderPlan.items.length} render cues`;
  status.style.cssText = "grid-column:1 / -1;color:#7de2ff;white-space:normal";
  panel.appendChild(status);

  target.appendChild(panel);
}
