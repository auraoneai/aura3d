// apps/showcase-turbo-drift-circuit/src/v2/scene/camera.ts — chase rig (T2.3).
// Route-local AuraCameraRig (G12 stand-in, direction.standIns[] R-14-10):
// §6.9.2 `rigs.chase({ target: "hero-car", framing: { subjectHeightFraction:
// 0.24 }, fov: { base: 60, perSpeed: 8 }, lookAhead: 0.25 })`. Subject comes
// from ctx.subject("racing-player-car"); fov kicks with speed; a collision
// probe keeps the camera out of the ground (ctx.probe where available).
import { camera } from "@aura3d/engine";
import type {
  AuraCameraPose, AuraCameraRig, AuraCameraRigContext, AuraVec3
} from "@aura3d/engine";

export interface TurboRigState {
  /** Live hero speed in route units/s (0 while parked). */
  readonly speed: number;
  /** Hero forward heading in the surface-query convention (radians). */
  readonly heading: number;
  /** True while the finish-camera should ease toward the hero. */
  readonly finishing: boolean;
}

export interface TurboChaseRigOptions {
  /** Distance behind the car (from resolveChaseFraming). */
  readonly distance: number;
  /** Camera height above the car's contact plane. */
  readonly height: number;
  /** Lateral offset for wheel readability. */
  readonly sideOffset: number;
  /** Forward look-ahead along the heading, route units. */
  readonly lookAhead: number;
  /** Certified gameplay max speed for the fov kick. */
  readonly maxSpeed: number;
}

const BASE_FOV = 60;
const PER_SPEED_FOV = 8;
const UP: AuraVec3 = [0, 1, 0];
const GROUND_CLEARANCE = 0.18;

export function createTurboChaseRig(
  state: TurboRigState,
  o: TurboChaseRigOptions
): AuraCameraRig {
  // Smoothed camera position: the chase cam trails the heading, not the car's
  // instantaneous drift angle, or it would snap sideways on every slide.
  let smoothed: AuraVec3 | undefined;
  return {
    id: "turbo-drift.chase",
    reset: () => { smoothed = undefined; },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const car = ctx.subject("racing-player-car");
      const center: AuraVec3 = car?.position ?? [0, 0, 0];
      // Prefer the rendered subject's own scene-space forward; fall back to
      // the sim heading while the subject is still resolving.
      const fx = car?.forward?.[0] ?? 0;
      const fz = car?.forward?.[2] ?? 0;
      const heading = Math.hypot(fx, fz) > 0.01 ? Math.atan2(fz, fx) : state.heading;
      const backX = -Math.cos(heading);
      const backZ = -Math.sin(heading);
      const speedRatio = o.maxSpeed > 0 ? Math.min(1, Math.abs(state.speed) / o.maxSpeed) : 0;
      const finishBlend = state.finishing ? 0.75 : 1;
      const wanted: [number, number, number] = [
        center[0] + backX * o.distance * finishBlend - backZ * o.sideOffset,
        center[1] + o.height,
        center[2] + backZ * o.distance * finishBlend + backX * o.sideOffset
      ];
      if (wanted[1] < GROUND_CLEARANCE) wanted[1] = GROUND_CLEARANCE;
      const blend = Math.min(1, ctx.dt * 8);
      smoothed = smoothed === undefined
        ? wanted
        : [
            smoothed[0] + (wanted[0] - smoothed[0]) * blend,
            smoothed[1] + (wanted[1] - smoothed[1]) * blend,
            smoothed[2] + (wanted[2] - smoothed[2]) * blend
          ];
      return {
        position: smoothed,
        target: [
          center[0] + Math.cos(heading) * o.lookAhead,
          center[1] + o.height * 0.35,
          center[2] + Math.sin(heading) * o.lookAhead
        ],
        up: UP,
        roll: 0,
        fov: BASE_FOV + PER_SPEED_FOV * speedRatio,
        near: 0.05,
        far: 400
      };
    }
  };
}

/** Compiled fallback camera until `app.camera.use(rig)` (C-22) is real. */
export function fallbackTurboCameraNode() {
  return camera.perspective({
    position: [-2.6, 1.15, 0],
    target: [0, 0, 0],
    fov: BASE_FOV
  });
}
