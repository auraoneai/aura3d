import { describe, expect, it } from "vitest";
import {
  PerformancePoseEditor,
  alignDialogueToAudio,
  blendPerformancePoses,
  bodyLanguageLibrary,
  createPerformanceTransitionPlan,
  episodeTemplate,
  parsePerformanceScriptCue,
  resolveBodyLanguageGesture
} from "../../../packages/engine/src";

describe("animation performance and episode template APIs", () => {
  it("authors poses, blends performance states, and parses script directions", () => {
    const editor = new PerformancePoseEditor();
    const neutral = editor.definePose({
      id: "neutral-custom",
      emotion: "neutral",
      body: { energy: 0.2, headTilt: 0 },
      facial: { eyeOpen: 0.7, mouth: "neutral" }
    });
    const excited = editor.definePose({
      id: "excited-custom",
      emotion: "excited",
      body: { energy: 1, headTilt: 0.2 },
      facial: { eyeOpen: 1, mouth: "wide" }
    });

    expect(editor.snapshot()).toMatchObject({ kind: "performance-pose-editor", poseCount: 2 });
    expect(blendPerformancePoses(neutral, excited, 0.5)).toMatchObject({
      kind: "performance-blend",
      body: { energy: 0.6, headTilt: 0.1 },
      facial: { eyeOpen: 0.85 }
    });
    expect(createPerformanceTransitionPlan(neutral, excited, { duration: 0.2, frameRate: 10 })).toMatchObject({
      kind: "performance-transition-plan",
      fromPoseId: "neutral-custom",
      toPoseId: "excited-custom",
      sampleCount: 3,
      smooth: true,
      deterministic: true
    });
    expect(parsePerformanceScriptCue("[excited] [gestures:wave] Hello there")).toMatchObject({
      emotion: "excited",
      gesture: "wave",
      cleanText: "Hello there"
    });
    expect(resolveBodyLanguageGesture("thinking")).toMatchObject({ id: "thinking" });
    expect(bodyLanguageLibrary.length).toBeGreaterThanOrEqual(4);
  });

  it("aligns dialogue durations and exposes episode templates", () => {
    const report = alignDialogueToAudio(
      {
        artifact: "dialogue-track",
        contractId: "auravoice-aura3d-prompt-animation/v1",
        episodeId: "episode",
        language: "en",
        duration: 2,
        lines: [{
          lineId: "line-1",
          speakerId: "hero",
          text: "Hello",
          language: "en",
          audioFile: "line.wav",
          startTime: 0,
          endTime: 1,
          emotion: "happy",
          delivery: "natural"
        }]
      },
      { "line.wav": 1.02 }
    );

    expect(report).toMatchObject({ kind: "dialogue-alignment", lineCount: 1, alignedLineCount: 1 });
    expect(report.maxDriftSeconds).toBeCloseTo(0.02);
    expect(episodeTemplate("educational")).toMatchObject({
      id: "educational",
      cameraStyle: "narrator-led topic segments"
    });
  });
});
