/**
 * Drift & Deliver port: the chase camera, ported from the original's camera function (`Cr`). The follow heading is
 * smoothed, the eye trails the car by 5.9 m + 0.048 x speed (+1.2 m while boosting), the look target leads by
 * 5 m + 0.3 x speed, shake is a two-sine wobble and the field of view opens up with speed and boost. The math lives in
 * the library's `cameras.chase` rig; this file only holds the original's constants.
 */
import { cameras } from "@aura3d/engine";
import { CONFIG } from "./sim";

export interface ChaseInput {
  x: number;
  z: number;
  y: number;
  heading: number;
  speed: number;
  boosting: boolean;
  shake: number;
}

export interface ChaseState {
  /** Smoothed follow heading (`br`). */
  heading: number;
  eye: [number, number, number];
  look: [number, number, number];
  fov: number;
  /** Camera clock used by the shake wobble (`Gr.t`). */
  time: number;
  /** Car-local smoothed chase distance/height/lead so fixed-step car interpolation never fights world-space eye lag. */
  back?: number;
  up?: number;
  lead?: number;
  boostMix?: number;
}

const OFFSET = { back: 5.9, backPerSpeed: 0.048, backBoost: 1.2, up: 2.5, upPerSpeed: 0.013, minAboveGround: 1.9, lead: 5, leadPerSpeed: 0.3, lookUp: 1.25 } as const;
const LAG = { heading: CONFIG.CAMERA_CHASE, headingMinFollow: 0.34, headingFullSpeed: 15, eye: 8, look: 10, fov: 4 } as const;
const RIG_LAG = { heading: LAG.heading, headingMinFollow: LAG.headingMinFollow, headingFullSpeed: LAG.headingFullSpeed, eye: Infinity, look: Infinity, fov: LAG.fov } as const;
const SNAP = { back: 10.6, up: 4.3, lead: 5, lookUp: 1.25, fov: 56 } as const;
/** GU47 WP-28 GC-C2: the shift look's tighter chase (back 5.0, up 2.1, fov 60) so the courier fills 15-20% of the height. */
const SHIFT_OFFSET = { ...OFFSET, back: 5.0, up: 2.1 } as const;
export const SHIFT_FOV = 60;
/** WP-22 closer presentation chase: frames the sculpted cyan courier, roof delivery rack, street canyon, and sunlit blue sky cleanly from frame 0. */
const CLOSE_OFFSET = { back: 4.95, backPerSpeed: 0.022, backBoost: 0.65, up: 2.12, upPerSpeed: 0.006, minAboveGround: 1.82, lead: 4.6, leadPerSpeed: 0.22, lookUp: 1.08 } as const;
const CLOSE_SNAP = { back: 4.95, up: 2.12, lead: 4.6, lookUp: 1.08, fov: 56 } as const;
export const CLOSE_FOV = 56;
const CLOSE_ORIG_OFFSET = { back: 4.95, backPerSpeed: 0.024, backBoost: 0.7, up: 2.22, upPerSpeed: 0.007, minAboveGround: 1.85, lead: 4.6, leadPerSpeed: 0.22, lookUp: 1.08 } as const;
const CLOSE_ORIG_SNAP = { back: 4.95, up: 2.22, lead: 4.6, lookUp: 1.08, fov: 55 } as const;
/** `prefers-reduced-motion`: no shake at all and the speed/nitro field-of-view kick capped at 3 degrees. */
export const REDUCED_FOV_KICK = 3;
const makeRig = (
  offset: { readonly [K in keyof typeof OFFSET]: number },
  base: number,
  calm: boolean,
  snapOffset: { readonly [K in keyof typeof SNAP]: number } = SNAP,
  kick: { readonly perSpeed: number; readonly maxSpeedKick: number; readonly boost: number } = { perSpeed: 0.28, maxSpeedKick: 12, boost: 7 }
) =>
  cameras.chase({
    offset,
    lag: RIG_LAG,
    fovKick: calm ? { base, perSpeed: kick.perSpeed, maxSpeedKick: REDUCED_FOV_KICK, boost: 0 } : { base, ...kick },
    shake: calm
      ? { perShake: 0, speedStart: 22, speedRange: 40, speedAmp: 0, boostAmp: 0, threshold: 2e-3, verticalScale: 0.7, verticalPhase: 1.3, mode: "overlay" }
      : { perShake: 0.9, speedStart: 22, speedRange: 40, speedAmp: 0, boostAmp: 0, threshold: 2e-3, verticalScale: 0.7, verticalPhase: 1.3, mode: "overlay" },
    snapOffset
  });
