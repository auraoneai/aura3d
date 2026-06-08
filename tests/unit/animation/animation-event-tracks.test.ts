import { describe, expect, it } from "vitest";
import {
  createAnimationEventTracks,
  deserializeAnimationEventTracks,
  sampleClipEvents
} from "../../../packages/animation/src";
import { createEventTrackEditor } from "../../../packages/editor-runtime/src";

describe("AnimationEventTrackContainer", () => {
  it("authors add / move / delete markers on named lanes", () => {
    const tracks = createAnimationEventTracks("light", 0.34);
    const hit = tracks.addMarker("hitbox", 0.07, { type: "hitbox", duration: 0.2 });
    tracks.addMarker("footstep", 0.03, { type: "footstep" });
    expect(tracks.markerCount()).toBe(2);
    expect(tracks.tracks().map((t) => t.name)).toEqual(["hitbox", "footstep"]);

    tracks.moveMarker("hitbox", hit, 0.1);
    expect(tracks.track("hitbox")!.markers[0]!.time).toBe(0.1);

    tracks.removeMarker("footstep", tracks.track("footstep")!.markers[0]!.id!);
    expect(tracks.markerCount()).toBe(1);
  });

  it("reports active-frame windows that open and close", () => {
    const tracks = createAnimationEventTracks("heavy", 0.46);
    tracks.addMarker("hitbox", 0.1, { type: "hitbox", duration: 0.28 });
    expect(tracks.activeWindows("hitbox")).toEqual([{ start: 0.1, end: expect.closeTo(0.38, 5) }]);
    expect(tracks.isActive("hitbox", 0.05)).toBe(false); // before
    expect(tracks.isActive("hitbox", 0.2)).toBe(true); // during
    expect(tracks.isActive("hitbox", 0.4)).toBe(false); // after
  });

  it("flattens to a source that sampleClipEvents fires once per forward pass", () => {
    const tracks = createAnimationEventTracks("clip", 1);
    tracks.addMarker("footstep", 0.25, { type: "footstep" });
    tracks.addMarker("footstep", 0.75, { type: "footstep" });
    const source = tracks.toEventSource();
    const fired = sampleClipEvents({ ...source, id: "clip" }, { from: 0, to: 1 });
    expect(fired.map((f) => f.event.time)).toEqual([0.25, 0.75]);
    // A sub-window only fires markers inside it.
    const partial = sampleClipEvents({ ...source, id: "clip" }, { from: 0, to: 0.5 });
    expect(partial.map((f) => f.event.time)).toEqual([0.25]);
  });

  it("respects playback direction (reverse fires markers in reverse)", () => {
    const tracks = createAnimationEventTracks("clip", 1);
    tracks.addMarker("m", 0.2);
    tracks.addMarker("m", 0.8);
    const source = tracks.toEventSource();
    const reverse = sampleClipEvents({ ...source, id: "clip" }, { from: 1, to: 0, direction: -1 });
    expect(reverse.map((f) => f.event.time)).toEqual([0.8, 0.2]);
  });

  it("serializes and round-trips through deserialize", () => {
    const tracks = createAnimationEventTracks("special", 0.68);
    tracks.addMarker("hitbox", 0.08, { type: "hitbox", duration: 0.54 });
    tracks.addMarker("vfx", 0.08, { type: "vfx", payload: { effect: "spark" } });
    const serialized = tracks.serialize();
    expect(serialized.schema).toBe("animation-event-tracks/v1");
    const restored = deserializeAnimationEventTracks(serialized);
    expect(restored.serialize()).toEqual(serialized);
  });
});

describe("EventTrackEditor (editor authoring)", () => {
  it("authors markers and produces a lane view-model", () => {
    const editor = createEventTrackEditor({ clipId: "light", duration: 0.34 });
    const id = editor.addMarker("hitbox", 0.07, { type: "hitbox", duration: 0.2 });
    editor.addMarker("footstep", 0.03, { type: "footstep" });
    editor.select(id);
    const lanes = editor.lanes();
    expect(lanes.map((l) => l.name)).toEqual(["hitbox", "footstep"]);
    expect(lanes[0]!.markers[0]!.selected).toBe(true);
    expect(lanes[0]!.markers[0]!.duration).toBe(0.2);

    editor.moveMarker("hitbox", id, 0.12);
    expect(editor.lanes()[0]!.markers[0]!.time).toBe(0.12);
    editor.removeMarker("hitbox", id);
    expect(editor.markerCount()).toBe(1);
  });

  it("serializes to the canonical clip-event shape (round-trips through the animation deserializer)", () => {
    const editor = createEventTrackEditor({ clipId: "heavy", duration: 0.46 });
    editor.addMarker("hitbox", 0.1, { type: "hitbox", duration: 0.28 });
    editor.addMarker("vfx", 0.1, { type: "vfx" });
    const serialized = editor.serialize();
    // The editor output deserializes cleanly into the animation package's container.
    const container = deserializeAnimationEventTracks(serialized);
    expect(container.isActive("hitbox", 0.2)).toBe(true);
    expect(container.markerCount()).toBe(2);
  });
});
