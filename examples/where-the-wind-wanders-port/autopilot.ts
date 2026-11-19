/**
 * Autoplay (`?autoplay=1`, alias `?autopilot=1`, toggle key O): the computer walks the Bellkeeper hands-free — along the
 * path to the oak letter, back east and down to the windmill letter, on to the shore letter, then up to the bell — and
 * presses E at each. It drives the sim through its normal input (`FrameInput` keys W/A/S/D + act), so normal play and the
 * recorded-reference replays are untouched.
 *
 * The route follows the path and the desire lines the original's recorded session walked (`decor-layout.ts`), which the
 * scene colliders keep clear; a stuck check side-steps around anything in the way.
 *
 * `createAutoplaySession` runs the end of a walk: the bell rings, the result shows for `resultsSeconds`, the voyage
 * epilogue plays for `voyageSeconds`, then the walk restarts from the start — looping forever.
 */
import { BELL, BELL_REACH, LETTERS, LETTER_REACH, cameraAxes, nearbyInteraction, type Action, type FrameInput, type Vec2, type WindState } from "./sim";
import { DESIRE_LINES } from "./decor-layout";

type P = readonly [number, number];
/** The worn path from the start west to the oak (the original's route). */
const TO_OAK: readonly P[] = [[-15.3, 3.8], [-17.8, 3.9], [-20.5, 3.8], [-22.6, 3.3]];
/** Back east along the path to where the walk leaves it for the windmill. */
const OAK_TO_PATH_EAST: readonly P[] = [[-20.7, 3.3], [-18, 3.6], [-15.7, 2.9], [-13.3, 2.1], [-11, 1.3], [-8.4, 1.4], [-5.8, 1.7], [-3.1, 2.0], [-0.5, 2.4], [2.2, 2.7], [4.8, 3.0]];

/** One leg per goal: waypoints, then the goal (a letter index, or the bell). */
export interface AutoplayLeg { readonly goal: number | "bell"; readonly via: readonly P[] }
export const AUTOPLAY_LEGS: readonly AutoplayLeg[] = [
  { goal: 0, via: TO_OAK },
  { goal: 1, via: [...OAK_TO_PATH_EAST, ...DESIRE_LINES[0]!] },
  { goal: 2, via: DESIRE_LINES[1]! },
  { goal: "bell", via: DESIRE_LINES[2]!.slice(0, -1) }
];

const goalPoint = (g: AutoplayLeg["goal"]): Vec2 => (g === "bell" ? { x: BELL.x, z: BELL.z } : { x: LETTERS[g]!.x, z: LETTERS[g]!.z });

export interface Autopilot {
  /** Input for the next fixed step (dt seconds). */
  next(s: WindState, dt: number): FrameInput;
  reset(): void;
  /** The leg being walked (for QA). */
  readonly leg: number;
}

