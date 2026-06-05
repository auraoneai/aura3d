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
