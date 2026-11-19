/**
 * Keeps the chase camera out of solid geometry (owner QA Nov 19: on a sign crash the camera went inside the gantry sign
 * for a moment). The camera rides 5.2 m behind and 3.6 m above the chase anchor; in a wreck the car tumbles on through a
 * gantry or into the vehicle it hit and the camera, following it, used to pass through the sign boards or a truck body.
 *
 * Render-side only: `cameraClearanceLift` returns how far to move the camera (and with it the chase anchor) vertically
 * so that it is never inside a gantry's sign band slab or a vehicle box, and never looks at the car through a sign board.
 * The lift fades in over a few metres, so the camera glides over / under an obstacle instead of popping.
 */
import { SIGN_BAND } from "../native/world";
import { smoothstep01 } from "../native/math";
import { APEX_CHASE_POSE } from "./cinematics";

/** Camera position relative to the chase anchor (world units). */
export const CHASE_CAMERA_UP = APEX_CHASE_POSE.position[1];
export const CHASE_CAMERA_BACK = APEX_CHASE_POSE.position[2];
/** Half depth (z) of the drawn gantry: the Idol frame (3.3 m x 0.6 fit) plus the board and trim faces, with near-plane room. */
export const GANTRY_SLAB_HALF = 1.1 + 0.45;
/** Clearance kept from the sign band's underside / top. */
export const GANTRY_CLEAR = 0.6;
/** Clearance kept over a vehicle roof and around its body. */
export const VEHICLE_CLEAR = 0.55;
const FADE = 4;

export interface ClearanceVehicle {
  x: number;
  z: number;
  w: number;
  h: number;
  l: number;
}

/**
 * Soft target: vertical correction (m) for a camera at `cam` following the car at `car`, given the world z of every
 * drawn gantry and the road vehicles. Positive lifts the camera, negative lowers it. Whenever a gantry stands between
 * the camera and the car (or the camera nears its slab), the camera moves to the side of the sign band the car is on
 * (over it for a sky-lane car, under it for a road car) and, once the car is past the board, far enough that the sight
 * line to the car clears the board edge.
 */
export function cameraClearanceLift(cam: { x: number; y: number; z: number }, car: { y: number; z: number }, gantryZs: readonly number[], vehicles: readonly ClearanceVehicle[] = []): number {
  let y = cam.y;
  const bandLo = SIGN_BAND.minY - GANTRY_CLEAR;
  const bandHi = SIGN_BAND.maxY + GANTRY_CLEAR;
  const mid = (SIGN_BAND.minY + SIGN_BAND.maxY) / 2;
  const aim = car.y + 0.6;
  let weight = 0;
  let lo = bandLo;
  let hi = bandHi;
  for (const gz of gantryZs) {
    if (!(Math.abs(gz) < 1e4)) continue;
    const near = Math.min(cam.z, car.z) - GANTRY_SLAB_HALF;
    const far = Math.max(cam.z, car.z) + GANTRY_SLAB_HALF;
    const outside = gz < near ? near - gz : gz > far ? gz - far : 0;
    if (outside >= FADE) continue;
    weight = Math.max(weight, smoothstep01(1 - outside / FADE));
    const span = cam.z - car.z;
    const f = span > 0.5 ? (cam.z - gz) / span : 0;
    if (f <= 0) continue;
    // the car is past the board: ease in the height the sight line needs to pass over / under the board edge
    const past = smoothstep01(Math.min(1, Math.max(0, (gz - car.z) / 2.5)));
    const fe = Math.min(f, 0.75);
    // ...but never so high that the car drops out of the bottom of the frame (the rig looks 15 deg down, 27.5 deg half fov)
    const hiReq = Math.min(MAX_OVER_BAND, aim + MAX_ABOVE_CAR, (SIGN_BAND.maxY + 0.2 - aim * fe) / (1 - fe));
    const loReq = Math.max(0.8, (SIGN_BAND.minY - 0.2 - aim * fe) / (1 - fe));
    hi = Math.max(hi, bandHi + (Math.max(bandHi, hiReq) - bandHi) * past);
    lo = Math.min(lo, bandLo + (Math.min(bandLo, loReq) - bandLo) * past);
  }
  // a car anywhere in (or over) the band is watched from above the band; a car under it, from under it
  if (weight > 0 && y > lo && y < hi) y += ((aim > SIGN_BAND.minY ? hi : lo) - y) * weight;
  return y + vehicleLift(cam.x, y, cam.z, vehicles, 4) - cam.y;
}

