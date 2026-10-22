export type AnimationEventMarker = {
  readonly name: string;
  readonly time: number;
  readonly payload?: unknown;
};

export type AnimationEvent = AnimationEventMarker & {
  readonly clipName: string;
};

export function eventsBetween(markers: readonly AnimationEventMarker[], clipName: string, fromTime: number, toTime: number, duration: number, looped: boolean, forward = true): readonly AnimationEvent[] {
  const events: AnimationEvent[] = [];
  if (duration <= 0) {
    return events;
  }
  if (forward) {
    if (!looped) {
      for (const marker of markers) {
        if (marker.time > fromTime && marker.time <= toTime) {
          events.push({ ...marker, clipName });
        }
      }
      return events;
    }
    const lateEvents: AnimationEvent[] = [];
    const earlyEvents: AnimationEvent[] = [];
    for (const marker of markers) {
      if (marker.time > fromTime && marker.time <= duration) {
        lateEvents.push({ ...marker, clipName });
      } else if (marker.time >= 0 && marker.time <= toTime) {
        earlyEvents.push({ ...marker, clipName });
      }
    }
    return [...lateEvents, ...earlyEvents];
  }
  // Reverse playback (negative timeScale): markers are emitted in the order
  // they are crossed, i.e. descending clip time. A looped wrap crosses from
  // `fromTime` down to 0 and continues from `duration` down to `toTime`.
  if (!looped) {
    const crossed = markers.filter((marker) => marker.time <= fromTime && marker.time > toTime);
    crossed.sort((a, b) => b.time - a.time);
    return crossed.map((marker) => ({ ...marker, clipName }));
  }
  const lateEvents: AnimationEvent[] = markers
    .filter((marker) => marker.time <= fromTime && marker.time >= 0)
    .sort((a, b) => b.time - a.time)
    .map((marker) => ({ ...marker, clipName }));
  const earlyEvents: AnimationEvent[] = markers
    .filter((marker) => marker.time <= duration && marker.time > toTime)
    .sort((a, b) => b.time - a.time)
    .map((marker) => ({ ...marker, clipName }));
  return [...lateEvents, ...earlyEvents];
}
