import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type PackageJson = {
  readonly scripts?: Record<string, string>;
};

describe("prompt animation source gates", () => {
  it("keeps storyboard and caption timing on the same episode contract", () => {
    const episode = readSource("packages/create-aura3d/templates/cartoon-channel/src/episode.ts");
    const renderPlan = readSource("packages/create-aura3d/templates/cartoon-channel/src/render-plan.ts");
    const storyboardSpec = readSource("packages/create-aura3d/templates/cartoon-channel/tests/storyboard-playback.spec.ts");

    expect(episode).toMatch(/runtime:\s*{[\s\S]*duration:\s*60[\s\S]*maxTimingDriftFrames:\s*1/);
    expectIncludesAll(episode, [
      "props: [",
      "styleGuide: {",
      "continuityRules: [",
      "export const storyBible = episode.storyBible",
      "export const shotList = storyBible.shotList"
    ]);
    expect(episode).toContain("captionSource: \"captions are derived one-to-one from the AuraVoice dialogue track\"");
    expect(episode).toMatch(/duration:\s*20[\s\S]*duration:\s*22[\s\S]*duration:\s*18/);
    expect(renderPlan).toContain("captionTrack: episode.captionTrack");
    expect(renderPlan).toContain("plannedDeterministicCaptureSources");
    expect(renderPlan).toContain("thumbnailCapture");
    expect(renderPlan).toContain('originalCaptionId: `${line.lineId}:caption`');
    expect(renderPlan).toContain('dubbedCaptionId: `${line.lineId}:caption`');
    expect(storyboardSpec).toContain("storyboard caption renders");
    expectIncludesAll(storyboardSpec, [
      "storyboard playback, character performance, caption timing, cuts, and nonblank cartoon frames are sourced",
      "__AURA3D_CARTOON_TEMPLATE__",
      "sampleAt(time)",
      "page.screenshot()",
      "storyBible?.shotList"
    ]);
  });

  it("keeps story bible, props, style guide, and shot list APIs in the public contract", () => {
    const contract = readSource("packages/engine/src/agent-api/PromptAnimationContract.ts");
    const director = readSource("packages/engine/src/agent-api/CartoonDirector.ts");
    const agentApi = readSource("packages/engine/src/agent-api/index.ts");

    expectIncludesAll(contract, [
      '"story-bible"',
      "export interface PromptAnimationProp",
      "export interface PromptAnimationStyleGuide",
      "export interface PromptAnimationShotListItem",
      "export interface PromptAnimationStoryBible",
      "export function createPromptAnimationStoryBible"
    ]);
    expectIncludesAll(director, [
      "readonly storyBible: PromptAnimationStoryBible",
      "props?: readonly CartoonDirectorPropInput[]",
      "styleGuide?: Partial<PromptAnimationStyleGuide>",
      "createPromptAnimationStoryBible",
      "shotList: shots.map"
    ]);
    expect(agentApi).toContain("storyBible: createPromptAnimationStoryBible");
  });

  it("keeps public prompt-animation playback, caption, viseme, and bridge helpers exported", () => {
    const rootIndex = readSource("packages/engine/src/index.ts");
    const agentApi = readSource("packages/engine/src/agent-api/index.ts");

    expect(rootIndex).toContain('export * from "./agent-api/index.js";');
    expectIncludesAll(agentApi, [
      "createPromptAnimationEpisodePlan",
      "definePromptAnimationStoryboard",
      "createShotTimeline",
      "createShotPlaybackPlan",
      "sampleShotPlaybackPlan",
      "applyShotPlaybackFrame",
      "installShotPlayback",
      "deriveCaptionTrackFromDialogue",
      "captionCueAtTime",
      "createCaptionTimingProof",
      "createAuraVoiceVisemeTrack",
      "sampleVisemeTrack",
      "createAuraVoiceBridgePackage",
      "sampleAuraVoiceBridgeAtTime",
      "createAuraVoiceRerenderPlan",
      "createAuraVoiceDubRerenderProof",
      "collectPromptAnimationEvidence",
      "createCartoonRenderQueue"
    ]);
  });

  it("keeps shot playback source tied to runtime nodes, captions, and visemes", () => {
    const shotTimeline = readSource("packages/engine/src/agent-api/ShotTimeline.ts");

    expectIncludesAll(shotTimeline, [
      "export interface ShotPlaybackRuntimeNodeHandle",
      "play?(clip: string",
      "export function createShotPlaybackPlan",
      "captions?: CaptionTrackArtifact",
      "visemes?: AuraVoiceVisemeTrack",
      "const caption = plan.captions?.cues.find",
      "const viseme = plan.visemes ? sampleVisemeTrack",
      "primitiveMouthNodeByCharacterId",
      "options.onCaption?.(framePlan.caption, framePlan);",
      "return app.onFrame((frame) => {",
      "applyShotPlaybackFrame(app, sampleShotPlaybackPlan(plan, sampledTime), options);",
      "if (playAnimationClips && update.animationClip) node.play?.(update.animationClip, { loop: true });"
    ]);
  });

  it("keeps caption timing and AuraVoice viseme source contracts discoverable", () => {
    const dialogue = readSource("packages/engine/src/agent-api/DialoguePerformance.ts");
    const visemes = readSource("packages/engine/src/agent-api/VisemeController.ts");

    expectIncludesAll(dialogue, [
      "export function deriveCaptionTrackFromDialogue",
      'captionId: options.captionIdByLineId?.[line.lineId] ?? `${line.lineId}:caption`',
      "export function captionCueAtTime",
      "export function captionCuesForShot",
      "export function createCaptionTimingProof",
      "maxAllowedDriftFrames",
      "caption-proof-drift"
    ]);
    expectIncludesAll(visemes, [
      'export type AuraVoiceVisemeFormat = "auravoice-visemes-v2"',
      "export function createAuraVoiceVisemeTrack",
      'format: "auravoice-visemes-v2"',
      "export function createPrimitiveMouthVisemeCues",
      "export function createGlbBlendshapeVisemeCue",
      "export function sampleVisemeTrack",
      "blendshapeWeights",
      "phoneme",
      "phonemeId",
      "wordStartTime",
      "wordEndTime",
      "primitiveMouthCardForViseme",
      'game.runtimeNode(`${characterId}:mouth`)'
    ]);
  });

  it("keeps AuraVoice bridge and deterministic capture source tokens covered", () => {
    const bridge = readSource("packages/engine/src/agent-api/AuraVoiceBridge.ts");
    const evidence = readSource("packages/engine/src/agent-api/PromptAnimationEvidence.ts");

    expectIncludesAll(bridge, [
      "export function createAuraVoiceBridgePackage",
      "export function createAuraVoiceMasterClock",
      "readonly maxTimingDriftFrames",
      "captionTrack?: CaptionTrackArtifact",
      "visemes?: AuraVoiceVisemeTrack",
      "audioStems?: AudioStemManifestArtifact",
      "validateAuraVoiceTimingDrift",
      "validateAuraVoiceVisemeCoverage",
      "validateAuraVoiceDubMap",
      "export function createAuraVoiceRerenderPlan",
      "export function createAuraVoiceDubRerenderProof",
      "export function sampleAuraVoiceBridgeAtTime",
      "dialogueLineAtTime",
      "sampleVisemeTrack"
    ]);
    expectIncludesAll(evidence, [
      "export interface PromptAnimationAudioEvidence",
      "missingDialogueLineIds",
      "dialogueStemCount",
      "deterministicCaptures",
      "derivePromptAnimationDeterministicCaptures",
      "auraVoiceTimestamp",
      "captionCueId",
      "visemeCueId",
      "createPromptAnimationDeterministicScreenshotFixtureMetadata"
    ]);
  });

  it("keeps cartoon-channel template playback, caption, and viseme source wired", () => {
    const main = readSource("packages/create-aura3d/templates/cartoon-channel/src/main.ts");
    const renderPlan = readSource("packages/create-aura3d/templates/cartoon-channel/src/render-plan.ts");

    expectIncludesAll(main, [
      "createShotPlaybackPlan",
      "installShotPlayback",
      "captionCueAtTime",
      'const captionOverlay = document.createElement("div")',
      "primitiveMouthNodeByCharacterId",
      "onCaption(caption, framePlan)",
      "captionOverlay.dataset.captionId",
      "__AURA3D_CARTOON_TEMPLATE__",
      "playbackProbeTimes",
      "sampleShotPlaybackPlan",
      "storyBible.props.length"
    ]);
    expectIncludesAll(renderPlan, [
      "createAuraVoiceBridgePackage",
      "createAuraVoiceVisemeTrack",
      "createCaptionTimingProof",
      "createPromptAnimationDeterministicScreenshotFixtureMetadata",
      "plannedDeterministicCaptureSources",
      "auraVoiceTimestamp",
      "visemeTrack",
      "captionTrack: episode.captionTrack",
      "phonemeVisemeDubSyncSourceProof",
      "sampledPhonemeVisemeCues",
      "stableShotIds"
    ]);
  });

  it("keeps prompt-cartoon-channel source parity for captions, phonemes, visemes, dubs, and render packages", () => {
    const promptRenderPlan = readSource("packages/create-aura3d/templates/prompt-cartoon-channel/src/render-plan.ts");
    const promptMain = readSource("packages/create-aura3d/templates/prompt-cartoon-channel/src/main.ts");

    expectIncludesAll(promptRenderPlan, [
      "createAuraVoiceBridgePackage",
      "captionFrameSyncSourceProof",
      "visemeFrameSyncSourceProof",
      "phonemeVisemeDubSyncSourceProof",
      "sampledPhonemeVisemeCues",
      "sampleRenderSourceWorkflow",
      "artifactManifestExpectations",
      "requiredEvidenceJsonFields",
      "stableStoryboardIds",
      "stableCaptionIds"
    ]);
    expectIncludesAll(promptMain, [
      "__AURA3D_CARTOON_TEMPLATE__",
      "createShotPlaybackPlan",
      "installShotPlayback",
      "phonemeVisemeDubSyncSourceProof",
      "sourceProofs"
    ]);
  });

  it("keeps package-smoke and release-gate scripts wired into prompt animation readiness", () => {
    const scripts = readPackageJson().scripts ?? {};
    const packageSmoke = scripts["prompt-animation:package:raw"] ?? "";
    const release = scripts["prompt-animation:release:raw"] ?? "";

    expect(scripts["prompt-animation:unit:raw"]).toContain("tests/unit/agent-api");
    expect(scripts["prompt-animation:browser:raw"]).toContain("packages/create-aura3d/templates/cartoon-channel/tests/storyboard-playback.spec.ts");
    expect(scripts["prompt-animation:browser:raw"]).toContain("packages/create-aura3d/templates/cartoon-channel/tests/sample-episode-visual.spec.ts");
    expect(scripts["prompt-animation:browser:raw"]).toContain("packages/create-aura3d/templates/prompt-cartoon-channel/tests/storyboard-playback.spec.ts");
    expect(packageSmoke).toContain("prompt-animation:template");
    expect(packageSmoke).toContain("prompt-animation:docs");
    expect(packageSmoke).toContain("tools/prompt-animation-package-smoke/index.ts");
    expect(scripts["prompt-animation:auravoice-contract:raw"]).toContain("tools/prompt-animation-auravoice-contract/index.ts");
    expect(scripts["prompt-animation:auravoice-render:raw"]).toContain("tools/prompt-animation-auravoice-render/index.ts");
    expect(scripts["prompt-animation:viseme-sync:raw"]).toContain("tools/prompt-animation-viseme-sync/index.ts");
    expect(scripts["prompt-animation:dub-sync:raw"]).toContain("tools/prompt-animation-dub-sync/index.ts");
    expect(scripts["prompt-animation:evidence:raw"]).toContain("tools/prompt-animation-evidence/index.ts");
    for (const gate of ["unit", "browser", "template", "docs", "package"]) {
      expect(release).toContain(`pnpm prompt-animation:${gate}`);
    }
    expect(release.indexOf("pnpm prompt-animation:package")).toBeGreaterThan(release.indexOf("pnpm prompt-animation:docs"));
  });

  it("keeps AuraVoice source-only proof scripts scoped to contracts, rerender, visemes, dubs, and evidence", () => {
    for (const file of [
      "tools/prompt-animation-auravoice-contract/index.ts",
      "tools/prompt-animation-auravoice-render/index.ts",
      "tools/prompt-animation-viseme-sync/index.ts",
      "tools/prompt-animation-dub-sync/index.ts",
      "tools/prompt-animation-evidence/index.ts"
    ]) {
      const source = readSource(file);
      expect(source).toContain("sourceOnly");
      expect(source).toContain("auravoice-aura3d-prompt-animation/v1");
    }
    expect(readSource("tools/prompt-animation-auravoice-contract/index.ts")).toContain("../platforms/auravoice");
    expect(readSource("tools/prompt-animation-auravoice-render/index.ts")).toContain("createAuraVoiceRerenderPlan");
    expect(readSource("tools/prompt-animation-viseme-sync/index.ts")).toContain("createGlbBlendshapeVisemeCue");
    expect(readSource("tools/prompt-animation-dub-sync/index.ts")).toContain("createAuraVoiceDubRerenderProof");
    expect(readSource("tools/prompt-animation-evidence/index.ts")).toContain("actualProofFilesPresent");
  });
});

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

function readPackageJson(): PackageJson {
  return JSON.parse(readSource("package.json")) as PackageJson;
}

function expectIncludesAll(source: string, tokens: readonly string[]): void {
  for (const token of tokens) expect(source).toContain(token);
}
