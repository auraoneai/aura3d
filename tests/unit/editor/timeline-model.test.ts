import { describe, expect, it } from "vitest";
import { TimelineClip, TimelineModel, TimelineTrack } from "@galileo3d/editor-runtime";

describe("editor timeline model", () => {
  it("ports bounded track, clip, easing, loop, lock, mute, and signal evidence", () => {
    const timeline = new TimelineModel({
      id: "timeline-port",
      duration: 2,
      loopMode: "loop",
      speed: 1.5,
      frameRate: 60,
      tracks: [
        {
          id: "animation-track",
          name: "Animation",
          type: "animation",
          clips: [
            {
              id: "run",
              name: "Run",
              startTime: 0,
              duration: 1,
              easeInDuration: 0.5,
              easeIn: "ease-in-out",
              blendMode: "mix",
              weight: 0.8,
              clipInOffset: 0.2
            }
          ]
        },
        {
          id: "signal-track",
          name: "Signals",
          type: "signal",
          locked: true,
          clips: [{ id: "footstep", name: "Footstep", clipName: "footstep", startTime: 0.25, duration: 0.1 }]
        },
        {
          id: "muted-guide",
          name: "Muted Guide",
          type: "audio",
          muted: true,
          clips: [{ id: "beat", name: "Beat", startTime: 0, duration: 2 }]
        }
      ]
    });

    timeline.seek(0.25);
    const snapshot = timeline.snapshot();
    expect(snapshot.activeClipCount).toBe(2);
    expect(snapshot.activeClips.find((clip) => clip.clipId === "run")?.blendWeight).toBe(0.4);
    expect(snapshot.activeClips.find((clip) => clip.clipId === "run")?.assetTime).toBe(0.45);
    expect(snapshot.signalEvents).toEqual(["footstep"]);
    expect(snapshot.evidence).toMatchObject({
      oldCodebasePort: true,
      clipEasing: true,
      clipBlending: true,
      muteLockState: true,
      loopPlayback: true,
      signalMarkers: true
    });

    timeline.play();
    timeline.tick(2);
    expect(timeline.snapshot().time).toBe(1.25);

    const lockedTrack = timeline.tracks.find((track) => track.id === "signal-track") as TimelineTrack | undefined;
    expect(() => lockedTrack?.addClip(new TimelineClip({ name: "Late Signal", startTime: 1, duration: 0.1 }))).toThrow(/locked timeline track/);
  });
});
