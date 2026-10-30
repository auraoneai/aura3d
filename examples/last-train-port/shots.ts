/**
 * GU47 LT-16: presentation-only camera shots for the band look. A 3 s arrival rail along the platform, a trackside
 * departure shot and a finale crane into the lantern sky; a FOV kick on departure and a short shake on a catch.
 *
 * The director reads the sim (phase, attempt status, catches) and never writes it, so service time is the same with and
 * without shots. A shot blends in and out of the chase pose (no hitch); any key or tap skips it. Under reduced motion the
 * shots are cuts: the camera jumps to the shot's held end pose and back, with no rail move, kick or shake.
 */
export type V3 = readonly [number, number, number];
export type ShotKind = "arrival" | "departure" | "finale";

export const SHOT_SECONDS: Readonly<Record<ShotKind, number>> = { arrival: 3, departure: 2.5, finale: 5 };
/** Blend in and out of the chase pose (seconds). */
export const SHOT_BLEND = { in: 1.2, out: 0.9 } as const;
/** Departure FOV kick (degrees, decays over `seconds`) and catch shake (metres, `seconds`). */
export const FOV_KICK = { degrees: 6, seconds: 1.2 } as const;
export const CATCH_SHAKE = { metres: 0.22, seconds: 0.35 } as const;

/** What the director reads of the sim: read-only. */
export interface ShotSimView {
  readonly phase: string;
  readonly complete: boolean;
  readonly catches: number;
}

/** Where the tram is this frame: position, unit forward along the track and unit side toward the platform. */
export interface ShotFrameContext {
  readonly here: V3;
  readonly forward: V3;
  readonly side: V3;
}

export interface ShotPose {
  readonly eye: V3;
  readonly target: V3;
  readonly fov: number;
}

export interface ShotResult extends ShotPose {
  /** 0 = chase pose only, 1 = shot pose only. */
  readonly weight: number;
  /** True on the frame the camera should cut (reduced motion entering or leaving a shot): reset the chase smoothing. */
  readonly cut: boolean;
  /** Added after smoothing (catch shake). */
  readonly shakeOffset: V3;
  readonly active: ShotKind | null;
}

const smooth = (t: number): number => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add = (p: V3, f: V3, kf: number, s: V3, ks: number, up: number): V3 => [p[0] + f[0] * kf + s[0] * ks, p[1] + up + f[1] * kf + s[1] * ks, p[2] + f[2] * kf + s[2] * ks];

/** The shot pose at progress `u` (0..1). `anchor` is the tram frame when the shot started (the departure camera stands still). */
export function shotPose(kind: ShotKind, u: number, now: ShotFrameContext, anchor: ShotFrameContext, base: ShotPose): ShotPose {
  const k = smooth(u);
  const tram: V3 = [now.here[0], now.here[1] + 2.2, now.here[2]];
  if (kind === "arrival") {
    // a rail at standing eye height on the platform (+side, between the lamp rows at 5.2 and 6.8): ahead of the tram back to its rear doors
    const from = add(now.here, now.forward, 14, now.side, 6, 2.4), to = add(now.here, now.forward, -6, now.side, 6, 2.6);
    return { eye: mix3(from, to, k), target: tram, fov: 48 };
  }
  if (kind === "departure") {
    // trackside, standing still ahead of where the tram pulled out; the tram drives past the camera
    const eye = add(anchor.here, anchor.forward, 26, anchor.side, -5.5, 1.6);
    return { eye, target: tram, fov: 44 + 6 * k };
  }
  // finale crane: rise above the tram and tilt into the lantern sky
  const eye = mix3(base.eye, add(now.here, now.forward, -12, now.side, 4, 34), k);
  const target = mix3(base.target, add(now.here, now.forward, 30, now.side, 0, 58), k);
  return { eye, target, fov: base.fov + 8 * k };
}

