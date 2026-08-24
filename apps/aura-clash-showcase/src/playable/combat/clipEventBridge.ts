import { sampleClipEvents, type AnimationClipEvent } from "@aura3d/animation";
import {
  auraClashAttackPresentationEvents,
  type AuraClashClipPresentationEvent,
  type AuraClashPresentationEventName
} from "../animation/auraClashClipMaps";
import { auraClashMoveTable, type AuraClashMoveId } from "./auraClashMoveData";

/**
 * AC-A1 — clip-event presentation bridge.
 *
 * Routes authored clip-local events (`sfx`, `vfx`, `camera.impulse`) from animation frames to
 * presentation consumers through an `onEvent` subscription. Events are sampled with the shared
 * `@aura3d/animation` clip-event sampler at the exact metadata frames declared in
 * `auraClashClipMaps.ts`, so cues land on authored clip frames instead of frame-count guesses.
 *
 * The bridge owns per-fighter, per-move cursors: `advance(fighterId, moveId, toSeconds)` fires
 * every cue on a metadata frame in `(cursor, toSeconds]` exactly once, and a new attack instance
 * calls `resetFighter` to restart the clocks. Rewinding is refused (the cursor only moves forward),
 * which is what makes scrub/reset edges safe.
 *
 * Combat timing is untouched: this module never reads or writes fighter/combat state and has no
 * notion of hit windows — move data in `auraClashMoveData.ts` stays the sole authority. The bridge
 * is a pure function of its advance calls, deterministic and unit-testable without a browser
 * (`tests/unit/apps/clash-clip-events.test.ts`).
 */

export type AuraClashFighterId = "player" | "rival";

export interface AuraClashPresentationEventInvocation {
  readonly fighterId: AuraClashFighterId;
  readonly moveId: AuraClashMoveId;
  /** The metadata lane that fired: `sfx`, `vfx` or `camera.impulse`. */
  readonly name: AuraClashPresentationEventName;
  /** The exact authored clip-local time (seconds) the cue landed on. */
  readonly time: number;
  readonly payload: Readonly<Record<string, string | number>>;
}

export type AuraClashPresentationListener = (event: AuraClashPresentationEventInvocation) => void;

export interface AuraClashClipEventBridge {
  /** Subscribe to presentation events; returns an unsubscribe function. */
  onEvent(listener: AuraClashPresentationListener): () => void;
  /**
   * Fire every authored cue on a metadata frame inside `(cursor, toSeconds]` for one fighter's
   * attack clock. Returns how many events fired. The cursor never rewinds; call `resetFighter`
   * when a new attack instance starts for that fighter.
   */
  advance(fighterId: AuraClashFighterId, moveId: AuraClashMoveId, toSeconds: number): number;
  /** Restart one fighter's cursors (a fresh attack instance began). */
  resetFighter(fighterId: AuraClashFighterId): void;
  /** Drop every cursor across fighters (round reset). Listeners are kept. */
  reset(): void;
}

const CLIP_EVENT_TYPE: Record<AuraClashPresentationEventName, AnimationClipEvent["type"]> = {
  sfx: "sfx",
  vfx: "vfx",
  "camera.impulse": "camera"
};

function metadataToClipEvents(events: readonly AuraClashClipPresentationEvent[]): readonly AnimationClipEvent[] {
  return events.map((event) => ({
    name: event.name,
    type: CLIP_EVENT_TYPE[event.name],
    time: event.time,
    payload: event.payload
  }));
}

export function createAuraClashClipEventBridge(): AuraClashClipEventBridge {
  const listeners = new Set<AuraClashPresentationListener>();
  // Cursor key: `${fighterId}:${moveId}` — independent clocks per fighter AND per move lane.
  const cursors = new Map<string, number>();
  const cursorKey = (fighterId: AuraClashFighterId, moveId: AuraClashMoveId): string => `${fighterId}:${moveId}`;
  // Sources are built once per move from the declared metadata (pure + deterministic).
  const sources = new Map(
    (Object.keys(auraClashAttackPresentationEvents) as AuraClashMoveId[]).map((moveId) => [
      moveId,
      {
        id: moveId,
        duration: auraClashMoveTable[moveId].duration,
        events: metadataToClipEvents(auraClashAttackPresentationEvents[moveId])
      }
    ])
  );

  return {
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    advance(fighterId, moveId, toSeconds) {
      if (!Number.isFinite(toSeconds) || toSeconds < 0) return 0;
      const source = sources.get(moveId);
      if (!source) return 0;
      const key = cursorKey(fighterId, moveId);
      const from = Math.min(cursors.get(key) ?? 0, toSeconds);
      cursors.set(key, toSeconds);
      if (toSeconds <= from) return 0;
      const fired = sampleClipEvents(source, {
        from,
        to: toSeconds,
        includeStart: false,
        includeEnd: true
      });
      if (fired.length === 0 || listeners.size === 0) return fired.length;
      for (const invocation of fired) {
        const name = invocation.event.name as AuraClashPresentationEventName;
        for (const listener of [...listeners]) {
          listener({
            fighterId,
            moveId,
            name,
            time: invocation.event.time,
            payload: invocation.event.payload as Readonly<Record<string, string | number>>
          });
        }
      }
      return fired.length;
    },
    resetFighter(fighterId) {
      for (const key of [...cursors.keys()]) {
        if (key.startsWith(`${fighterId}:`)) cursors.delete(key);
      }
    },
    reset() {
      cursors.clear();
    }
  };
}
