// M4 Animation Studio editor harness: a real browser authoring UI wired to the headless
// @aura3d/editor-runtime controllers (TimelineEditorController + CurveEditor) and the
// @aura3d/animation locomotion state graph. Exposes a proof object for the browser test.
import {
  CurveEditor,
  EventTrackEditor,
  KeyframeEditor,
  TimelineClip,
  TimelineEditorController,
  TimelineModel
} from "@aura3d/editor-runtime";
import { createLocomotionAnimationStateGraph, deserializeAnimationEventTracks } from "@aura3d/animation";

interface EditorProof {
  status: "ready" | "error";
  error?: string;
  scrubTime: number;
  playheadLeftPct: number;
  serialized: { trackCount: number; clipCount: number };
  curveSampleAtMid: number;
  curveSampleAfterEdit: number | null;
  graphStates: string[];
}

interface EventTrackProof {
  status: "ready" | "error";
  laneCount: number;
  markerCount: number;
  hitboxWindow: { start: number; end: number } | null;
  hitboxActiveAtMid: boolean;
  serializedSchema: string;
  movedMarkerTime: number | null;
  deletedDown: boolean;
}

declare global {
  interface Window {
    __AURA3D_ANIMATION_STUDIO_EDITOR__?: EditorProof;
    __EVENT_TRACK_PROOF__?: EventTrackProof;
    __auraStudioEditor__?: {
      scrubTo(t: number): void;
      editCurve(): Promise<number>;
      addEventMarker(track: string, time: number): string;
      moveEventMarker(track: string, id: string, time: number): void;
      deleteEventMarker(track: string, id: string): void;
    };
  }
}