const CLOSE_KICK = { perSpeed: 0.18, maxSpeedKick: 7, boost: 4 } as const;
const FRAMING_SPECS = {
  original: { offset: OFFSET, snap: SNAP },
  shift: { offset: SHIFT_OFFSET, snap: SNAP },
  close: { offset: CLOSE_OFFSET, snap: CLOSE_SNAP },
  "close-original": { offset: CLOSE_ORIG_OFFSET, snap: CLOSE_ORIG_SNAP }
} as const;
const rigs = {
  original: { full: makeRig(OFFSET, 56, false), calm: makeRig(OFFSET, 56, true) },
  shift: { full: makeRig(SHIFT_OFFSET, SHIFT_FOV, false), calm: makeRig(SHIFT_OFFSET, SHIFT_FOV, true) },
  close: { full: makeRig(CLOSE_OFFSET, CLOSE_FOV, false, CLOSE_SNAP, CLOSE_KICK), calm: makeRig(CLOSE_OFFSET, CLOSE_FOV, true, CLOSE_SNAP, CLOSE_KICK) },
  "close-original": { full: makeRig(CLOSE_ORIG_OFFSET, 55, false, CLOSE_ORIG_SNAP, CLOSE_KICK), calm: makeRig(CLOSE_ORIG_OFFSET, 55, true, CLOSE_ORIG_SNAP, CLOSE_KICK) }
};
for (const set of Object.values(rigs)) {
  set.full.snap({});
  set.calm.snap({});
}
let framing: keyof typeof rigs = "original";
let calm = false;
let rig = rigs.original.full;

/** Switch to the calm rig (no shake, capped FOV kick) for players who ask the OS for reduced motion. */
export function setReducedMotion(on: boolean): void {
  calm = on;
  rig = rigs[framing][calm ? "calm" : "full"];
}
/** GU47 WP-28 GC-C2 / WP-22: "shift" and "original" keep their exact unit-test rigs; "close" frames the live presentation closer. */
export function setChaseFraming(next: "shift" | "original" | "close" | "close-original"): void {
  framing = next;
  rig = rigs[framing][calm ? "calm" : "full"];
}
export const reducedMotion = (): boolean => calm;

const target = (c: ChaseInput, groundAt?: (x: number, z: number) => number) => ({
  position: [c.x, c.y, c.z] as const,
  heading: c.heading,
  speed: c.speed,
  boosting: c.boosting,
  shake: c.shake,
  ...(groundAt ? { groundAt } : {})
});

/** The original's `Dr()`: the snap used after a teleport. */
export function snapChase(c: ChaseInput): ChaseState {
  const p = rig.snap(target(c));
  const s = FRAMING_SPECS[framing].snap;
  return {
    heading: p.heading,
    eye: [...p.eye],
    look: [...p.look],
    fov: p.fov,
    time: p.time,
    back: s.back,
    up: s.up,
    lead: s.lead,
    boostMix: c.boosting ? 1 : 0
  };
}

export function stepChase(cam: ChaseState, c: ChaseInput, dt: number, groundAt: (x: number, z: number) => number = () => 0): void {
  const spec = FRAMING_SPECS[framing];
  const o = spec.offset;
  const s = spec.snap;
  const p = rig.pose;
  p.heading = cam.heading;
  p.eye = [cam.eye[0], cam.eye[1], cam.eye[2]];
  p.look = [cam.look[0], cam.look[1], cam.look[2]];
  p.fov = cam.fov;
  p.time = cam.time;
  const out = rig.step(target(c, groundAt), dt);
  const shakeDx = out.eye[0] - p.eye[0];
  const shakeDy = out.eye[1] - p.eye[1];

  const speed = Math.abs(c.speed);
  const kEye = dt > 0 ? 1 - Math.exp(-LAG.eye * dt) : 0;
  const kLook = dt > 0 ? 1 - Math.exp(-LAG.look * dt) : 0;
  const prevBoost = cam.boostMix ?? (c.boosting ? 1 : 0);
  const boostMix = prevBoost + ((c.boosting ? 1 : 0) - prevBoost) * kEye;
  const wantBack = o.back + o.backPerSpeed * speed + o.backBoost * boostMix;
  const wantUp = o.up + o.upPerSpeed * speed;
  const wantLead = o.lead + o.leadPerSpeed * speed;
  const back = (cam.back ?? s.back) + (wantBack - (cam.back ?? s.back)) * kEye;
  const up = (cam.up ?? s.up) + (wantUp - (cam.up ?? s.up)) * kEye;
  const lead = (cam.lead ?? s.lead) + (wantLead - (cam.lead ?? s.lead)) * kLook;

  const sn = Math.sin(p.heading);
  const cs = Math.cos(p.heading);
  const tx = c.x - sn * back;
  const tz = c.z - cs * back;
  const ey = Math.max(c.y + up, groundAt(tx, tz) + o.minAboveGround);

  cam.heading = p.heading;
  cam.back = back;
  cam.up = up;
  cam.lead = lead;
  cam.boostMix = boostMix;
  cam.eye[0] = tx + shakeDx;
  cam.eye[1] = ey + shakeDy;
  cam.eye[2] = tz;
  cam.look[0] = c.x + sn * lead;
  cam.look[1] = c.y + o.lookUp;
  cam.look[2] = c.z + cs * lead;
  cam.fov = p.fov;
  cam.time = p.time;
}
