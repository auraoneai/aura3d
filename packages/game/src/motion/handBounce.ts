import { resolveBone } from "./boneAttach";

export type HandBounceVec3 = readonly [number, number, number];

export interface HandBounceGait {
  /** Seconds per bounce. */
  readonly period: number;
  /** Palm height above the floor at the meet (top of the bounce). */
  readonly palmTop: number;
  /** Palm height above the floor at the push (lowest the hand is asked to reach). */
  readonly palmPush: number;
}

export interface HandBounceOptions {
  /** Which hand bounces the ball. Mirrors the overlay's bone roles. Default "right". */
  readonly hand?: "left" | "right";
  /** Default 0.13 (a basketball). The ball centre is on the floor plus this radius at the bounce. */
  readonly ballRadius?: number;
  /** World Y of the floor. Palm heights are relative to it. Default 0. */
  readonly floorY?: number;
  /** How far below the shoulder the arm alone can reach. Palm targets are clamped to it. Default 0.55. */
  readonly armReach?: number;
  /** Palm centroid rides this far above the ball crown while in contact. Default 0.09. */
  readonly ballGap?: number;
  /** Standing profile; defaults are the Aura Hoops numbers (0.46 s, palm 1.02 to 0.62 m). */
  readonly standing?: Partial<HandBounceGait>;
  /** Running profile (lower apex, shorter period); defaults 0.30 s, palm 0.92 to 0.60 m. */
  readonly running?: Partial<HandBounceGait>;
  /** Horizontal speed (m/s) above which the running profile applies. Default 0.45. */
  readonly runSpeed?: number;
  /** Skeleton bone names; the overlay then names the bones that actually exist. */
  readonly boneNames?: readonly string[];
  /** Phase landmarks of one bounce (0 = palm meets ball at the top). */
  readonly phases?: Partial<HandBouncePhases>;
}

export interface HandBouncePhases {
  /** Palm and ball ride together down to here. Default 0.35. */
  readonly rideEnd: number;
  /** The palm turns around here while the ball keeps going down. Default 0.60. */
  readonly palmTurn: number;
  /** The ball meets the floor here. Default 0.66. */
  readonly floorAt: number;
  /** The palm is back on the ball and carries it again from here. Default 0.92. */
  readonly catchFrom: number;
}

export interface HandBounceConfig {
  readonly hand: "left" | "right";
  readonly ballRadius: number;
  readonly floorY: number;
  readonly armReach: number;
  readonly ballGap: number;
  readonly standing: HandBounceGait;
  readonly running: HandBounceGait;
  readonly runSpeed: number;
  readonly phases: HandBouncePhases;
  /** Ball centre height at the floor contact. */
  readonly floorBallY: number;
}

