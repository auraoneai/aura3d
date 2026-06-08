export type AnimationPlaybackDirection = 1 | -1;

export type AnimationClipEventType =
  | "marker"
  | "hitbox"
  | "hurtbox"
  | "footstep"
  | "sfx"
  | "vfx"
  | "camera"
  | "state"
  | "custom"
  | (string & {});

export interface AnimationClipEvent<TName extends string = string, TPayload = unknown> {
  readonly id?: string;
  readonly name: TName;
  readonly type?: AnimationClipEventType;
  readonly time: number;
  readonly duration?: number;
  readonly payload?: TPayload;
  readonly once?: boolean;
  readonly tags?: readonly string[];
}

export interface AnimationClipEventSource<TEvent extends AnimationClipEvent = AnimationClipEvent> {
  readonly id: string;
  readonly duration: number;
  readonly events?: readonly TEvent[];
}

export interface AnimationClipEventSamplingOptions {
  readonly from: number;
  readonly to: number;
  readonly duration?: number;
  readonly loop?: boolean;
  readonly direction?: AnimationPlaybackDirection;
  readonly includeStart?: boolean;
  readonly includeEnd?: boolean;
  readonly loopCount?: number;
  readonly playbackTime?: number;
}

export interface AnimationClipEventInvocation<
  TEvent extends AnimationClipEvent = AnimationClipEvent,
  TClipId extends string = string
> {
  readonly clipId: TClipId;
  readonly event: TEvent;
  readonly time: number;
  readonly previousTime: number;
  readonly localTime: number;
  readonly normalizedTime: number;
  readonly loopCount: number;
  readonly direction: AnimationPlaybackDirection;
  readonly playbackTime?: number;
}

export type AnimationClipEventListener<TPayload> = (payload: TPayload) => void;
export type AnimationClipEventUnsubscribe = () => void;

export class AnimationEventDispatcher<TEventMap = Record<string, unknown>> {
  private readonly listeners = new Map<string, Set<AnimationClipEventListener<unknown>>>();

  on<K extends Extract<keyof TEventMap, string>>(
    type: K,
    listener: AnimationClipEventListener<TEventMap[K]>
  ): AnimationClipEventUnsubscribe {
    const listeners = this.listeners.get(type) ?? new Set<AnimationClipEventListener<unknown>>();
    listeners.add(listener as AnimationClipEventListener<unknown>);
    this.listeners.set(type, listeners);

    return () => {
      this.off(type, listener);
    };
  }

  once<K extends Extract<keyof TEventMap, string>>(
    type: K,
    listener: AnimationClipEventListener<TEventMap[K]>
  ): AnimationClipEventUnsubscribe {
    const unsubscribe = this.on(type, (payload) => {
      unsubscribe();
      listener(payload);
    });

    return unsubscribe;
  }

  off<K extends Extract<keyof TEventMap, string>>(
    type: K,
    listener: AnimationClipEventListener<TEventMap[K]>
  ): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;

    listeners.delete(listener as AnimationClipEventListener<unknown>);
    if (listeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  emit<K extends Extract<keyof TEventMap, string>>(type: K, payload: TEventMap[K]): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;

    for (const listener of [...listeners]) {
      listener(payload);
    }
  }

  clear(type?: Extract<keyof TEventMap, string>): void {
    if (type) {
      this.listeners.delete(type);
      return;
    }

    this.listeners.clear();
  }

  listenerCount(type?: Extract<keyof TEventMap, string>): number {
    if (type) {
      return this.listeners.get(type)?.size ?? 0;
    }

    let count = 0;
    for (const listeners of this.listeners.values()) {
      count += listeners.size;
    }

    return count;
  }
}

export function createAnimationClipEvent<TName extends string, TPayload = unknown>(
  name: TName,
  time: number,
  options: Omit<AnimationClipEvent<TName, TPayload>, "name" | "time"> = {}
): AnimationClipEvent<TName, TPayload> {
  return {
    ...options,
    name,
    time
  };
}

