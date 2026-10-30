/**
 * GU47 WP-11 VFX preset pack (PRD §3.2 item 3) and the signature controller.
 *
 * Signature (TT-V1): every bounce leaves a surface-coloured ball mark (`app.effects.decal`, one merged decal batch; clay
 * marks last the set) and a registered bounce burst coloured from the contract's `VENUES[].particleColor`: clay-puff,
 * grass-flick, hard-skid (hard, desert, beach) or regolith-drift (Moon). Out calls flash a red ring at the mark. TT-V2: the
 * ball flight is one camera-facing ribbon (`app.effects.trail("tennis-ball")`) instead of eight spheres; an ace adds an
 * impact flash, skipped under reduced motion. Presentation only: the controller reads sim state, never writes it.
 *
 * Reduced motion halves every burst's count (PRD §6.3); `?vfx=off` (engine runtime effects "off") drops bursts, trail and
 * marks.
 */
import type { AuraAppEffects, AuraEffectInstanceHandle, AuraTrailHandle, AuraVec3, AuraVfxEffectSpec } from "@aura3d/engine";
import { COURT_X, COURT_Z } from "./constants";
import type { VenueBurstKind, VenueLook } from "./look";

export type SlamVfxKind = VenueBurstKind | "out-ring" | "ace-flash" | "win-confetti";

/** Registered effect kinds: one bounce burst per surface family, the out-call ring and the ace flash. */
export const SLAM_VFX_PRESETS: Readonly<Record<SlamVfxKind, AuraVfxEffectSpec>> = {
  "clay-puff": {
    name: "clay-puff",
    layers: [{ type: "emitter", preset: "dust", count: 14, speed: 1.1, life: 0.95, gravity: -0.5, size: 0.17, spread: 0.85, drag: 2.4, direction: [0, 1, 0], sprite: "smoke-a" }]
  },
  "grass-flick": {
    name: "grass-flick",
    layers: [{ type: "emitter", preset: "debris", count: 7, speed: 1.7, life: 0.5, gravity: -7, size: 0.045, spread: 0.55, direction: [0, 1, 0], sprite: "debris-chips" }]
  },
  "hard-skid": {
    name: "hard-skid",
    layers: [{ type: "emitter", preset: "dust", count: 6, speed: 0.7, life: 0.38, gravity: -0.4, size: 0.085, spread: 0.3, drag: 3, direction: [0, 1, 0], sprite: "dust-mote" }]
  },
  "regolith-drift": {
    name: "regolith-drift",
    // Lunar gravity (1.62 m/s^2) and no air drag: the dust arcs out and settles slowly.
    layers: [{ type: "emitter", preset: "dust", count: 12, speed: 0.95, life: 1.7, gravity: -1.62, size: 0.12, spread: 1, drag: 0, direction: [0, 1, 0], sprite: "dust-mote" }]
  },
  "out-ring": {
    name: "out-ring",
    layers: [{ type: "emitter", preset: "ring", count: 1, speed: 0, life: 0.6, size: 0.55, color: "#ff3b30", direction: [0, 1, 0], sprite: "ring-thin" }]
  },
  "ace-flash": {
    name: "ace-flash",
    layers: [
      { type: "emitter", preset: "spark", count: 10, speed: 2.2, life: 0.35, size: 0.06, color: "#f2ff7a", additive: true, sprite: "spark-streak" },
      { type: "light", intensity: 2.5, range: 4, duration: 0.18, color: "#f2ff7a" }
    ]
  },
  // TT-V3: match-won confetti over the net (tour lime and white chips drifting down; one sprite batch).
  "win-confetti": {
    name: "win-confetti",
    layers: [
      { type: "emitter", preset: "debris", count: 60, speed: 4.2, life: 2.6, gravity: -2.2, size: 0.09, spread: 0.9, drag: 1.2, direction: [0, 1, 0], color: "#d7f55b", sprite: "debris-chips" },
      { type: "emitter", preset: "debris", count: 40, speed: 3.6, life: 2.6, gravity: -2.2, size: 0.08, spread: 0.9, drag: 1.2, direction: [0, 1, 0], color: "#fbfbf5", sprite: "debris-chips" }
    ]
  }
};

