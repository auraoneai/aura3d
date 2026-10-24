/**
 * `cameras.chase`: the gameplay chase camera rig shared by the Crayon ports.
 *
 * Pure, deterministic math (no DOM, no clock, no randomness): the caller feeds the followed target each frame and
 * applies the returned pose with `app.camera.setPose`. Two ways to drive it:
 * - offset mode: pass `position`, `heading`, `speed` and the rig places the eye behind and the look target ahead using
 *   `offset`, smooths the follow heading, eye, look and fov with `lag`, opens the fov with `fovKick` and adds shake;
 * - framed mode: pass `wantEye` / `wantLook` (and optionally `fovTarget`) computed on a road frame, a rail or a menu orbit,
 *   and the rig only does the exponential smoothing, the first-frame snap and the cut flag.
 * A lag rate is a per-second exponential rate (`1 - exp(-rate * dt)`); `Infinity` (or an absent lag) follows exactly.
 */

export type ChaseVec3 = readonly [number, number, number];

export interface ChaseOffset {
  /** Distance behind the target along the follow heading. */
  readonly back?: number;
  readonly backPerSpeed?: number;
  /** Extra distance while `boosting`. */
  readonly backBoost?: number;
  /** Eye height above the target. */
  readonly up?: number;
  readonly upPerSpeed?: number;
  /** The eye never drops below `groundAt(x, z) + minAboveGround` when the target supplies `groundAt`. */
  readonly minAboveGround?: number;
  /** Look target lead ahead of the target. */
  readonly lead?: number;
  readonly leadPerSpeed?: number;
  /** Look target height above the target. */
  readonly lookUp?: number;
}

export interface ChaseLag {
  readonly eye?: number;
  readonly look?: number;
  readonly fov?: number;
  /** Follow-heading rate at full speed (offset mode). */
  readonly heading?: number;
  /** Fraction of the heading rate applied at standstill (default 1: no speed ramp). */
  readonly headingMinFollow?: number;
  /** Speed at which the heading follow reaches its full rate (default 15). */
  readonly headingFullSpeed?: number;
}

export interface ChaseFovKick {
  readonly base?: number;
  readonly perSpeed?: number;
  /** Cap on the speed-driven opening. */
  readonly maxSpeedKick?: number;
  /** Extra fov while `boosting`. */
  readonly boost?: number;
}

export interface ChaseShake {
  /** Amplitude per unit of the target's `shake` value. */
  readonly perShake?: number;
  /** Speed above which a speed-driven shake begins, the speed span to full strength and its amplitude. */
  readonly speedStart?: number;
  readonly speedRange?: number;
  readonly speedAmp?: number;
  readonly boostAmp?: number;
  /** Target `shake` values at or below this (with no speed shake) add nothing. */
  readonly threshold?: number;
  /** Vertical share of the amplitude and the wobble phase of the vertical axis. */
  readonly verticalScale?: number;
  readonly verticalPhase?: number;
  /** `accumulate` adds the wobble into the smoothed eye state (a low-passed shake); `overlay` adds it to the output only. */
  readonly mode?: "accumulate" | "overlay";
}

export interface ChaseOptions {
  readonly offset?: ChaseOffset;
  readonly lag?: ChaseLag;
  readonly fovKick?: ChaseFovKick;
  readonly shake?: ChaseShake;
  /** Pose used by `snap` in offset mode. */
  readonly snapOffset?: { readonly back: number; readonly up: number; readonly lead: number; readonly lookUp: number; readonly fov: number };
}

export interface ChaseTarget {
  readonly position?: ChaseVec3;
  /** Heading in radians; forward is `(sin h, cos h)` on x/z. */
  readonly heading?: number;
  readonly speed?: number;
  readonly boosting?: boolean;
  /** Target shake amount, scaled by `shake.perShake`. */
  readonly shake?: number;
  readonly groundAt?: (x: number, z: number) => number;
  /** Framed mode: desired eye and look (replace the offset placement). */
  readonly wantEye?: ChaseVec3;
  readonly wantLook?: ChaseVec3;
  /** Desired fov (replaces the base + kick formula). */
  readonly fovTarget?: number;
  /** Per-step lag override (kid-goku style per-phase rates). */
  readonly lag?: ChaseLag;
  /** Added to the eye after smoothing, never stored (damage shake, camera bob). */
  readonly shakeOffset?: ChaseVec3;
  /** Snap eye, look and fov to their targets this step. */
  readonly cut?: boolean;
}

