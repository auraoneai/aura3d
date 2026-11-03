export type AnimationEventMarker = {
  readonly name: string;
  readonly time: number;
  readonly payload?: unknown;
};

export type AnimationEvent = AnimationEventMarker & {
  readonly clipName: string;
  /** Direction of clip-local motion when this marker was reached. */
  readonly direction: 1 | -1;
  /** Number of boundaries already traversed before this occurrence. */
  readonly loopCount: number;
};

export const DEFAULT_MAX_ANIMATION_EVENTS = 1024;
/** Hard ceiling on marker callback allocation in one action update. */
export const MAX_ANIMATION_EVENT_CATCH_UP = 65536;

export type AnimationEventTraversal = {
  readonly events: readonly AnimationEvent[];
  /** Number of occurrences omitted after the configured limit (possibly Infinity). */
  readonly overflow: number;
};

type TraversalMode = "once" | "repeat" | "pingpong";
type EventStream = {
  readonly marker: AnimationEventMarker;
  readonly offset: number;
  readonly period: number;
  readonly order: number;
  readonly direction: 1 | -1;
  readonly sequence: number;
  current: number;
  remaining: number;
};

/**
 * Collect marker occurrences along an unwrapped playback phase. Traversal is
 * departure-exclusive and arrival-inclusive. Repeat seams deliver both end
 * markers in travel order; a terminating seam does not enter the next cycle.
 * Reflections deliver their endpoint once. `overflow` reports omitted events,
 * so a long or hostile step cannot make callback work unbounded.
 */