/** Registers the pack on the app's effects surface; returns the kinds registered. */
export function registerSlamVfx(effects: Pick<AuraAppEffects, "registerPreset"> | null | undefined): readonly SlamVfxKind[] {
  if (!effects || typeof effects.registerPreset !== "function") return [];
  const kinds = Object.keys(SLAM_VFX_PRESETS) as SlamVfxKind[];
  for (const kind of kinds) effects.registerPreset(kind, SLAM_VFX_PRESETS[kind]);
  return kinds;
}

/** Burst count for a preset under the reduced-motion setting (PRD §6.3: particle emission halves). */
export function burstCount(kind: SlamVfxKind, reducedMotion: boolean): number {
  const base = Number((SLAM_VFX_PRESETS[kind].layers[0] as { count?: number }).count ?? 6);
  return reducedMotion ? Math.max(1, Math.floor(base / 2)) : base;
}

/** Ball-mark decal height above the court (the lines sit at 0.012-0.016 m; marks just above the surface, below the lines' tops). */
export const MARK_Y = 0.0135;
/** Ball-mark decal diameter (a 67 mm ball skids an oval about 2.4x its width; one round decal reads at the broadcast distance). */
export const MARK_SIZE = 0.17;
/** Most marks kept on court at once (oldest go first); the decal batch draws them in one call. */
export const MARK_CAPACITY = 96;

/** Trail (TT-V2): ribbon width, life (matches the sim's 0.22 s trail points) and colour. */
export const BALL_TRAIL = { width: 0.07, life: 0.22, color: "#e6eb8d", widthOverSpeed: [3, 14] as [number, number] } as const;

interface SimMark { readonly x: number; readonly y: number; readonly life: number }
interface SimStateLike {
  readonly mode?: string;
  readonly phase?: string;
  readonly marks?: readonly unknown[];
  readonly outFeedback?: unknown;
  readonly lastCall?: string;
  readonly score?: { readonly playerGames?: number; readonly aiGames?: number; readonly playerPoints?: number; readonly aiPoints?: number };
}

export interface SlamVfxEvents { bounces: number; outCalls: number; aces: number; marks: number; wins: number }

export interface SlamVfxController {
  /** Per frame: fires the bounce / out / ace effects the sim state implies. Allocation-light (one array per spawned effect). */
  update(state: Readonly<SimStateLike>, look: VenueLook): void;
  /** Starts the ball trail (World Tour look); a no-op when runtime effects are off. */
  startTrail(target: string): void;
  /** Drops every mark (venue change, new set). */
  clearMarks(): void;
  readonly events: Readonly<SlamVfxEvents>;
  dispose(): void;
}

const isMark = (m: unknown): m is SimMark =>
  typeof m === "object" && m !== null && Number.isFinite((m as SimMark).x) && Number.isFinite((m as SimMark).y) && Number.isFinite((m as SimMark).life);

/**
 * The signature controller. `effects` is `app.effects` (or a stand-in in tests); `reducedMotion` and `reducedFlash` are
 * read per event.
 */
