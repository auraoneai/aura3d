import type { Vec3Like } from "./AudioListener";

export type FootId = "left" | "right";

export interface FootPlantEvent {
  readonly foot: FootId;
  readonly surface: string;
  readonly position?: Vec3Like;
  readonly speed?: number;
}

export interface FootstepEvidence {
  readonly kind: "footstep-evidence";
  readonly plantCount: number;
  readonly lastCue: string | null;
  readonly lastSurface: string | null;
  readonly surfaceCount: number;
}

export interface FootstepPlayerOptions {
  readonly surfaces?: Readonly<Record<string, readonly string[]>>;
  readonly fallback?: string;
}

/**
 * Surface-tagged footstep hooks. Routes map foot-IK plant events (E2) to cue ids
 * through `onPlant`; selection round-robins per surface so repeated steps on one
 * material do not machine-gun the same sample. This class owns selection and
 * telemetry only — actually sounding the cue stays with `GameAudio`, which knows
 * buses, mute, and unlock.
 */
export class FootstepPlayer {
  private readonly surfaces = new Map<string, readonly string[]>();
  private readonly cursor = new Map<string, number>();
  private fallbackRef: string | undefined;
  private plantCount = 0;
  private lastCue: string | null = null;
  private lastSurface: string | null = null;

  constructor(options: FootstepPlayerOptions = {}) {
    for (const [surface, cues] of Object.entries(options.surfaces ?? {})) {
      this.registerSurface(surface, cues);
    }
    this.fallbackRef = options.fallback;
  }

  registerSurface(surface: string, cueIds: readonly string[]): void {
    if (cueIds.length === 0) throw new Error(`Footstep surface "${surface}" needs at least one cue id.`);
    this.surfaces.set(surface, [...cueIds]);
    this.cursor.set(surface, 0);
  }

  unregisterSurface(surface: string): boolean {
    this.cursor.delete(surface);
    return this.surfaces.delete(surface);
  }

  setFallback(cueId: string | undefined): void {
    this.fallbackRef = cueId;
  }

  surfaceNames(): readonly string[] {
    return [...this.surfaces.keys()];
  }

  /**
   * Select the cue id for a plant event, or null when no surface or fallback cue
   * is registered. Never throws on unknown surfaces — a missing footstep mapping
   * is a content gap, not a runtime fault.
   */
  onPlant(event: FootPlantEvent): string | null {
    const cues = this.surfaces.get(event.surface);
    let selected: string | undefined;
    let surfaceKey = event.surface;
    if (cues && cues.length > 0) {
      const index = this.cursor.get(event.surface) ?? 0;
      selected = cues[index % cues.length];
      this.cursor.set(event.surface, index + 1);
    } else if (this.fallbackRef !== undefined) {
      selected = this.fallbackRef;
      surfaceKey = `${event.surface} (fallback)`;
    } else {
      return null;
    }
    this.plantCount += 1;
    this.lastCue = selected ?? null;
    this.lastSurface = surfaceKey;
    return selected ?? null;
  }

  evidence(): FootstepEvidence {
    return {
      kind: "footstep-evidence",
      plantCount: this.plantCount,
      lastCue: this.lastCue,
      lastSurface: this.lastSurface,
      surfaceCount: this.surfaces.size
    };
  }
}