export interface ChasePose {
  eye: [number, number, number];
  look: [number, number, number];
  fov: number;
  /** Smoothed follow heading. */
  heading: number;
  /** Rig clock (sum of dt), drives the shake wobble. */
  time: number;
  /** True when this step snapped instead of smoothing: pass it as `setPose`'s `cut`. */
  cut: boolean;
}

export interface ChaseRig {
  readonly pose: ChasePose;
  /** Place the rig exactly on its targets with no smoothing. */
  snap(target: ChaseTarget): ChasePose;
  step(target: ChaseTarget, dt: number): ChasePose;
  /** Forget the pose: the next `step` snaps. */
  reset(): void;
}

export function approach(current: number, target: number, rate: number, dt: number): number {
  if (!(rate < Infinity)) return target;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function approachAngle(current: number, target: number, rate: number, dt: number): number {
  let d = target - current;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return current + d * (rate < Infinity ? 1 - Math.exp(-rate * dt) : 1);
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const wobble = (t: number, amp: number, phase: number): number =>
  (0.62 * Math.sin(t * (6.1 + phase)) + 0.38 * Math.sin(t * (11.3 + 1.7 * phase))) * amp;

export function createChaseRig(options: ChaseOptions = {}): ChaseRig {
  const o = options.offset ?? {};
  const baseLag = options.lag ?? {};
  const kick = options.fovKick ?? {};
  const sh = options.shake;
  const snapO = options.snapOffset ?? { back: (o.back ?? 6) + 4.7, up: (o.up ?? 2.5) + 1.8, lead: o.lead ?? 5, lookUp: o.lookUp ?? 1.25, fov: kick.base ?? 56 };
  const pose: ChasePose = { eye: [0, 0, 0], look: [0, 0, 0], fov: kick.base ?? 56, heading: 0, time: 0, cut: true };
  let live = false;

  const wantFov = (t: ChaseTarget, speed: number): number =>
    t.fovTarget ?? (kick.base ?? 56) + clamp((kick.perSpeed ?? 0) * speed, 0, kick.maxSpeedKick ?? Infinity) + (t.boosting ? kick.boost ?? 0 : 0);

  const snap = (t: ChaseTarget): ChasePose => {
    const p = t.position ?? [0, 0, 0];
    const h = t.heading ?? 0;
    const s = Math.sin(h);
    const c = Math.cos(h);
    pose.heading = h;
    pose.time = 0;
    pose.cut = true;
    if (t.wantEye && t.wantLook) {
      pose.eye = [t.wantEye[0], t.wantEye[1], t.wantEye[2]];
      pose.look = [t.wantLook[0], t.wantLook[1], t.wantLook[2]];
      pose.fov = wantFov(t, Math.abs(t.speed ?? 0));
    } else {
      pose.eye = [p[0] - snapO.back * s, p[1] + snapO.up, p[2] - snapO.back * c];
      pose.look = [p[0] + snapO.lead * s, p[1] + snapO.lookUp, p[2] + snapO.lead * c];
      pose.fov = snapO.fov;
    }
    live = true;
    return pose;
  };

  const step = (t: ChaseTarget, dt: number): ChasePose => {
    if (!live || t.cut) {
      snap(t);
      return finish(t);
    }
    pose.cut = false;
    pose.time += dt;
    const lag = t.lag ? { ...baseLag, ...t.lag } : baseLag;
    const speed = Math.abs(t.speed ?? 0);
    let wantEye: ChaseVec3;
    let wantLook: ChaseVec3;
    if (t.wantEye && t.wantLook) {
      wantEye = t.wantEye;
      wantLook = t.wantLook;
    } else {
      const p = t.position ?? [0, 0, 0];
      const follow = (lag.headingMinFollow ?? 1) + (1 - (lag.headingMinFollow ?? 1)) * clamp(speed / (lag.headingFullSpeed ?? 15), 0, 1);
      pose.heading = approachAngle(pose.heading, t.heading ?? 0, (lag.heading ?? Infinity) * follow, dt);
      const sn = Math.sin(pose.heading);
      const cs = Math.cos(pose.heading);
      const back = (o.back ?? 6) + (o.backPerSpeed ?? 0) * speed + (t.boosting ? o.backBoost ?? 0 : 0);
      let ey = p[1] + (o.up ?? 2.5) + (o.upPerSpeed ?? 0) * speed;
      const tx = p[0] - sn * back;
      const tz = p[2] - cs * back;
      if (t.groundAt && o.minAboveGround !== undefined) ey = Math.max(ey, t.groundAt(tx, tz) + o.minAboveGround);
      const lead = (o.lead ?? 5) + (o.leadPerSpeed ?? 0) * speed;
      wantEye = [tx, ey, tz];
      wantLook = [p[0] + sn * lead, p[1] + (o.lookUp ?? 1.25), p[2] + cs * lead];
    }
    const eyeRate = lag.eye ?? Infinity;
    const lookRate = lag.look ?? Infinity;
    pose.eye = [approach(pose.eye[0], wantEye[0], eyeRate, dt), approach(pose.eye[1], wantEye[1], eyeRate, dt), approach(pose.eye[2], wantEye[2], eyeRate, dt)];
    if (sh && (sh.mode ?? "accumulate") === "accumulate") {
      const speedShake = (sh.speedAmp ?? 0) * clamp((speed - (sh.speedStart ?? 0)) / (sh.speedRange ?? 1), 0, 1) + (t.boosting ? sh.boostAmp ?? 0 : 0);
      const shake = t.shake ?? 0;
      if (shake > (sh.threshold ?? 0) || speedShake > 0) {
        const amp = (sh.perShake ?? 1) * shake + speedShake;
        pose.eye[0] += wobble(pose.time, amp, 0);
        pose.eye[1] += wobble(pose.time, (sh.verticalScale ?? 0.7) * amp, sh.verticalPhase ?? 1.3);
      }
    }
    pose.look = [approach(pose.look[0], wantLook[0], lookRate, dt), approach(pose.look[1], wantLook[1], lookRate, dt), approach(pose.look[2], wantLook[2], lookRate, dt)];
    pose.fov = approach(pose.fov, wantFov(t, speed), lag.fov ?? Infinity, dt);
    return finish(t);
  };

  const finish = (t: ChaseTarget): ChasePose => {
    if (sh && sh.mode === "overlay") {
      const speed = Math.abs(t.speed ?? 0);
      const speedShake = (sh.speedAmp ?? 0) * clamp((speed - (sh.speedStart ?? 0)) / (sh.speedRange ?? 1), 0, 1) + (t.boosting ? sh.boostAmp ?? 0 : 0);
      const shake = t.shake ?? 0;
      if (shake > (sh.threshold ?? 0) || speedShake > 0) {
        const amp = (sh.perShake ?? 1) * shake + speedShake;
        const out = { ...pose, eye: [pose.eye[0] + wobble(pose.time, amp, 0), pose.eye[1] + wobble(pose.time, (sh.verticalScale ?? 0.7) * amp, sh.verticalPhase ?? 1.3), pose.eye[2]] as [number, number, number] };
        if (t.shakeOffset) out.eye = [out.eye[0] + t.shakeOffset[0], out.eye[1] + t.shakeOffset[1], out.eye[2] + t.shakeOffset[2]];
        return out;
      }
    }
    if (t.shakeOffset) return { ...pose, eye: [pose.eye[0] + t.shakeOffset[0], pose.eye[1] + t.shakeOffset[1], pose.eye[2] + t.shakeOffset[2]] };
    return pose;
  };

  return {
    pose,
    snap: (t) => (snap(t), finish(t)),
    step,
    reset() {
      live = false;
    }
  };
}