export function createSlamVfx(
  effects: Pick<AuraAppEffects, "burst" | "decal" | "trail" | "runtime"> | null | undefined,
  options: { reducedMotion?: () => boolean; reducedFlash?: () => boolean } = {}
): SlamVfxController {
  const reducedMotion = options.reducedMotion ?? (() => false);
  const reducedFlash = options.reducedFlash ?? reducedMotion;
  const marks: AuraEffectInstanceHandle[] = [];
  let trail: AuraTrailHandle | null = null;
  let lastMarkKey = "";
  let lastOut = false;
  let lastAceKey = "";
  let lastGames = -1;
  let lastMarkPos: AuraVec3 = [0, MARK_Y, 0];
  const events: SlamVfxEvents = { bounces: 0, outCalls: 0, aces: 0, marks: 0, wins: 0 };
  let celebrated = false;
  const live = (): boolean => Boolean(effects) && effects!.runtime !== "off";

  const clearMarks = (): void => {
    for (const handle of marks) {
      try { handle.stop({ immediate: true }); } catch { /* already gone */ }
    }
    marks.length = 0;
    events.marks = 0;
  };

  return {
    events,
    update(state, look) {
      if (!effects) return;
      // A new set (games back to 0-0) or the menu clears the court: clay marks last the set.
      const games = (state.score?.playerGames ?? 0) + (state.score?.aiGames ?? 0);
      if ((lastGames > 0 && games < lastGames) || state.mode === "menu") clearMarks();
      // TT-V3: one confetti burst when the match ends (halved under reduced motion); a new match re-arms it.
      if (state.mode === "gameover" && !celebrated) {
        celebrated = true;
        events.wins += 1;
        if (live()) {
          try { effects.burst("win-confetti", [0, 1.4, 0], { count: burstCount("win-confetti", reducedMotion()), camera: false }); } catch { /* unavailable */ }
        }
      } else if (state.mode !== "gameover") celebrated = false;
      lastGames = games;

      const list = Array.isArray(state.marks) ? state.marks : [];
      const newest = list.length > 0 ? list[list.length - 1] : undefined;
      if (isMark(newest)) {
        const key = `${newest.x.toFixed(5)},${newest.y.toFixed(5)}`;
        // The sim pushes a mark with life 4 on every bounce (engine.ts handleBallEvent); a fresh one is a new bounce.
        if (key !== lastMarkKey && newest.life > 3.5 && state.mode !== "menu") {
          const position: AuraVec3 = [newest.x * COURT_X, MARK_Y, newest.y * COURT_Z];
          lastMarkPos = position;
          events.bounces += 1;
          if (live()) {
            const sig = look.signature;
            try {
              effects.burst(sig.burst, [position[0], 0.03, position[2]], { color: sig.burstColor, count: burstCount(sig.burst, reducedMotion()), camera: false, normal: [0, 1, 0] });
            } catch { /* effects surface unavailable */ }
            try {
              marks.push(effects.decal({ position, normal: [0, 1, 0] }, { size: MARK_SIZE, lifetime: sig.markLifetime, color: sig.markColor, opacity: sig.markOpacity }));
              if (marks.length > MARK_CAPACITY) marks.shift()?.stop({ immediate: true });
              events.marks = marks.length;
            } catch { /* decals unavailable */ }
          }
        }
        lastMarkKey = key;
      }

      const out = Boolean(state.outFeedback);
      if (out && !lastOut) {
        events.outCalls += 1;
        if (live()) {
          try { effects.burst("out-ring", [lastMarkPos[0], 0.02, lastMarkPos[2]], { color: "#ff3b30", count: 1, camera: false, normal: [0, 1, 0] }); } catch { /* unavailable */ }
        }
      }
      lastOut = out;

      const pointKey = `${state.score?.playerPoints ?? 0}:${state.score?.aiPoints ?? 0}:${games}`;
      if (state.lastCall === "ACE" && state.phase === "point" && pointKey !== lastAceKey) {
        lastAceKey = pointKey;
        events.aces += 1;
        if (live() && !reducedMotion() && !reducedFlash()) {
          try { effects.burst("ace-flash", [lastMarkPos[0], 0.3, lastMarkPos[2]], { count: burstCount("ace-flash", false), camera: false }); } catch { /* unavailable */ }
        }
      }
    },
    startTrail(target) {
      if (!effects || trail || !live()) return;
      try { trail = effects.trail(target, { width: BALL_TRAIL.width, life: BALL_TRAIL.life, color: BALL_TRAIL.color, widthOverSpeed: BALL_TRAIL.widthOverSpeed }); } catch { trail = null; }
    },
    clearMarks,
    dispose() {
      clearMarks();
      try { trail?.stop({ immediate: true }); } catch { /* gone */ }
      trail = null;
    }
  };
}
