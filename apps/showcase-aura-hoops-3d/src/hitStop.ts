/**
 * Hit-stop that counts down on the real frame delta. It must never count down on game time: game time stands still
 * while frozen, so a hit-stop measured against it would never end.
 */
export interface RealtimeHitStop {
  /** Freeze for `seconds` of real time (a longer pending freeze wins). */
  trigger(seconds: number): void;
  /** Call once per rendered frame with the raw frame delta in seconds; returns true when this frame is frozen. */
  advance(dtRaw: number): boolean;
  readonly remaining: number;
}

export function createRealtimeHitStop(): RealtimeHitStop {
  let remaining = 0;
  return {
    trigger(seconds) {
      if (seconds > remaining) remaining = seconds;
    },
    advance(dtRaw) {
      const frozen = remaining > 0;
      if (frozen) remaining = Math.max(0, remaining - Math.max(0, dtRaw));
      return frozen;
    },
    get remaining() {
      return remaining;
    }
  };
}
