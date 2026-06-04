import { describe, expect, it } from "vitest";
import { compileAuraShotTimeline } from "../../../packages/ai-scene/src/AuraShotTimelineCompiler";
import type { AuraShotSpec } from "../../../packages/ai-scene/src/AuraShotSpec";

describe("compileAuraShotTimeline", () => {
  it("turns concrete shot specs into camera and blocking cues", () => {
    const shots: AuraShotSpec[] = [
      {
        id: "shot_001",
        label: "Robot discovers flower",
        durationSeconds: 12,
        movement: "dolly",
        camera: {
          id: "camera_main",
          lens: "normal",
          focalLengthMm: 42,
          startPosition: [0, 1.2, 4],
          endPosition: [0, 1.1, 2.6],
          target: [0.2, 0.6, 0],
          framing: "medium-hero"
        },
        emotionalBeat: "discovery",
        blockingNotes: "pause-on-discovery"
      }
    ];

    const timeline = compileAuraShotTimeline(shots);
    expect(timeline.durationSeconds).toBe(12);
    expect(timeline.cues).toHaveLength(2);
    expect(timeline.cues[0]).toMatchObject({
      kind: "camera",
      targetId: "camera_main",
      action: "dolly"
    });
    expect(timeline.cues[1]).toMatchObject({
      kind: "object",
      targetId: "hero",
      action: "pause-on-discovery"
    });
  });
});