export function collectAnimationEvents(
  markers: readonly AnimationEventMarker[],
  clipName: string,
  from: number,
  to: number,
  duration: number,
  mode: TraversalMode,
  loopCount = 0,
  maxEvents = DEFAULT_MAX_ANIMATION_EVENTS,
  terminal = false
): AnimationEventTraversal {
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 0 || maxEvents > MAX_ANIMATION_EVENT_CATCH_UP) {
    throw new Error(`Animation event catch-up limit must be an integer from 0 to ${MAX_ANIMATION_EVENT_CATCH_UP}.`);
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(duration) || duration < 0) {
    throw new Error("Animation event traversal requires finite times and a non-negative duration.");
  }
  if (mode !== "once" && mode !== "repeat" && mode !== "pingpong") throw new Error("Animation event traversal received an unknown loop mode.");
  if (!Number.isSafeInteger(loopCount) || loopCount < 0) throw new Error("Animation event traversal loop count must be a non-negative safe integer.");
  if (markers.some(marker => !Number.isFinite(marker.time) || marker.time < 0 || marker.time > duration)) {
    throw new Error("Animation event marker time must be finite and within the clip duration.");
  }
  if (duration <= 0 || from === to || markers.length === 0) return { events: [], overflow: 0 };
  const forward = to > from;
  const streams: EventStream[] = [];
  let total = 0;

  const addStream = (marker: AnimationEventMarker, offset: number, period: number, direction: 1 | -1, order: number): void => {
    let first: number;
    let last: number;
    if (forward) {
      // When seeking to the end then starting forward, the seam is entered at
      // the departure point. The end marker itself is still excluded there.
      const includeDeparture = mode === "repeat" && marker.time === 0 && from === duration;
      first = includeDeparture ? Math.ceil((from - offset) / period) : Math.floor((from - offset) / period) + 1;
      const excludeTerminal = terminal && mode === "repeat" && marker.time === 0;
      last = excludeTerminal ? Math.ceil((to - offset) / period) - 1 : Math.floor((to - offset) / period);
    } else {
      // In reverse the zero marker is reached at the seam; the duration marker
      // belongs to entering the previous cycle, which occurs on departure.
      const seamEntry = mode === "repeat" && marker.time === duration;
      first = seamEntry ? Math.floor((to - offset) / period) + 1 : Math.ceil((to - offset) / period);
      last = seamEntry && from !== duration
        ? Math.floor((from - offset) / period)
        : Math.ceil((from - offset) / period) - 1;
    }
    const count = Math.max(0, last - first + 1);
    if (count === 0 || Number.isNaN(count)) return;
    total += count;
    streams.push({ marker, offset, period, order, direction, sequence: streams.length, current: forward ? first : last, remaining: count });
  };

  // Code-unit order avoids locale-dependent marker ordering for equal times.
  const sorted = [...markers].sort((a, b) => a.time - b.time || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (mode === "once") {
    for (let index = 0; index < sorted.length; index++) {
      const marker = sorted[index]!;
      if (forward ? marker.time > from && marker.time <= to : marker.time < from && marker.time >= to) {
        // A non-periodic stream has just one occurrence.
        streams.push({ marker, offset: marker.time, period: 0, order: index, direction: forward ? 1 : -1, sequence: streams.length, current: 0, remaining: 1 });
        total++;
      }
    }
  } else if (mode === "repeat") {
    for (let index = 0; index < sorted.length; index++) {
      const marker = sorted[index]!;
      // At a seam: forward end precedes start; reverse start precedes end.
      const seamOrder = marker.time === duration ? (forward ? -1 : 1) : marker.time === 0 ? (forward ? 1 : -1) : 0;
      addStream(marker, marker.time, duration, forward ? 1 : -1, seamOrder * (sorted.length + 1) + index);
    }
  } else {
    const period = duration * 2;
    for (let index = 0; index < sorted.length; index++) {
      const marker = sorted[index]!;
      if (marker.time === 0) addStream(marker, 0, period, -1, index);
      else if (marker.time === duration) addStream(marker, duration, period, 1, index);
      else {
        addStream(marker, marker.time, period, forward ? 1 : -1, index);
        addStream(marker, period - marker.time, period, forward ? -1 : 1, index);
      }
    }
  }

  // A priority queue prevents a large marker set from turning bounded catch-up
  // into markerCount × limit work. Equal-time markers retain authored order.
  const phaseOf = (stream: EventStream): number => stream.offset + stream.current * stream.period;
  const precedes = (a: EventStream, b: EventStream): boolean => {
    const aPhase = phaseOf(a), bPhase = phaseOf(b);
    if (aPhase !== bPhase) return forward ? aPhase < bPhase : aPhase > bPhase;
    return a.order !== b.order ? a.order < b.order : a.sequence < b.sequence;
  };
  const siftDown = (root: number): void => {
    while (root * 2 + 1 < streams.length) {
      let child = root * 2 + 1;
      if (child + 1 < streams.length && precedes(streams[child + 1]!, streams[child]!)) child++;
      if (!precedes(streams[child]!, streams[root]!)) return;
      [streams[root], streams[child]] = [streams[child]!, streams[root]!];
      root = child;
    }
  };
  for (let index = Math.floor(streams.length / 2) - 1; index >= 0; index--) siftDown(index);
  const events: AnimationEvent[] = [];
  while (events.length < maxEvents && streams.length > 0) {
    const stream = streams[0]!;
    const phase = phaseOf(stream);
    let preceding = 0;
    if (mode !== "once") {
      preceding = forward
        ? Math.ceil(phase / duration) - Math.floor(from / duration) - 1
        : Math.ceil(from / duration) - Math.floor(phase / duration) - 1;
      preceding = Math.max(0, preceding);
      if (mode === "repeat") {
        if (forward && from === duration && phase > from) preceding++;
        if (!forward && from === 0 && phase < 0) preceding++;
        if ((forward && stream.marker.time === 0) || (!forward && stream.marker.time === duration)) preceding++;
      }
    }
    events.push({ ...stream.marker, clipName, direction: stream.direction, loopCount: loopCount + preceding });
    stream.current += forward ? 1 : -1;
    stream.remaining--;
    if (stream.remaining === 0) {
      const last = streams.pop()!;
      if (streams.length > 0) streams[0] = last;
    }
    if (streams.length > 0) siftDown(0);
  }
  // A JavaScript number cannot represent an exact count beyond 2^53 - 1.
  // Report an unrepresentable count as Infinity instead of false precision.
  return { events, overflow: Number.isSafeInteger(total) ? Math.max(0, total - events.length) : Infinity };
}

/** Compatibility helper for one non-reflected interval or repeat seam. */
export function eventsBetween(markers: readonly AnimationEventMarker[], clipName: string, fromTime: number, toTime: number, duration: number, looped: boolean, forward = true): readonly AnimationEvent[] {
  const to = looped ? toTime + (forward ? duration : -duration) : toTime;
  const result = collectAnimationEvents(markers, clipName, fromTime, to, duration, looped ? "repeat" : "once", 0, Math.min(MAX_ANIMATION_EVENT_CATCH_UP, markers.length * 2));
  if (result.overflow > 0) throw new Error("eventsBetween: event catch-up limit exceeded; use collectAnimationEvents to inspect overflow.");
  return result.events;
}