export interface HandBounceCycle {
  /** Palm target height (world Y). */
  readonly palmY: number;
  /** Ball centre height following the cycle (before it is retargeted to the rendered palm). */
  readonly ballY: number;
  /** 0 to 1: how hard the body works into the push (crouch for a standing handler, waist bend for a runner). */
  readonly effort: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function resolveHandBounceConfig(options: HandBounceOptions = {}): HandBounceConfig {
  const ballRadius = options.ballRadius ?? 0.13;
  const floorY = options.floorY ?? 0;
  return {
    hand: options.hand ?? "right",
    ballRadius,
    floorY,
    armReach: options.armReach ?? 0.55,
    ballGap: options.ballGap ?? 0.09,
    standing: { period: 0.46, palmTop: 1.02, palmPush: 0.62, ...options.standing },
    running: { period: 0.3, palmTop: 0.92, palmPush: 0.6, ...options.running },
    runSpeed: options.runSpeed ?? 0.45,
    phases: { rideEnd: 0.35, palmTurn: 0.6, floorAt: 0.66, catchFrom: 0.92, ...options.phases },
    floorBallY: floorY + ballRadius
  };
}

/** Palm height, ball height and body effort for phase `t` (0..1). `shoulderY` is the live world Y of the dribbling shoulder. */
export function handBounceCycle(config: HandBounceConfig, t: number, shoulderY: number, moving = false): HandBounceCycle {
  const gait = moving ? config.running : config.standing;
  const { rideEnd, palmTurn, floorAt } = config.phases;
  const top = Math.min(config.floorY + gait.palmTop, shoulderY - 0.3);
  const push = Math.max(config.floorY + gait.palmPush, shoulderY - config.armReach);
  const low = push - 0.04;
  let palmY: number;
  let effort: number;
  if (t < rideEnd) {
    const s = t / rideEnd;
    effort = Math.pow(s, 1.6);
    palmY = lerp(top, push, effort);
  } else if (t < palmTurn) {
    const s = (t - rideEnd) / (palmTurn - rideEnd);
    effort = 1;
    palmY = lerp(push, low, 1 - (1 - s) * (1 - s));
  } else {
    const s = (t - palmTurn) / (1 - palmTurn);
    effort = t < floorAt ? 1 : 1 - smoothstep((t - floorAt) / (1 - floorAt));
    palmY = lerp(low, top, smoothstep(s));
  }
  return { palmY, ballY: handBounceBallY(config, t, palmY, push - config.ballGap, top - config.ballGap), effort };
}

/**
 * Ball centre height for phase `t`. `palmY` is the palm the ball rides while in contact (pass the RENDERED palm so the ball
 * cannot leave a hand that could not follow its target); `releaseY` is the ball height when it leaves the palm and `catchY`
 * the height of the palm that receives it. In the air the ball falls to the floor and rebounds, so the bounce point is always
 * `config.floorBallY`.
 */
export function handBounceBallY(config: HandBounceConfig, t: number, palmY: number, releaseY: number, catchY: number): number {
  const { rideEnd, floorAt, catchFrom } = config.phases;
  if (t < rideEnd) return palmY - config.ballGap;
  if (t < floorAt) {
    const s = (t - rideEnd) / (floorAt - rideEnd);
    return lerp(releaseY, config.floorBallY, Math.pow(s, 1.2));
  }
  if (t >= catchFrom) return palmY - config.ballGap;
  const s = (t - floorAt) / (catchFrom - floorAt);
  return lerp(config.floorBallY, catchY, 1 - Math.pow(1 - s, 1.7));
}

/**
 * 1 while the palm is on the ball (riding down, and the catch at the top), 0 while the ball is free in the air. Anything that
 * offsets the ball from the palm (stride lead, outward nudge) is scaled by `1 - weight`, so the ball is glued to the palm at the
 * contact points however fast the handler runs.
 */
export function handBounceContactWeight(config: HandBounceConfig, phase: number): number {
  const { rideEnd, floorAt, catchFrom } = config.phases;
  const t = ((phase % 1) + 1) % 1;
  if (t < rideEnd) return 1;
  if (t < floorAt) return 1 - smoothstep((t - rideEnd) / 0.1);
  if (t < catchFrom) return smoothstep((t - floorAt - 0.1) / (catchFrom - floorAt - 0.1));
  return 1;
}

/** Horizontal ball position: on the palm at contact, drifting ahead with the handler's stride only while the ball is in the air. */
export function handBounceBallXZ(
  config: HandBounceConfig,
  palm: HandBounceVec3,
  holder: { readonly x: number; readonly z: number; readonly vx: number; readonly vz: number },
  phase: number
): { x: number; z: number } {
  const free = 1 - handBounceContactWeight(config, phase);
  const ox = palm[0] - holder.x;
  const oz = palm[2] - holder.z;
  const olen = Math.hypot(ox, oz) || 1;
  return {
    x: palm[0] + (ox / olen) * 0.02 * free + holder.vx * 0.04 * free,
    z: palm[2] + (oz / olen) * 0.02 * free + holder.vz * 0.04 * free
  };
}

/** Clamp a palm target into the arm's reach sphere around the shoulder (a target the arm cannot reach makes the hand miss the ball). */
export function clampPalmReach(shoulder: HandBounceVec3, target: HandBounceVec3, reach: number): [number, number, number] {
  const dx = target[0] - shoulder[0];
  const dy = target[1] - shoulder[1];
  const dz = target[2] - shoulder[2];
  const d = Math.hypot(dx, dy, dz);
  if (d <= reach || d < 1e-9) return [target[0], target[1], target[2]];
  const k = reach / d;
  return [shoulder[0] + dx * k, shoulder[1] + dy * k, shoulder[2] + dz * k];
}

/** Upper-body pitch angles (radians, forward positive) for a handler bouncing the ball: stationary handlers crouch into the push, runners bend at the waist. */
export function handBounceOverlayAngles(effort: number, moving: boolean, leanScale = 1): { spine: number; chest: number; head: number } {
  if (moving) {
    const lean = (1.28 + 0.77 * effort) * leanScale;
    return { spine: lean * 0.55, chest: lean * 0.45, head: -lean * 0.6 };
  }
  return { spine: (0.2 + 0.3 * effort) * leanScale, chest: (0.12 + 0.2 * effort) * leanScale, head: -0.22 };
}

export interface HandBounceOverlayBone {
  /** Pitch about the actor's local X (radians, positive bends forward over the ball). */
  readonly pitch: number;
}

export interface HandBounceOverlay {
  /** "overlay" for a runner (apply on top of the locomotion clip), "pose" for a stationary handler (replace the pose). */
  readonly mode: "overlay" | "pose";
  /** Upper-body bones only. Leg, hip and foot bones are never named, so the clip keeps owning the stride. */
  readonly bones: Readonly<Record<string, HandBounceOverlayBone>>;
  readonly effort: number;
  /** Bone names for the dribbling arm (resolved against `boneNames` when given) for the game's arm solver. */
  readonly arm: { readonly upper: string; readonly forearm: string };
}

export interface HandBounceInput {
  /** Horizontal speed in m/s or an explicit flag. */
  readonly moving?: boolean;
  readonly speed?: number;
  /** World Y of the dribbling shoulder (live from the rig). */
  readonly shoulderY: number;
  /** The palm as rendered this frame, if the rig is live; the ball rides it. Without it the cycle's palm height is used. */
  readonly palm?: HandBounceVec3;
  readonly holder: { readonly x: number; readonly z: number; readonly vx: number; readonly vz: number };
  /** Dead ball (check, inbound): phase is held at the meet and the ball sits in the palm. */
  readonly hold?: boolean;
}

export interface HandBounceFrame {
  readonly phase: number;
  readonly moving: boolean;
  readonly contact: number;
  readonly effort: number;
  readonly palmY: number;
  readonly ball: [number, number, number];
  readonly floorContact: boolean;
}

export interface HandBounceState {
  readonly phase: number;
  readonly moving: boolean;
  readonly contact: number;
  readonly effort: number;
  readonly palmY: number;
  readonly ball: readonly [number, number, number];
  readonly releaseY: number;
  readonly floorContact: boolean;
  readonly active: boolean;
}

export interface HandBounceRelease {
  readonly position: [number, number, number];
  /** Finite-difference velocity of the ball at the hand: hand it to the pass or shot so the ball leaves without a pop. */
  readonly velocity: [number, number, number];
}

export interface HandBounce {
  readonly config: HandBounceConfig;
  /** Advance one fixed step (dt > 0, no wall clock) and place the ball. */
  step(dt: number, input: HandBounceInput): HandBounceFrame;
  state(): HandBounceState;
  /** Palm-free recipe for the body: waist bend, shoulder drop, head. Call after step(). */
  overlay(leanScale?: number): HandBounceOverlay;
  /** Leave the hand: current position and velocity for a pass, shot or drop. Stops the cycle. */
  release(): HandBounceRelease;
  /** Take a loose ball: the cycle resumes at the catch so the palm receives the ball where it is. */
  pickup(ball: HandBounceVec3): void;
  reset(): void;
}

const SIDE_PREFIX = { left: "left", right: "right" } as const;

export function createHandBounce(options: HandBounceOptions = {}): HandBounce {
  const config = resolveHandBounceConfig(options);
  const side = SIDE_PREFIX[config.hand];
  const names = options.boneNames;
  const pick = (role: string, fallback: string): string => (names ? resolveBone(names, role) ?? fallback : fallback);
  const spineName = pick("spine", "Spine");
  const chestName = names ? names.find((n) => /chest/i.test(n) && !/upper/i.test(n)) ?? spineName : "Chest";
  const headName = pick("head", "Head");
  const armUpper = pick(`${side}UpperArm`, config.hand === "left" ? "LeftUpperArm" : "RightUpperArm");
  const armFore = pick(`${side}Forearm`, config.hand === "left" ? "LeftForearm" : "RightForearm");

  let phase = 0;
  let moving = false;
  let releaseY = config.floorBallY + 0.4;
  let active = false;
  let contact = 1;
  let effort = 0;
  let palmY = config.floorY + config.standing.palmTop;
  let ball: [number, number, number] = [0, config.floorBallY, 0];
  let prevBall: [number, number, number] | undefined;
  let lastDt = 1 / 60;
  let floorContact = false;

  const frame = (): HandBounceFrame => ({ phase, moving, contact, effort, palmY, ball: [ball[0], ball[1], ball[2]], floorContact });

  return {
    config,
    step(dt, input) {
      if (!(dt > 0)) throw new Error("createHandBounce.step: dt must be a positive fixed step");
      moving = input.moving ?? (input.speed ?? 0) > config.runSpeed;
      const gait = moving ? config.running : config.standing;
      if (!active) {
        active = true;
        phase = 0;
        prevBall = undefined;
      }
      phase = input.hold ? 0 : (phase + dt / gait.period) % 1;
      const cyc = handBounceCycle(config, phase, input.shoulderY, moving);
      effort = input.hold ? 0 : cyc.effort;
      contact = handBounceContactWeight(config, phase);
      prevBall = [ball[0], ball[1], ball[2]];
      lastDt = dt;
      if (input.palm) {
        const palm = input.palm;
        if (input.hold) {
          ball = [palm[0], palm[1], palm[2]];
        } else {
          const at = handBounceBallXZ(config, palm, input.holder, phase);
          if (phase < config.phases.rideEnd) releaseY = palm[1] - config.ballGap;
          ball = [at.x, handBounceBallY(config, phase, palm[1], releaseY, palm[1] - config.ballGap), at.z];
        }
        palmY = palm[1];
      } else {
        palmY = cyc.palmY;
        ball = [input.holder.x, cyc.ballY, input.holder.z];
      }
      floorContact = ball[1] <= config.floorBallY + 0.02;
      return frame();
    },
    state() {
      return { phase, moving, contact, effort, palmY, ball: [ball[0], ball[1], ball[2]], releaseY, floorContact, active };
    },
    overlay(leanScale = 1) {
      const a = handBounceOverlayAngles(effort, moving, leanScale);
      return {
        mode: moving ? "overlay" : "pose",
        effort,
        bones: { [spineName]: { pitch: a.spine }, [chestName]: { pitch: a.chest }, [headName]: { pitch: a.head } },
        arm: { upper: armUpper, forearm: armFore }
      };
    },
    release() {
      const dt = Math.max(lastDt, 1e-6);
      const p = prevBall ?? ball;
      active = false;
      return {
        position: [ball[0], ball[1], ball[2]],
        velocity: [(ball[0] - p[0]) / dt, (ball[1] - p[1]) / dt, (ball[2] - p[2]) / dt]
      };
    },
    pickup(at) {
      active = true;
      phase = config.phases.catchFrom;
      releaseY = at[1];
      ball = [at[0], at[1], at[2]];
      prevBall = undefined;
    },
    reset() {
      phase = 0;
      active = false;
      moving = false;
      prevBall = undefined;
      ball = [0, config.floorBallY, 0];
    }
  };
}

export interface HandBounceSample {
  readonly phase: number;
  readonly palm: HandBounceVec3;
  readonly ball: HandBounceVec3;
  /** False when the ball is not in dribble state (loose, shot, pass): such samples are skipped. */
  readonly dribbling?: boolean;
}

export interface HandBounceReport {
  readonly samples: number;
  /** Max palm-to-ball distance at the meet and the catch (m). */
  readonly meetMax: number;
  /** Max palm-to-ball distance at the floor contact (m); NaN when no sample touched the floor. */
  readonly floorContactMax: number;
  /** Highest palm height at the floor contact (m above the floor). */
  readonly floorContactPalmHeightMax: number;
  /** Lowest ball centre minus the ball radius over the floor: 0 when the ball bounces exactly on the floor. */
  readonly floorError: number;
  /** Max palm-to-ball distance over every dribble sample. */
  readonly maxDistance: number;
  readonly floorSamples: number;
  readonly meetSamples: number;
}

export interface HandBounceLimits {
  readonly meet: number;
  readonly floorContact: number;
  readonly floorError: number;
  readonly maxDistance: number;
}

/** Limits the Aura Hoops dribble is held to. */
export const DEFAULT_HAND_BOUNCE_LIMITS: HandBounceLimits = { meet: 0.12, floorContact: 0.55, floorError: 0.02, maxDistance: 0.9 };

/** Probe: feed per-frame palm and ball world positions of a dribble; returns the distances the game must keep small. Call it from QA hooks and tools/game-checks. */
export function measureHandBall(
  samples: readonly HandBounceSample[],
  options: HandBounceOptions & { readonly limits?: Partial<HandBounceLimits> } = {}
): HandBounceReport & { readonly ok: boolean; readonly failures: readonly string[] } {
  const config = resolveHandBounceConfig(options);
  const limits = { ...DEFAULT_HAND_BOUNCE_LIMITS, ...options.limits };
  let meetMax = 0;
  let floorMax = Number.NaN;
  let floorPalm = Number.NaN;
  let maxDistance = 0;
  let lowest = Infinity;
  let floorSamples = 0;
  let meetSamples = 0;
  let used = 0;
  for (const s of samples) {
    if (s.dribbling === false) continue;
    used += 1;
    const d = Math.hypot(s.palm[0] - s.ball[0], s.palm[1] - s.ball[1], s.palm[2] - s.ball[2]);
    maxDistance = Math.max(maxDistance, d);
    lowest = Math.min(lowest, s.ball[1]);
    const t = ((s.phase % 1) + 1) % 1;
    if (t < 0.04 || t > config.phases.catchFrom + 0.01) {
      meetMax = Math.max(meetMax, d);
      meetSamples += 1;
    }
    if (s.ball[1] <= config.floorBallY + 0.02) {
      floorMax = Number.isNaN(floorMax) ? d : Math.max(floorMax, d);
      const h = s.palm[1] - config.floorY;
      floorPalm = Number.isNaN(floorPalm) ? h : Math.max(floorPalm, h);
      floorSamples += 1;
    }
  }
  const floorError = used === 0 ? Number.NaN : Math.abs(lowest - config.floorBallY);
  const failures: string[] = [];
  if (used === 0) failures.push("no dribble samples");
  if (meetSamples > 0 && meetMax > limits.meet) failures.push(`palm to ball at the meet ${meetMax.toFixed(3)} m > ${limits.meet} m`);
  if (floorSamples > 0 && floorMax > limits.floorContact) failures.push(`palm to ball at the floor contact ${floorMax.toFixed(3)} m > ${limits.floorContact} m`);
  if (used > 0 && floorError > limits.floorError) failures.push(`ball centre misses the floor by ${floorError.toFixed(3)} m > ${limits.floorError} m`);
  if (maxDistance > limits.maxDistance) failures.push(`ball strays ${maxDistance.toFixed(3)} m from the hand > ${limits.maxDistance} m`);
  return {
    samples: used,
    meetMax,
    floorContactMax: floorMax,
    floorContactPalmHeightMax: floorPalm,
    floorError,
    maxDistance,
    floorSamples,
    meetSamples,
    ok: failures.length === 0,
    failures
  };
}
