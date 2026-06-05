import { describe, expect, it } from "vitest";
import {
  TimelineClip,
  TimelineModel,
  TimelineTrack,
  collectEditorProjectEvidence,
  createTimelineRuntimeBridge,
  parseEditorProject,
  serializeEditorProject
} from "@aura3d/editor-runtime";

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

  it("exposes timeline-to-runtime replay and project evidence helpers through the public editor-runtime package", () => {
    const timeline = new TimelineModel({
      id: "runtime-replay",
      duration: 1,
      tracks: [
        {
          id: "animation",
          name: "Animation",
          type: "animation",
          clips: [{ id: "idle", name: "Idle", startTime: 0, duration: 1, assetId: "fighter", clipName: "Idle", properties: { targetId: "player" } }]
        },
        {
          id: "events",
          name: "Events",
          type: "signal",
          clips: [{ id: "footstep", name: "Footstep", startTime: 0.2, duration: 0.05, properties: { event: "footstep", targetId: "player" } }]
        }
      ]
    });
    const applied: string[] = [];
    const signals: string[] = [];
    const bridge = createTimelineRuntimeBridge({
      timeline,
      targets: [
        {
          id: "player",
          applyTimelineAnimation(application) {
            applied.push(`${application.targetId}:${application.clipName}:${application.assetTime}`);
          },
          applyTimelineSignal(signal) {
            signals.push(`${signal.targetId}:${signal.event}`);
          }
        }
      ]
    });

    const bridgeSnapshot = bridge.applyAt(0.2);
    expect(applied).toEqual(["player:Idle:0.2"]);
    expect(signals).toEqual(["player:footstep"]);
    expect(bridgeSnapshot.evidence).toMatchObject({
      timelineToRuntimeBridge: true,
      deterministicApplyAt: true,
      animationClipBinding: true,
      signalDispatch: true
    });

    const serialized = serializeEditorProject({
      schema: "a3d-editor-project",
      version: 105,
      name: "Public Editor Runtime",
      nodes: [{ id: "player" }],
      assets: [{ id: "fighter", name: "fighter.glb", source: "typed-catalog", license: "CC0", clips: ["Idle"] }],
      timelines: [{ ...timeline.toConfig(), bindings: [{ trackId: "animation", targetId: "player", assetId: "fighter" }] }],
      visualGraphs: [{ id: "graph", name: "Graph", nodes: [{ id: "onFrame" }], edges: [], runtimeBindings: [{ nodeId: "onFrame", targetId: "player" }] }]
    });
    const evidence = collectEditorProjectEvidence(parseEditorProject(serialized));
    expect(evidence).toMatchObject({
      kind: "aura-editor-project-evidence",
      timelineCount: 1,
      visualGraphCount: 1,
      roundTripReady: true
    });
  });
});