export function normalizeClipEvents<TEvent extends AnimationClipEvent>(
  events: readonly TEvent[] = []
): readonly TEvent[] {
  return [...events].sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.name.localeCompare(b.name);
  });
}

export function animationClipEventKey(
  clipId: string,
  event: AnimationClipEvent
): string {
  return `${clipId}:${event.id ?? event.name}:${event.type ?? "marker"}:${event.time}`;
}

export function sampleClipEvents<TEvent extends AnimationClipEvent, TClipId extends string = string>(
  source: AnimationClipEventSource<TEvent> & { readonly id: TClipId },
  options: AnimationClipEventSamplingOptions
): AnimationClipEventInvocation<TEvent, TClipId>[] {
  const events = normalizeClipEvents(source.events);
  if (events.length === 0) return [];

  const duration = sanitizeDuration(options.duration ?? source.duration);
  const direction = options.direction ?? (options.to >= options.from ? 1 : -1);
  const includeStart = options.includeStart ?? false;
  const includeEnd = options.includeEnd ?? true;
  const loopCount = options.loopCount ?? 0;
  const playbackTime = options.playbackTime;

  if (duration === 0) {
    return events
      .filter((event) => event.time === 0 && includesBoundary(includeStart, includeEnd))
      .map((event) => createInvocation(source.id, event, options.from, 0, duration, loopCount, direction, playbackTime));
  }

  const from = normalizeLocalTime(options.from, duration, options.loop ?? false);
  const to = normalizeLocalTime(options.to, duration, options.loop ?? false);
  const segments = createSamplingSegments(from, to, duration, options.loop ?? false, direction);
  const invocations: AnimationClipEventInvocation<TEvent, TClipId>[] = [];

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    const segmentIncludeStart = segmentIndex === 0 ? includeStart : true;
    const segmentIncludeEnd = segmentIndex === segments.length - 1 ? includeEnd : true;
    const matching = events.filter((event) =>
      eventInSegment(event.time, segment.start, segment.end, segmentIncludeStart, segmentIncludeEnd)
    );

    if (direction === -1) {
      matching.reverse();
    }

    for (const event of matching) {
      invocations.push(
        createInvocation(
          source.id,
          event,
          options.from,
          event.time,
          duration,
          loopCount + segment.loopOffset,
          direction,
          playbackTime
        )
      );
    }
  }

  return invocations;
}

interface SamplingSegment {
  readonly start: number;
  readonly end: number;
  readonly loopOffset: number;
}

function createSamplingSegments(
  from: number,
  to: number,
  duration: number,
  loop: boolean,
  direction: AnimationPlaybackDirection
): SamplingSegment[] {
  if (!loop) {
    return [
      {
        start: Math.min(from, to),
        end: Math.max(from, to),
        loopOffset: 0
      }
    ];
  }

  if (direction === 1) {
    if (to >= from) {
      return [{ start: from, end: to, loopOffset: 0 }];
    }

    return [
      { start: from, end: duration, loopOffset: 0 },
      { start: 0, end: to, loopOffset: 1 }
    ];
  }

  if (to <= from) {
    return [{ start: to, end: from, loopOffset: 0 }];
  }

  return [
    { start: 0, end: from, loopOffset: 0 },
    { start: to, end: duration, loopOffset: 1 }
  ];
}

function createInvocation<TEvent extends AnimationClipEvent, TClipId extends string>(
  clipId: TClipId,
  event: TEvent,
  previousTime: number,
  localTime: number,
  duration: number,
  loopCount: number,
  direction: AnimationPlaybackDirection,
  playbackTime?: number
): AnimationClipEventInvocation<TEvent, TClipId> {
  return {
    clipId,
    event,
    time: event.time,
    previousTime,
    localTime,
    normalizedTime: duration > 0 ? event.time / duration : 0,
    loopCount,
    direction,
    playbackTime
  };
}

