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
}

const OFFSET = { back: 5.9, backPerSpeed: 0.048, backBoost: 1.2, up: 2.5, upPerSpeed: 0.013, minAboveGround: 1.9, lead: 5, leadPerSpeed: 0.3, lookUp: 1.25 } as const;
const LAG = { heading: CONFIG.CAMERA_CHASE, headingMinFollow: 0.34, headingFullSpeed: 15, eye: 8, look: 10, fov: 4 } as const;
const SNAP = { back: 10.6, up: 4.3, lead: 5, lookUp: 1.25, fov: 56 } as const;
/** GU47 WP-28 GC-C2: the shift look's tighter chase (back 5.0, up 2.1, fov 60) so the courier fills 15-20% of the height. */
const SHIFT_OFFSET = { ...OFFSET, back: 5.0, up: 2.1 } as const;
export const SHIFT_FOV = 60;
/** `prefers-reduced-motion`: no shake at all and the speed/nitro field-of-view kick capped at 3 degrees. */
export const REDUCED_FOV_KICK = 3;
const makeRig = (offset: { readonly [K in keyof typeof OFFSET]: number }, base: number, calm: boolean) =>
  cameras.chase({
    offset,
    lag: LAG,
    fovKick: calm ? { base, perSpeed: 0.28, maxSpeedKick: REDUCED_FOV_KICK, boost: 0 } : { base, perSpeed: 0.28, maxSpeedKick: 12, boost: 7 },
    shake: calm
      ? { perShake: 0, speedStart: 22, speedRange: 40, speedAmp: 0, boostAmp: 0, threshold: 2e-3, verticalScale: 0.7, verticalPhase: 1.3, mode: "accumulate" }
      : { perShake: 0.9, speedStart: 22, speedRange: 40, speedAmp: 0.075, boostAmp: 0.05, threshold: 2e-3, verticalScale: 0.7, verticalPhase: 1.3, mode: "accumulate" },
    snapOffset: SNAP
  });
const rigs = {
  original: { full: makeRig(OFFSET, 56, false), calm: makeRig(OFFSET, 56, true) },
  shift: { full: makeRig(SHIFT_OFFSET, SHIFT_FOV, false), calm: makeRig(SHIFT_OFFSET, SHIFT_FOV, true) }
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
/** GU47 WP-28 GC-C2: "shift" takes the tighter chase framing; "original" keeps the 4.6.1 rig (default). */
export function setChaseFraming(next: "shift" | "original"): void {
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
  return { heading: p.heading, eye: [...p.eye], look: [...p.look], fov: p.fov, time: p.time };
}

export function stepChase(cam: ChaseState, c: ChaseInput, dt: number, groundAt: (x: number, z: number) => number = () => 0): void {
  const p = rig.pose;
  p.heading = cam.heading;
  p.eye = [cam.eye[0], cam.eye[1], cam.eye[2]];
  p.look = [cam.look[0], cam.look[1], cam.look[2]];
  p.fov = cam.fov;
  p.time = cam.time;
  rig.step(target(c, groundAt), dt);
  cam.heading = p.heading;
  cam.eye[0] = p.eye[0]; cam.eye[1] = p.eye[1]; cam.eye[2] = p.eye[2];
  cam.look[0] = p.look[0]; cam.look[1] = p.look[1]; cam.look[2] = p.look[2];
  cam.fov = p.fov;
  cam.time = p.time;
}
