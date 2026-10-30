/**
 * GU47 WP-31 LT-13, the signature: earned sky lanterns. Every clean arrival (a leg finished without a catch) releases 6-12
 * paper lanterns from the platform; they rise and stay aloft for the rest of the session, so the dusk sky fills with the
 * lights the driver earned. A catch drops one guttering lantern from the sky. All lanterns draw as ONE instanced emissive
 * node (`sky-lanterns`, `instances` of a primitive until the WP-36 paper-lantern model lands).
 *
 * Read-only on the sim: the sky reads the leg, phase and catch count of consecutive snapshots and never writes them.
 * Deterministic: lantern placement comes from a Lehmer generator seeded per arrival, so replays and captures repeat.
 * Reduced motion keeps the lanterns but holds the bob and the rise at 30% (PRD §6.3).
 */
import type { V3 } from "./orient";

export const LANTERN_CAP = 96;
export const LANTERN_MIN = 6;
export const LANTERN_MAX = 12;
/** Height the released lanterns settle at above their platform, and their bob amplitude (metres). */
export const LANTERN_RISE = 38;
export const LANTERN_BOB = 0.6;
export const LANTERN_RISE_SECONDS = 9;
export const GUTTER_SECONDS = 4;
export const REDUCED_MOTION_SCALE = 0.3;

export interface Lantern {
  readonly origin: V3;
  readonly drift: V3;
  readonly phase: number;
  readonly born: number;
  /** Set when a catch drops it: it gutters and falls until `GUTTER_SECONDS` after this. */
  dropped: number | null;
}

export interface LanternSimView {
  readonly leg: number;
  readonly phase: string;
  readonly catches: number;
}

function lehmer(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 48271) % 2147483647) - 1) / 2147483646;
}

/** How many lanterns an arrival releases: 6 base, +2 per streak step, capped at 12; deterministic per arrival index. */
export function releaseCount(arrival: number, streak: number): number {
  const r = lehmer(9001 + arrival * 131)();
  return Math.min(LANTERN_MAX, LANTERN_MIN + Math.max(0, Math.floor(streak)) * 2 + Math.floor(r * 2));
}

export class LanternSky {
  readonly lanterns: Lantern[] = [];
  private arrivals = 0;
  private catchesThisLeg = 0;
  private last: LanternSimView | null = null;
  released = 0;

  /**
   * Feeds one sim snapshot. `platform` is the arrival platform position (where a release starts). Returns the number of
   * lanterns released this call (0 on every other frame).
   */
  observe(now: LanternSimView, seconds: number, platform: V3, streak = 0): number {
    const prev = this.last;
    this.last = { ...now };
    if (!prev) return 0;
    if (now.catches > prev.catches) {
      this.catchesThisLeg += now.catches - prev.catches;
      this.dropOne(seconds);
    }
    if (prev.phase === "enroute" && now.phase !== "enroute" && now.leg !== prev.leg) {
      const clean = this.catchesThisLeg === 0;
      this.catchesThisLeg = 0;
      this.arrivals++;
      if (clean) return this.release(platform, seconds, releaseCount(this.arrivals, streak));
    }
    return 0;
  }

  release(platform: V3, seconds: number, count: number): number {
    const rand = lehmer(4100 + this.arrivals * 977 + this.released);
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (this.aloft() >= LANTERN_CAP) this.lanterns.splice(this.lanterns.findIndex((l) => l.dropped === null), 1);
      const a = rand() * Math.PI * 2, r = 2 + rand() * 9;
      this.lanterns.push({
        origin: [platform[0] + Math.cos(a) * r, platform[1] + 1.5, platform[2] + Math.sin(a) * r],
        drift: [(rand() - 0.5) * 14, LANTERN_RISE * (0.7 + rand() * 0.6), (rand() - 0.5) * 14],
        phase: rand() * Math.PI * 2,
        born: seconds + i * 0.35,
        dropped: null
      });
      n++;
    }
    this.released += n;
    return n;
  }

  /** A catch drops the oldest lantern still aloft. */
  dropOne(seconds: number): void {
    const l = this.lanterns.find((x) => x.dropped === null && seconds >= x.born);
    if (l) l.dropped = seconds;
  }

  aloft(): number {
    return this.lanterns.filter((l) => l.dropped === null).length;
  }

  /** World positions and scales of every visible lantern at `seconds`; dropped ones gutter, fall and vanish. */
  transforms(seconds: number, reducedMotion = false): { position: V3; scale: number }[] {
    const k = reducedMotion ? REDUCED_MOTION_SCALE : 1;
    const out: { position: V3; scale: number }[] = [];
    for (let i = this.lanterns.length - 1; i >= 0; i--) {
      const l = this.lanterns[i]!;
      if (l.dropped !== null && seconds - l.dropped > GUTTER_SECONDS) { this.lanterns.splice(i, 1); continue; }
    }
    for (const l of this.lanterns) {
      if (seconds < l.born) continue;
      const age = seconds - l.born;
      const t = Math.min(1, age / LANTERN_RISE_SECONDS), ease = 1 - (1 - t) * (1 - t);
      const bob = Math.sin(seconds * 0.9 + l.phase) * LANTERN_BOB * k;
      let y = l.origin[1] + l.drift[1] * ease + bob;
      let scale = 1;
      if (l.dropped !== null) {
        const g = (seconds - l.dropped) / GUTTER_SECONDS;
        y -= g * g * 30;
        scale = Math.max(0.05, 1 - g);
      }
      out.push({ position: [l.origin[0] + l.drift[0] * ease, y, l.origin[2] + l.drift[2] * ease], scale });
    }
    return out;
  }
}