/** Highest the sight-line rule lifts the camera (m): any higher and the car drops out of the bottom of the frame. */
const MAX_OVER_BAND = 13.5;
/** Highest the camera may sit over the car's centre 5.2 m ahead and still frame it. */
const MAX_ABOVE_CAR = 4.3;

function vehicleLift(x: number, y: number, z: number, vehicles: readonly ClearanceVehicle[], fade: number): number {
  let lift = 0;
  for (const v of vehicles) {
    if (Math.abs(x - v.x) > v.w / 2 + VEHICLE_CLEAR) continue;
    const roof = v.h + VEHICLE_CLEAR;
    if (y >= roof) continue;
    const dz = Math.abs(z - v.z) - (v.l / 2 + VEHICLE_CLEAR);
    if (dz >= fade) continue;
    const k = dz <= 0 ? 1 : smoothstep01(1 - dz / fade);
    lift = Math.max(lift, (roof - y) * k);
  }
  return lift;
}

/** Hard constraint (no easing): the smallest vertical move that takes the camera out of a gantry slab's band or a vehicle. */
export function cameraHardClearance(cam: { x: number; y: number; z: number }, gantryZs: readonly number[], vehicles: readonly ClearanceVehicle[] = []): number {
  let y = cam.y;
  const bandLo = SIGN_BAND.minY - GANTRY_CLEAR;
  const bandHi = SIGN_BAND.maxY + GANTRY_CLEAR;
  for (const gz of gantryZs) {
    if (!(Math.abs(gz) < 1e4) || Math.abs(cam.z - gz) >= GANTRY_SLAB_HALF) continue;
    if (y > bandLo && y < bandHi) y = y - bandLo < bandHi - y ? bandLo : bandHi;
  }
  return y + vehicleLift(cam.x, y, cam.z, vehicles, 0) - cam.y;
}

/**
 * The chase camera's clearance state: eases toward `cameraClearanceLift` (so a side change or a sight-line lift glides
 * instead of popping) and then applies `cameraHardClearance`, so the eased camera can never be inside a sign or a car.
 */
export function createCameraClearance(): { update(cam: { x: number; y: number; z: number }, car: { y: number; z: number }, gantryZs: readonly number[], vehicles: readonly ClearanceVehicle[], dt: number): number } {
  let lift = 0;
  return {
    update(cam, car, gantryZs, vehicles, dt) {
      const target = cameraClearanceLift(cam, car, gantryZs, vehicles);
      lift = dt > 0 && dt < 0.5 ? lift + (target - lift) * (1 - Math.exp(-18 * dt)) : target;
      const eased = { x: cam.x, y: cam.y + lift, z: cam.z };
      return lift + cameraHardClearance(eased, gantryZs, vehicles);
    }
  };
}

/**
 * QA check used by the tests: why the camera is "inside" geometry, or null. Inside a drawn gantry slab within the sign
 * band, pressed against a sign board face (level with the band, within 0.5 m of the slab, the board filling the frame),
 * or inside a vehicle box.
 */
export function cameraInsideGeometry(cam: { x: number; y: number; z: number }, _car: { x: number; y: number; z: number }, gantryZs: readonly number[], vehicles: readonly ClearanceVehicle[] = []): string | null {
  for (const gz of gantryZs) {
    if (!(Math.abs(gz) < 1e4) || cam.y <= SIGN_BAND.minY - 0.25 || cam.y >= SIGN_BAND.maxY + 0.25) continue;
    const dz = Math.abs(cam.z - gz);
    if (dz < 1.1 + 0.25) return `inside gantry at z ${gz.toFixed(1)}`;
    if (dz < GANTRY_SLAB_HALF + 0.5) return `pressed against the sign board at z ${gz.toFixed(1)}`;
  }
  for (const v of vehicles) {
    if (Math.abs(cam.x - v.x) < v.w / 2 + 0.2 && cam.y < v.h + 0.2 && Math.abs(cam.z - v.z) < v.l / 2 + 0.25) return `inside vehicle at z ${v.z.toFixed(1)}`;
  }
  return null;
}
