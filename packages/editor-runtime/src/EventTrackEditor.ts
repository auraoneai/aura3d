// Editor authoring controller for animation event tracks (T2.2). Lets a timeline UI add / move /
// delete typed markers on named lanes (hitbox active-frames, footsteps, VFX, generic markers) and
// serialize to the canonical `animation-event-tracks/v1` shape that `@aura3d/animation`'s
// `deserializeAnimationEventTracks` / `sampleClipEvents` consume — so authored tracks drive gameplay
// (hitbox windows) and playback (footstep/VFX triggers) deterministically.
//
// Type-only imports from `@aura3d/animation` keep this controller free of any runtime coupling to
// that package (the types are erased at build time); the serialized output is verified to round-trip
// through the animation package's deserializer in tests.

import type {
  AnimationClipEvent,
  AnimationClipEventType,
  AnimationEventTrack,
  SerializedAnimationEventTracks
} from "@aura3d/animation";

export interface EventMarkerView {
  readonly id: string;
  readonly time: number;
  readonly duration?: number;
  readonly type: AnimationClipEventType;
  readonly selected: boolean;
}

export interface EventTrackLane {
  readonly name: string;
  readonly type: AnimationClipEventType;
  readonly markers: readonly EventMarkerView[];
}

export interface EventTrackEditorOptions {
  readonly clipId: string;
  readonly duration: number;
}

export interface AddEventMarkerOptions {
  readonly id?: string;
  readonly type?: AnimationClipEventType;
  /** Window length (seconds). >0 makes the marker an active-frame window (e.g. hitbox on/off). */
  readonly duration?: number;
  readonly payload?: unknown;
  readonly tags?: readonly string[];
}

interface LaneState {
  type: AnimationClipEventType;
  markers: AnimationClipEvent[];
}

/**
 * Timeline event-track authoring controller. Deterministic: marker ids come from a monotonic
 * counter (no `Date.now`/`Math.random`), so undo/redo and serialization are reproducible.
 */
export class EventTrackEditor {
  readonly clipId: string;
  duration: number;
  private readonly order: string[] = [];
  private readonly lanesMap = new Map<string, LaneState>();
  private selectedId: string | undefined;
  private idCounter = 0;

  constructor(options: EventTrackEditorOptions) {
    if (!Number.isFinite(options.duration) || options.duration < 0) {
      throw new Error("EventTrackEditor duration must be a finite, non-negative number.");
    }
    this.clipId = options.clipId;
    this.duration = options.duration;
  }

  addTrack(name: string, type: AnimationClipEventType = "marker"): this {
    if (!this.lanesMap.has(name)) {
      this.lanesMap.set(name, { type, markers: [] });
      this.order.push(name);
    }
    return this;
  }

  removeTrack(name: string): this {
    if (this.lanesMap.delete(name)) this.order.splice(this.order.indexOf(name), 1);
    return this;
  }

  /** Add a marker to a lane (auto-creates the lane). Returns the new marker id. */
  addMarker(trackName: string, time: number, options: AddEventMarkerOptions = {}): string {
    if (!Number.isFinite(time) || time < 0) {
      throw new Error("Event marker time must be a finite, non-negative number.");
    }
    this.addTrack(trackName, options.type);
    const lane = this.lanesMap.get(trackName)!;
    const id = options.id ?? `${trackName}#${this.idCounter++}`;
    lane.markers.push({
      id,
      name: trackName,
      type: options.type ?? lane.type,
      time,
      ...(options.duration !== undefined ? { duration: options.duration } : {}),
      ...(options.payload !== undefined ? { payload: options.payload } : {}),
      ...(options.tags !== undefined ? { tags: options.tags } : {})
    });
    lane.markers.sort((a, b) => a.time - b.time);
    return id;
  }

  /** Move an existing marker to a new time. */
  moveMarker(trackName: string, markerId: string, time: number): this {
    if (!Number.isFinite(time) || time < 0) {
      throw new Error("Event marker time must be a finite, non-negative number.");
    }
    const lane = this.lanesMap.get(trackName);
    const index = lane?.markers.findIndex((m) => m.id === markerId) ?? -1;
    if (!lane || index < 0) throw new Error(`Marker ${markerId} not found on track ${trackName}.`);
    lane.markers[index] = { ...lane.markers[index]!, time };
    lane.markers.sort((a, b) => a.time - b.time);
    return this;
  }

  /** Delete a marker. */
  removeMarker(trackName: string, markerId: string): this {
    const lane = this.lanesMap.get(trackName);
    if (!lane) return this;
    const index = lane.markers.findIndex((m) => m.id === markerId);
    if (index >= 0) lane.markers.splice(index, 1);
    if (this.selectedId === markerId) this.selectedId = undefined;
    return this;
  }

  select(markerId: string | undefined): this {
    this.selectedId = markerId;
    return this;
  }

  markerCount(): number {
    let count = 0;
    for (const lane of this.lanesMap.values()) count += lane.markers.length;
    return count;
  }

  /** View-model for the timeline UI: lanes with marker positions + selection state. */
  lanes(): readonly EventTrackLane[] {
    return this.order.map((name) => {
      const lane = this.lanesMap.get(name)!;
      return {
        name,
        type: lane.type,
        markers: lane.markers.map((m) => ({
          id: m.id!,
          time: m.time,
          ...(m.duration !== undefined ? { duration: m.duration } : {}),
          type: m.type ?? lane.type,
          selected: m.id === this.selectedId
        }))
      };
    });
  }

  /** Serialize to the canonical `animation-event-tracks/v1` shape. */
  serialize(): SerializedAnimationEventTracks {
    const tracks: AnimationEventTrack[] = this.order.map((name) => {
      const lane = this.lanesMap.get(name)!;
      return { name, type: lane.type, markers: lane.markers.map((m) => ({ ...m })) };
    });
    return { schema: "animation-event-tracks/v1", clipId: this.clipId, duration: this.duration, tracks };
  }
}

export function createEventTrackEditor(options: EventTrackEditorOptions): EventTrackEditor {
  return new EventTrackEditor(options);
}