export class ShotDirector {
  private prev: ShotSimView | null = null;
  private kind: ShotKind | null = null;
  private startedAt = 0;
  private anchor: ShotFrameContext | null = null;
  private skipped = false;
  private exitAt = -1;
  private wasShown = false;
  private finaleQueued = false;
  private kickAt = -Infinity;
  private shakeAt = -Infinity;
  /** Shots started since construction, per kind (the QA reads `arrival`: 6 per full circuit). */
  readonly started: Record<ShotKind, number> = { arrival: 0, departure: 0, finale: 0 };

  constructor(private readonly enabled = true) {}

  get active(): ShotKind | null { return this.kind; }

  /** Ends the current shot (any key or tap): it blends out (cuts under reduced motion). */
  skip(): void { if (this.kind) this.skipped = true; }

  /** Reads one sim view; starts a shot on an arrival, a departure or a completed service, and a shake on a catch. */
  observe(view: ShotSimView, seconds: number): void {
    const p = this.prev;
    this.prev = { phase: view.phase, complete: view.complete, catches: view.catches };
    if (!p || !this.enabled) return;
    if (view.catches > p.catches) this.shakeAt = seconds;
    if (p.phase === "enroute" && view.phase !== "enroute") this.start("arrival", seconds);
    else if (p.phase !== "enroute" && view.phase === "enroute") { this.start("departure", seconds); this.kickAt = seconds; }
    // the last arrival of a service plays its rail, then the finale crane
    if (!p.complete && view.complete) { if (this.kind === "arrival") this.finaleQueued = true; else this.start("finale", seconds); }
    if (p.complete && !view.complete) this.finaleQueued = false;
  }

  private start(kind: ShotKind, seconds: number): void {
    this.kind = kind; this.startedAt = seconds; this.anchor = null; this.skipped = false; this.exitAt = -1;
    this.started[kind]++;
  }

  /** The camera for this frame: `base` is the chase pose the runtime computed; the result blends the shot over it. */
  frame(base: ShotPose, ctx: ShotFrameContext, seconds: number, reduced: boolean): ShotResult {
    const kickAge = seconds - this.kickAt, shakeAge = seconds - this.shakeAt;
    const kick = reduced || kickAge < 0 || kickAge > FOV_KICK.seconds ? 0 : FOV_KICK.degrees * (1 - kickAge / FOV_KICK.seconds);
    const shakeK = reduced || shakeAge < 0 || shakeAge > CATCH_SHAKE.seconds ? 0 : CATCH_SHAKE.metres * (1 - shakeAge / CATCH_SHAKE.seconds);
    const shakeOffset: V3 = shakeK > 0 ? [Math.sin(seconds * 53) * shakeK, Math.sin(seconds * 41 + 1.3) * shakeK * 0.6, Math.cos(seconds * 47) * shakeK] : [0, 0, 0];
    let weight = 0, pose: ShotPose = base;
    const kind = this.kind;
    if (kind) {
      if (!this.anchor) this.anchor = { here: [...ctx.here], forward: [...ctx.forward], side: [...ctx.side] };
      const age = seconds - this.startedAt, length = SHOT_SECONDS[kind];
      if ((this.skipped || age >= length) && this.exitAt < 0) this.exitAt = seconds;
      const out = this.exitAt < 0 ? 1 : reduced ? 0 : 1 - smooth((seconds - this.exitAt) / SHOT_BLEND.out);
      const into = reduced ? 1 : smooth(age / SHOT_BLEND.in);
      weight = Math.max(0, Math.min(into, out));
      if (this.exitAt >= 0 && weight <= 0) {
        this.kind = null; this.anchor = null;
        if (this.finaleQueued) { this.finaleQueued = false; this.wasShown = false; this.start("finale", seconds); return this.frame(base, ctx, seconds, reduced); }
      }
      else pose = shotPose(kind, reduced ? 1 : Math.min(1, age / length), ctx, this.anchor, base);
    }
    const shown = weight > 0;
    const cut = reduced && shown !== this.wasShown;
    this.wasShown = shown;
    return {
      eye: mix3(base.eye, pose.eye, weight),
      target: mix3(base.target, pose.target, weight),
      fov: base.fov + (pose.fov - base.fov) * weight + kick,
      weight, cut, shakeOffset, active: this.kind
    };
  }
}
