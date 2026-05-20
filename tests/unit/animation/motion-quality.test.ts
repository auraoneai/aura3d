import { describe, expect, it } from "vitest";
import { AnimationMotionQualityTracker, summarizeAnimationMotion } from "../../../packages/animation/src";

describe("AnimationMotionQualityTracker", () => {
  it("reports healthy motion only after enough active, diverse samples", () => {
    const tracker = new AnimationMotionQualityTracker({
      minimumSamples: 3,
      minimumTimeRangeSeconds: 0.1,
      minimumPoseDiversityScore: 0.03
    });

    expect(tracker.record({ timeSeconds: 0, tracksApplied: 12, skinningPalettesUpdated: 1 }).healthy).toBe(false);
    expect(tracker.record({ timeSeconds: 0.08, tracksApplied: 12, skinningPalettesUpdated: 1, stride: 0.02 }).healthy).toBe(false);
    const report = tracker.record({ timeSeconds: 0.18, tracksApplied: 12, skinningPalettesUpdated: 2, stride: 0.12 });

    expect(report).toMatchObject({
      sampleCount: 3,
      activeTrackFrames: 3,
      activeSkinningFrames: 3,
      healthy: true
    });
    expect(report.timeRangeSeconds).toBeGreaterThanOrEqual(0.18);
    expect(report.poseDiversityScore).toBeGreaterThan(0.03);
  });

  it("keeps static samples unhealthy", () => {
    const report = summarizeAnimationMotion([
      { timeSeconds: 0, tracksApplied: 0, skinningPalettesUpdated: 0 },
      { timeSeconds: 0.1, tracksApplied: 0, skinningPalettesUpdated: 0 },
      { timeSeconds: 0.2, tracksApplied: 0, skinningPalettesUpdated: 0 }
    ], {
      minimumSamples: 3,
      minimumTimeRangeSeconds: 0.1,
      minimumPoseDiversityScore: 0.03
    });

    expect(report.healthy).toBe(false);
    expect(report.activeTrackFrames).toBe(0);
    expect(report.activeSkinningFrames).toBe(0);
  });

  it("keeps healthy motion independent from dense frame sampling", () => {
    const denseSamples = Array.from({ length: 180 }, (_, index) => ({
      timeSeconds: index / 120,
      tracksApplied: 12,
      skinningPalettesUpdated: 4
    }));

    const report = summarizeAnimationMotion(denseSamples, {
      minimumSamples: 6,
      minimumTimeRangeSeconds: 0.1,
      minimumPoseDiversityScore: 0.01
    });

    expect(report.timeRangeSeconds).toBeGreaterThan(1);
    expect(report.poseDiversityScore).toBeGreaterThan(1);
    expect(report.healthy).toBe(true);
  });

  it("rejects invalid sample values", () => {
    const tracker = new AnimationMotionQualityTracker();
    expect(() => tracker.record({ timeSeconds: Number.NaN })).toThrow(/timeSeconds/);
    expect(() => tracker.record({ timeSeconds: 0, stride: -1 })).toThrow(/stride/);
  });
});
