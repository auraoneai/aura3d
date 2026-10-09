/**
 * Pulse Tunnel segment conveyor (§14.4) — a fixed pool of tunnel hoops that
 * streams toward the player plane and recycles passed hoops back to the far
 * end. The pool never grows past `liveCount` (the tier's segment budget):
 * recycling reuses entries in place instead of spawning or dropping nodes.
 *
 * Geometry: hoops lie on the +z stream the gates travel (spawn −13.5 →
 * player 1.4 at PULSE_GATE_SPEED); `advance(distance)` adds that distance to
 * every live hoop, then wraps any hoop past `recycleZ` back by one full span
 * (liveCount × segmentLength), so the visible band always covers the tunnel.
 */
export interface ConveyorSegmentTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface PulseConveyorSpec {
  /** Distance between successive hoops along +z. */
  readonly segmentLength: number;
  /** Live hoop budget N — segments are recycled in place, never spawned. */
  readonly liveCount: number;
  /** A hoop past this z (just beyond the player plane) recycles to the far end. */
  readonly recycleZ: number;
  /** Z the first hoop starts at; the span liveCount×segmentLength covers the view. */
  readonly headZ: number;
  /** Hoop centre height and uniform scale (x, y ellipse radii + depth). */
  readonly y: number;
  readonly scale: readonly [number, number, number];
}

export interface PulseConveyor {
  /** Live-bound transform entries for `instances.*` — length === liveCount. */
  readonly segments: readonly ConveyorSegmentTransform[];
  /** Metres the stream has travelled since creation (evidence/beat sync). */
  readonly travelled: number;
  /** Push every hoop +distance along z and recycle past `recycleZ`. */
  advance(distance: number): void;
}

/** §14.4 tier budgets — the route passes the resolved tier's N as liveCount. */
export const PULSE_CONVEYOR_BUDGET = { high: 12, low: 8 } as const;

export function createPulseConveyor(spec: PulseConveyorSpec): PulseConveyor {
  const span = spec.segmentLength * spec.liveCount;
  const segments: ConveyorSegmentTransform[] = Array.from({ length: spec.liveCount }, (_, index) => ({
    position: [0, spec.y, spec.headZ + index * spec.segmentLength],
    rotation: [0, 0, 0],
    scale: [...spec.scale]
  }));
  let travelledValue = 0;
  return {
    segments,
    get travelled() {
      return travelledValue;
    },
    advance(distance: number): void {
      if (!(distance > 0)) return;
      travelledValue += distance;
      for (const segment of segments) {
        let z = segment.position[2] + distance;
        // Wrap rather than drop: the span keeps exactly liveCount live hoops.
        while (z > spec.recycleZ) z -= span;
        segment.position[2] = z;
      }
    }
  };
}