function eventInSegment(
  time: number,
  start: number,
  end: number,
  includeStart: boolean,
  includeEnd: boolean
): boolean {
  const startsAfter = includeStart ? time >= start : time > start;
  const endsBefore = includeEnd ? time <= end : time < end;
  return startsAfter && endsBefore;
}

function includesBoundary(includeStart: boolean, includeEnd: boolean): boolean {
  return includeStart || includeEnd;
}

function normalizeLocalTime(time: number, duration: number, loop: boolean): number {
  if (!Number.isFinite(time)) return 0;
  if (!loop) return clamp(time, 0, duration);
  return positiveModulo(time, duration);
}

function sanitizeDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return duration;
}

function positiveModulo(value: number, divisor: number): number {
  if (divisor <= 0) return 0;
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---- event tracks (authoring container on top of the existing dispatcher/sampler) -------------
//
// An event *track* is a named lane of typed markers on a clip's timeline (e.g. a "hitbox" lane, a
// "footstep" lane, a "vfx" lane). This adds the authoring + active-frame layer the editor and
// gameplay need WITHOUT rebuilding the dispatcher/sampler above: `toEventSource()` flattens the
// tracks back into the `AnimationClipEventSource` that `sampleClipEvents` already consumes.

export interface AnimationEventTrack<TEvent extends AnimationClipEvent = AnimationClipEvent> {
  readonly name: string;
  readonly type: AnimationClipEventType;
  readonly markers: readonly TEvent[];
}

export interface SerializedAnimationEventTracks<TEvent extends AnimationClipEvent = AnimationClipEvent> {
  readonly schema: "animation-event-tracks/v1";
  readonly clipId: string;
  readonly duration: number;
  readonly tracks: readonly AnimationEventTrack<TEvent>[];
}

export interface ActiveWindow {
  readonly start: number;
  readonly end: number;
}

export interface AddMarkerOptions<TPayload = unknown> {
  readonly id?: string;
  readonly type?: AnimationClipEventType;
  /** Window length (seconds). >0 makes this an active-frame marker (e.g. hitbox on/off). */
  readonly duration?: number;
  readonly payload?: TPayload;
  readonly once?: boolean;
  readonly tags?: readonly string[];
}

/**
 * Authoring container for clip event tracks: add/move/delete typed markers on named lanes, query
 * active-frame windows, flatten to the existing `AnimationClipEventSource`, and serialize. Pure and
 * deterministic — marker ids are assigned from a monotonic counter (no `Date.now`/`Math.random`).
 */
export class AnimationEventTrackContainer {
  readonly clipId: string;
  duration: number;
  private readonly trackOrder: string[] = [];
  private readonly trackMap = new Map<string, { type: AnimationClipEventType; markers: AnimationClipEvent[] }>();
  private idCounter = 0;

  constructor(clipId: string, duration: number) {
    if (!Number.isFinite(duration) || duration < 0) {
      throw new Error("Event-track clip duration must be a finite, non-negative number.");
    }
    this.clipId = clipId;
    this.duration = duration;
  }

  addTrack(name: string, type: AnimationClipEventType = "marker"): this {
    if (!this.trackMap.has(name)) {
      this.trackMap.set(name, { type, markers: [] });
      this.trackOrder.push(name);
    }
    return this;
  }

  removeTrack(name: string): this {
    if (this.trackMap.delete(name)) {
      this.trackOrder.splice(this.trackOrder.indexOf(name), 1);
    }
    return this;
  }

  /** Add a marker to a track (auto-creates the track). Returns the marker id. */
  addMarker(trackName: string, time: number, options: AddMarkerOptions = {}): string {
    if (!Number.isFinite(time) || time < 0) {
      throw new Error("Event marker time must be a finite, non-negative number.");
    }
    this.addTrack(trackName, options.type);
    const track = this.trackMap.get(trackName)!;
    const id = options.id ?? `${trackName}#${this.idCounter++}`;
    const marker: AnimationClipEvent = {
      id,
      name: trackName,
      type: options.type ?? track.type,
      time,
      ...(options.duration !== undefined ? { duration: options.duration } : {}),
      ...(options.payload !== undefined ? { payload: options.payload } : {}),
      ...(options.once !== undefined ? { once: options.once } : {}),
      ...(options.tags !== undefined ? { tags: options.tags } : {})
    };
    track.markers.push(marker);
    track.markers.sort((a, b) => a.time - b.time);
    return id;
  }

  moveMarker(trackName: string, markerId: string, time: number): this {
    if (!Number.isFinite(time) || time < 0) {
      throw new Error("Event marker time must be a finite, non-negative number.");
    }
    const track = this.trackMap.get(trackName);
    const index = track?.markers.findIndex((m) => m.id === markerId) ?? -1;
    if (!track || index < 0) throw new Error(`Marker ${markerId} not found on track ${trackName}.`);
    track.markers[index] = { ...track.markers[index]!, time };
    track.markers.sort((a, b) => a.time - b.time);
    return this;
  }

  removeMarker(trackName: string, markerId: string): this {
    const track = this.trackMap.get(trackName);
    if (!track) return this;
    const index = track.markers.findIndex((m) => m.id === markerId);
    if (index >= 0) track.markers.splice(index, 1);
    return this;
  }

  track(name: string): AnimationEventTrack | undefined {
    const track = this.trackMap.get(name);
    return track ? { name, type: track.type, markers: [...track.markers] } : undefined;
  }

  tracks(): readonly AnimationEventTrack[] {
    return this.trackOrder.map((name) => this.track(name)!);
  }

  markerCount(): number {
    let count = 0;
    for (const track of this.trackMap.values()) count += track.markers.length;
    return count;
  }

  /** Flatten every track's markers into the source shape `sampleClipEvents` consumes. */
  toEventSource(): AnimationClipEventSource {
    const events: AnimationClipEvent[] = [];
    for (const name of this.trackOrder) events.push(...this.trackMap.get(name)!.markers);
    return { id: this.clipId, duration: this.duration, events: normalizeClipEvents(events) };
  }

  /** Active-frame windows for a track: [time, time+duration] for each marker with a duration. */
  activeWindows(trackName: string): readonly ActiveWindow[] {
    const track = this.trackMap.get(trackName);
    if (!track) return [];
    return track.markers
      .filter((m) => (m.duration ?? 0) > 0)
      .map((m) => ({ start: m.time, end: m.time + (m.duration ?? 0) }));
  }

  /** Whether any active-frame window on a track is open at `time` (hitbox live). */
  isActive(trackName: string, time: number): boolean {
    return this.activeWindows(trackName).some((w) => time >= w.start && time < w.end);
  }

  serialize(): SerializedAnimationEventTracks {
    return {
      schema: "animation-event-tracks/v1",
      clipId: this.clipId,
      duration: this.duration,
      tracks: this.tracks()
    };
  }
}

export function createAnimationEventTracks(clipId: string, duration: number): AnimationEventTrackContainer {
  return new AnimationEventTrackContainer(clipId, duration);
}

export function deserializeAnimationEventTracks(data: SerializedAnimationEventTracks): AnimationEventTrackContainer {
  const container = new AnimationEventTrackContainer(data.clipId, data.duration);
  for (const track of data.tracks) {
    container.addTrack(track.name, track.type);
    for (const marker of track.markers) {
      container.addMarker(track.name, marker.time, {
        id: marker.id,
        type: marker.type,
        ...(marker.duration !== undefined ? { duration: marker.duration } : {}),
        ...(marker.payload !== undefined ? { payload: marker.payload } : {}),
        ...(marker.once !== undefined ? { once: marker.once } : {}),
        ...(marker.tags !== undefined ? { tags: marker.tags } : {})
      });
    }
  }
  return container;
}
