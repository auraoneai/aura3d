import { describe, expect, it } from "vitest";
import {
  cartoon,
  createCartoonMotionQualityReport,
  validateCartoonMotionQuality,
  type CartoonMotionFrameSample,
  type CartoonMotionSegmentInput
} from "../../../packages/engine/src";

const generatedAt = "2026-06-06T00:00:00.000Z";

describe("cartoon motion quality", () => {
  it("rejects global-only still-image motion", () => {
    const report = createCartoonMotionQualityReport({
      episodeId: "moon-garden-001",
      frameRate: 30,
      generatedAt,
      frames: globalOnlyFrames(),
      segments: [{
        id: "action-1",
        kind: "action",
        startFrame: 0,
        endFrame: 4,
        characterIds: ["miko"]
      }]
    });

    expect(report.status).toBe("fail");
    expect(report.globalOnlyMotion).toBe(true);
    expect(report.issues.map((issue) => issue.code)).toContain("cartoon-motion-global-only");
    expect(report.segments[0]?.issues.map((issue) => issue.code)).toContain("cartoon-motion-segment-global-only");
    expect(validateCartoonMotionQuality(report).map((issue) => issue.code)).toContain("cartoon-motion-global-only");
  });

  it("passes independent character and mouth motion", () => {
    const report = cartoon.motionQuality({
      episodeId: "moon-garden-001",
      frameRate: 30,
      generatedAt,
      frames: independentMotionFrames(),
      segments: [
        { id: "dialogue-1", kind: "dialogue", startFrame: 0, endFrame: 3, characterIds: ["miko"] },
        { id: "action-1", kind: "action", startFrame: 4, endFrame: 7, characterIds: ["luma"] }
      ]
    });

    expect(report.status).toBe("pass");
    expect(report.globalOnlyMotion).toBe(false);
    expect(report.segments.map((segment) => segment.movingRegionKinds)).toEqual([
      ["arm", "mouth"],
      ["arm", "leg", "prop"]
    ]);
    expect(validateCartoonMotionQuality(report)).toHaveLength(0);
  });

  it("requires mouth motion during dialogue beats", () => {
    const frames = independentMotionFrames().slice(0, 4).map((frame) => ({
      ...frame,
      regions: frame.regions.filter((region) => region.kind !== "mouth")
    }));
    const segment: CartoonMotionSegmentInput = { id: "dialogue-1", kind: "dialogue", startFrame: 0, endFrame: 3 };
    const report = createCartoonMotionQualityReport({
      episodeId: "moon-garden-001",
      frameRate: 30,
      frames,
      segments: [segment]
    });

    expect(report.status).toBe("fail");
    expect(report.issues.map((issue) => issue.code)).toContain("cartoon-motion-mouth-missing");
  });
});

function globalOnlyFrames(): readonly CartoonMotionFrameSample[] {
  return Array.from({ length: 5 }, (_, frame) => ({
    frame,
    time: frame / 30,
    frameHash: `global-${frame}`,
    globalDelta: 0.12,
    regions: [
      { id: "miko-head", kind: "head", characterId: "miko", visible: true, delta: 0.003 },
      { id: "miko-arm", kind: "arm", characterId: "miko", visible: true, delta: 0.002 }
    ]
  }));
}

function independentMotionFrames(): readonly CartoonMotionFrameSample[] {
  const dialogueFrames: CartoonMotionFrameSample[] = Array.from({ length: 4 }, (_, frame) => ({
    frame,
    time: frame / 30,
    frameHash: `dialogue-${frame}`,
    globalDelta: 0.012,
    regions: [
      { id: "miko-mouth", kind: "mouth", characterId: "miko", visible: true, delta: 0.05, mouthDelta: 0.05 },
      { id: "miko-arm", kind: "arm", characterId: "miko", visible: true, delta: 0.04 },
      { id: "garden-bg", kind: "background", visible: true, delta: 0.003 }
    ]
  }));
  const actionFrames: CartoonMotionFrameSample[] = Array.from({ length: 4 }, (_, index) => {
    const frame = index + 4;
    return {
      frame,
      time: frame / 30,
      frameHash: `action-${frame}`,
      globalDelta: 0.01,
      regions: [
        { id: "luma-arm", kind: "arm", characterId: "luma", visible: true, delta: 0.08 },
        { id: "luma-leg", kind: "leg", characterId: "luma", visible: true, delta: 0.05 },
        { id: "weed-prop", kind: "prop", visible: true, delta: 0.06 },
        { id: "garden-bg", kind: "background", visible: true, delta: 0.004 }
      ]
    };
  });
  return [...dialogueFrames, ...actionFrames];
}