export function createAutopilot(): Autopilot {
  let leg = -1, wp = 0, actCooldown = 0, hopClock = 0;
  let watchAt: Vec2 | null = null, watchT = 0, dodgeT = 0, dodgeSide = 1;
  const pickLeg = (s: WindState): number => {
    for (let i = 0; i < AUTOPLAY_LEGS.length; i++) {
      const g = AUTOPLAY_LEGS[i]!.goal;
      if (g === "bell" ? !s.complete : !s.found.includes(g)) return i;
    }
    return -1;
  };
  /** Nearest waypoint of the leg, then one further if the walker is already past it. */
  const pickWaypoint = (s: WindState, l: AutoplayLeg): number => {
    let best = 0, bd = Infinity;
    l.via.forEach(([x, z], i) => { const d = Math.hypot(s.pos.x - x, s.pos.z - z); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  return {
    get leg() { return leg; },
    reset() { leg = -1; wp = 0; actCooldown = 0; hopClock = 0; watchAt = null; watchT = 0; dodgeT = 0; },
    next(s, dt) {
      actCooldown = Math.max(0, actCooldown - dt);
      const l = pickLeg(s);
      if (l < 0) return { keys: "", act: null };
      if (l !== leg) { leg = l; wp = pickWaypoint(s, AUTOPLAY_LEGS[l]!); watchAt = null; }
      const cur = AUTOPLAY_LEGS[leg]!;
      const goal = goalPoint(cur.goal);
      // in reach of the goal: stop and press E (once per half second until the sim reports it)
      const near = nearbyInteraction(s.pos, s.found);
      const inReach = cur.goal === "bell" ? near.bell && near.letter < 0 : near.letter === cur.goal;
      if (inReach) {
        if (actCooldown > 0) return { keys: "", act: null };
        actCooldown = 0.5;
        return { keys: "", act: "E" as Action };
      }
      // target: the next waypoint, or the goal once the waypoints are done (stop inside the reach radius)
      while (wp < cur.via.length && Math.hypot(s.pos.x - cur.via[wp]![0], s.pos.z - cur.via[wp]![1]) < 0.7) wp++;
      const reach = cur.goal === "bell" ? BELL_REACH : LETTER_REACH;
      const t: Vec2 = wp < cur.via.length ? { x: cur.via[wp]![0], z: cur.via[wp]![1] } : goal;
      let dx = t.x - s.pos.x, dz = t.z - s.pos.z;
      if (wp >= cur.via.length && Math.hypot(dx, dz) < reach * 0.5) return { keys: "", act: null };
      // stuck check: under 0.35 m of progress in 1.2 s means something solid is in the way: side-step for 0.7 s
      watchT += dt;
      if (!watchAt) watchAt = { ...s.pos };
      if (watchT >= 1.2) {
        if (Math.hypot(s.pos.x - watchAt.x, s.pos.z - watchAt.z) < 0.35) { dodgeT = 0.7; dodgeSide = -dodgeSide; }
        watchAt = { ...s.pos }; watchT = 0;
      }
      if (dodgeT > 0) { dodgeT -= dt; [dx, dz] = [-dz * dodgeSide, dx * dodgeSide]; }
      // world direction -> camera-relative keys (W walks along -up, S along +up; D along +right, A along -right)
      const axes = cameraAxes(s.cam);
      const len = Math.hypot(dx, dz) || 1;
      const gx = (dx * axes.right.x + dz * axes.right.z) / len, gz = (dx * axes.up.x + dz * axes.up.z) / len;
      const keys = (gz < -0.38 ? "W" : "") + (gx < -0.38 ? "A" : "") + (gz > 0.38 ? "S" : "") + (gx > 0.38 ? "D" : "");
      // a hop now and then on the open path, like a person enjoying the walk
      hopClock += dt;
      const hop = hopClock > 7 && dodgeT <= 0 && s.hop.phase === "idle";
      if (hop) hopClock = 0;
      return { keys, act: hop ? "Space" : null };
    }
  };
}

export type AutoplayPhase = "walk" | "results" | "voyage" | "restart";
export interface AutoplaySession {
  /** Advance the end-of-walk clock by `dt` game seconds; returns what the page should show now. */
  tick(s: WindState, dt: number): AutoplayPhase;
  reset(): void;
}

/** After the bell: `resultsSeconds` on the result, `voyageSeconds` of the voyage epilogue, then `restart` (once). */
export function createAutoplaySession(opts: { resultsSeconds?: number; voyageSeconds?: number } = {}): AutoplaySession {
  const results = opts.resultsSeconds ?? 3, voyage = opts.voyageSeconds ?? 9;
  let t = 0;
  return {
    reset() { t = 0; },
    tick(s, dt) {
      if (!s.complete) { t = 0; return "walk"; }
      t += dt;
      if (t < results) return "results";
      if (t < results + voyage) return "voyage";
      t = 0;
      return "restart";
    }
  };
}