async function boot(): Promise<void> {
  const duration = 6;
  const controller = new TimelineEditorController({
    timeline: new TimelineModel({ id: "studio", duration, frameRate: 30, loopMode: "none" }),
    snapInterval: 0.5
  });
  const track = await controller.addTrack("animation", "Character");
  await controller.addClip(track.id, { id: "walk", name: "Walk", startTime: 0.5, duration: 2, clipName: "Walk", properties: { targetId: "hero" } });

  // Curve authoring on a clip (deterministic bezier/linear keyframes).
  const curveClip = new TimelineClip({ id: "curve", name: "Curve", startTime: 0, duration: 2 });
  const keyframes = new KeyframeEditor();
  await keyframes.addKeyframe(curveClip, { id: "x0", propertyPath: "transform.position.x", time: 0, value: 0, interpolation: "linear" });
  await keyframes.addKeyframe(curveClip, { id: "x1", propertyPath: "transform.position.x", time: 2, value: 10, interpolation: "linear" });
  const curve = new CurveEditor(keyframes.commandHistory);

  // State graph row (idle/walk/run).
  const graph = createLocomotionAnimationStateGraph();
  const graphStates = ["idle", "walk", "run"];

  const timelineEl = document.getElementById("timeline")!;
  const playhead = document.getElementById("playhead")!;
  const readout = document.getElementById("curve-readout")!;
  const graphEl = document.getElementById("state-graph")!;

  function renderTimeline(): void {
    // remove old clip blocks
    timelineEl.querySelectorAll(".clip").forEach((el) => el.remove());
    const serialized = controller.serializeTimeline();
    for (const t of serialized.tracks ?? []) {
      for (const clip of t.clips ?? []) {
        const block = document.createElement("div");
        block.className = "clip";
        block.dataset.clipId = clip.id;
        block.style.left = `${((clip.startTime ?? 0) / duration) * 100}%`;
        block.style.width = `${((clip.duration ?? 0) / duration) * 100}%`;
        timelineEl.appendChild(block);
      }
    }
  }

  function renderGraph(activeState: string): void {
    graphEl.innerHTML = "";
    for (const s of graphStates) {
      const chip = document.createElement("span");
      chip.className = `graph-state${s === activeState ? " active" : ""}`;
      chip.textContent = s;
      graphEl.appendChild(chip);
    }
  }

  function updateProof(curveAfterEdit: number | null): void {
    const serialized = controller.serializeTimeline();
    const trackCount = serialized.tracks?.length ?? 0;
    const clipCount = (serialized.tracks ?? []).reduce((sum, t) => sum + (t.clips?.length ?? 0), 0);
    const scrubTime = controller.timeline.currentTime;
    const proof: EditorProof = {
      status: "ready",
      scrubTime,
      playheadLeftPct: (scrubTime / duration) * 100,
      serialized: { trackCount, clipCount },
      curveSampleAtMid: curve.sample(curveClip, "transform.position.x", 1).value,
      curveSampleAfterEdit: curveAfterEdit,
      graphStates
    };
    window.__AURA3D_ANIMATION_STUDIO_EDITOR__ = proof;
  }

  function scrubTo(t: number): void {
    controller.scrubTo(t);
    playhead.style.left = `${(controller.timeline.currentTime / duration) * 100}%`;
    // drive the state graph from a synthetic speed derived from scrub position
    graph.setParameter("isMoving", t > 0.5);
    graph.setParameter("isRunning", t > 3.5);
    renderGraph(graph.update(1 / 30));
    updateProof(window.__AURA3D_ANIMATION_STUDIO_EDITOR__?.curveSampleAfterEdit ?? null);
    readout.textContent = `scrub=${controller.timeline.currentTime}  curve(t=1)=${curve.sample(curveClip, "transform.position.x", 1).value}`;
  }

  async function editCurve(): Promise<number> {
    // Bezier the segment's START keyframe (x0) with a strong outHandle so the x0->x1 segment bends
    // and the sampled midpoint value changes from the linear 5.
    await curve.setBezierHandles(curveClip, "x0", { inHandle: { time: -0.2, value: 0 }, outHandle: { time: 0.6, value: 9 } });
    await curve.setBezierHandles(curveClip, "x1", { inHandle: { time: -0.6, value: 9.8 }, outHandle: { time: 0.2, value: 10 } });
    const after = curve.sample(curveClip, "transform.position.x", 1).value;
    updateProof(after);
    readout.textContent = `edited curve  curve(t=1)=${after}`;
    return after;
  }

  // ---- Event-track authoring lane (T2.2) -----------------------------------------------------
  const clipDuration = 0.46; // a "heavy" attack clip
  const eventEditor = new EventTrackEditor({ clipId: "heavy", duration: clipDuration });
  eventEditor.addMarker("hitbox", 0.1, { type: "hitbox", duration: 0.28 });
  eventEditor.addMarker("footstep", 0.05, { type: "footstep" });
  eventEditor.addMarker("vfx", 0.1, { type: "vfx" });
  const eventTracksEl = document.getElementById("event-tracks")!;

  function renderEventTracks(): void {
    eventTracksEl.innerHTML = "";
    for (const lane of eventEditor.lanes()) {
      const laneEl = document.createElement("div");
      laneEl.className = "event-lane";
      laneEl.dataset.track = lane.name;
      const label = document.createElement("span");
      label.className = "event-lane-label";
      label.textContent = lane.name;
      laneEl.appendChild(label);
      for (const marker of lane.markers) {
        const el = document.createElement("div");
        el.className = `event-marker${(marker.duration ?? 0) > 0 ? " window" : ""}${marker.selected ? " selected" : ""}`;
        el.dataset.markerId = marker.id;
        el.style.left = `${(marker.time / clipDuration) * 100}%`;
        if ((marker.duration ?? 0) > 0) el.style.width = `${((marker.duration ?? 0) / clipDuration) * 100}%`;
        laneEl.appendChild(el);
      }
      eventTracksEl.appendChild(laneEl);
    }
  }

  function updateEventProof(movedMarkerTime: number | null, deletedDown: boolean): void {
    const serialized = eventEditor.serialize();
    // Round-trip through the animation package's deserializer to prove the authored shape is valid.
    const container = deserializeAnimationEventTracks(serialized);
    const window0 = container.activeWindows("hitbox")[0] ?? null;
    window.__EVENT_TRACK_PROOF__ = {
      status: "ready",
      laneCount: serialized.tracks.length,
      markerCount: eventEditor.markerCount(),
      hitboxWindow: window0 ? { start: window0.start, end: window0.end } : null,
      hitboxActiveAtMid: container.isActive("hitbox", 0.2),
      serializedSchema: serialized.schema,
      movedMarkerTime,
      deletedDown
    };
  }

  function addEventMarker(track: string, time: number): string {
    const id = eventEditor.addMarker(track, time, track === "hitbox" ? { type: "hitbox", duration: 0.1 } : {});
    renderEventTracks();
    updateEventProof(window.__EVENT_TRACK_PROOF__?.movedMarkerTime ?? null, window.__EVENT_TRACK_PROOF__?.deletedDown ?? false);
    return id;
  }
  function moveEventMarker(track: string, id: string, time: number): void {
    eventEditor.moveMarker(track, id, time);
    renderEventTracks();
    updateEventProof(time, window.__EVENT_TRACK_PROOF__?.deletedDown ?? false);
  }
  function deleteEventMarker(track: string, id: string): void {
    const before = eventEditor.markerCount();
    eventEditor.removeMarker(track, id);
    renderEventTracks();
    updateEventProof(window.__EVENT_TRACK_PROOF__?.movedMarkerTime ?? null, eventEditor.markerCount() < before);
  }

  window.__auraStudioEditor__ = { scrubTo, editCurve, addEventMarker, moveEventMarker, deleteEventMarker };

  renderTimeline();
  renderEventTracks();
  updateEventProof(null, false);
  scrubTo(0.5);
}

boot().catch((error) => {
  window.__AURA3D_ANIMATION_STUDIO_EDITOR__ = {
    status: "error",
    error: error instanceof Error ? error.message : String(error),
    scrubTime: 0,
    playheadLeftPct: 0,
    serialized: { trackCount: 0, clipCount: 0 },
    curveSampleAtMid: 0,
    curveSampleAfterEdit: null,
    graphStates: []
  };
});
