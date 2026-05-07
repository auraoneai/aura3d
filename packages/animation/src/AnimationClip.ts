import type { AnimationEventMarker } from "./AnimationEvents.js";
import { AnimationTrack, type SerializedAnimationTrack } from "./AnimationTrack.js";

export type AnimationClipDescriptor = {
  readonly name: string;
  readonly duration?: number;
  readonly tracks: readonly AnimationTrack[];
  readonly events?: readonly AnimationEventMarker[];
};

export type SerializedAnimationClip = {
  readonly name: string;
  readonly duration: number;
  readonly tracks: readonly SerializedAnimationTrack[];
  readonly events: readonly AnimationEventMarker[];
};

export class AnimationClip {
  readonly name: string;
  readonly tracks: readonly AnimationTrack[];
  readonly events: readonly AnimationEventMarker[];
  readonly duration: number;

  constructor(descriptor: AnimationClipDescriptor) {
    if (descriptor.name.trim().length === 0) {
      throw new Error("AnimationClip name cannot be empty.");
    }
    this.name = descriptor.name;
    this.tracks = [...descriptor.tracks];
    this.events = [...(descriptor.events ?? [])].sort((a, b) => a.time - b.time || a.name.localeCompare(b.name));
    const trackDuration = this.tracks.reduce((duration, track) => Math.max(duration, track.duration), 0);
    this.duration = descriptor.duration ?? trackDuration;
    if (!Number.isFinite(this.duration) || this.duration < 0) {
      throw new Error("AnimationClip duration must be finite and non-negative.");
    }
    if (this.duration < trackDuration) {
      throw new Error("AnimationClip duration cannot be shorter than its tracks.");
    }
    for (const event of this.events) {
      if (!Number.isFinite(event.time) || event.time < 0 || event.time > this.duration) {
        throw new Error(`Animation event ${event.name} is outside clip duration.`);
      }
    }
  }

  toJSON(): SerializedAnimationClip {
    return {
      name: this.name,
      duration: this.duration,
      tracks: this.tracks.map((track) => track.toJSON()),
      events: this.events.map((event) => ({ ...event }))
    };
  }

  static fromJSON(serialized: SerializedAnimationClip): AnimationClip {
    return new AnimationClip({
      name: serialized.name,
      duration: serialized.duration,
      tracks: serialized.tracks.map((track) => AnimationTrack.fromJSON(track)),
      events: serialized.events
    });
  }
}
