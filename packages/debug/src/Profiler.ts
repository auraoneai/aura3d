export interface ProfilerMarker {
  readonly name: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly depth: number;
}

export interface ProfilerSnapshot {
  readonly markerCount: number;
  readonly totalDurationMs: number;
  readonly markers: readonly ProfilerMarker[];
}

interface ActiveMarker {
  readonly name: string;
  readonly startMs: number;
  readonly depth: number;
}

export class Profiler {
  private readonly active: ActiveMarker[] = [];
  private readonly markers: ProfilerMarker[] = [];

  constructor(private readonly now: () => number = () => performance.now()) {}

  begin(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error("Profiler marker name is required");
    }
    this.active.push({ name: trimmed, startMs: this.now(), depth: this.active.length });
  }

  end(name?: string): ProfilerMarker {
    const active = this.active.pop();
    if (!active) {
      throw new Error("Cannot end profiler marker because no marker is active");
    }
    if (name !== undefined && active.name !== name) {
      throw new Error(`Profiler marker mismatch: expected ${active.name}, received ${name}`);
    }
    const endMs = this.now();
    const marker: ProfilerMarker = {
      name: active.name,
      startMs: active.startMs,
      endMs,
      durationMs: endMs - active.startMs,
      depth: active.depth
    };
    this.markers.push(marker);
    return marker;
  }

  measure<T>(name: string, fn: () => T): T {
    this.begin(name);
    try {
      return fn();
    } finally {
      this.end(name);
    }
  }

  snapshot(): ProfilerSnapshot {
    const markers = [...this.markers];
    return Object.freeze({
      markerCount: markers.length,
      totalDurationMs: markers.reduce((total, marker) => total + marker.durationMs, 0),
      markers
    });
  }

  reset(): void {
    this.active.length = 0;
    this.markers.length = 0;
  }
}
