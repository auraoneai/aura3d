export type AnimationEventMarker = {
  readonly name: string;
  readonly time: number;
  readonly payload?: unknown;
};

export type AnimationEvent = AnimationEventMarker & {
  readonly clipName: string;
};

export function eventsBetween(markers: readonly AnimationEventMarker[], clipName: string, fromTime: number, toTime: number, duration: number, looped: boolean): readonly AnimationEvent[] {
  const events: AnimationEvent[] = [];
  if (duration <= 0) {
    return events;
  }
  if (!looped || toTime >= fromTime) {
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
