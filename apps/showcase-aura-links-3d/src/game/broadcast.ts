/**
 * broadcast.ts — Aura Links 3D's golf-broadcast camera language (GU47 WP-20
 * LINKS-12, the game's signature effect): the three-shot hole flyover under
 * letterbox bars, the tracer cam on drives, the low cup cam on short putts.
 * Pure planning (no engine, no DOM): main.ts turns the flyover plan into an
 * `app.camera.play()` sequence of E-H rail rigs and drives the tracer and cup
 * cams through its own camera director. Unit tested in
 * tests/unit/aura-links-3d/broadcast.test.ts.
 */
import type { HoleSpec, HoleTerrain, Vec3 } from "./types";

/** One flyover shot: an E-H rail (`rigs.rail`) through `points`, looking at `lookAt`. */
export interface BroadcastShot {
  readonly name: string;
  readonly points: readonly Vec3[];
  readonly lookAt: readonly Vec3[];
  readonly fov: number;
  readonly duration: number;
}

/** Flyover length, seconds (PRD LINKS-12: 4-6 s). */
export const FLYOVER_SECONDS = 4.8;
/** Lowest camera height above the turf anywhere on a broadcast shot (no inside-geometry frames). */
export const BROADCAST_CLEARANCE_M = 2.5;
/** Drives at or beyond this club carry get the tracer cam. */
export const TRACER_CAM_MIN_CARRY_M = 150;
/** Putts from at most this far get the cup cam. */
export const CUP_CAM_MAX_PUTT_M = 8;
/** The 2-degree FOV kick at impact (camera punch; 0 under reduced motion). */
export const IMPACT_FOV_KICK_DEG = 2;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** Lifts a point to at least `clearance` metres above the turf. */
export function aboveTurf(terrain: HoleTerrain, p: Vec3, clearance = BROADCAST_CLEARANCE_M): Vec3 {
  const floor = terrain.height(p[0], p[2]) + clearance;
  return [p[0], Math.max(p[1], floor), p[2]];
}

/** When a flyover plays: never under reduced motion (it becomes a cut), never in QA/still captures or `?flyover=0`. */
export function flyoverAllowed(o: { readonly reducedMotion: boolean; readonly qa: boolean; readonly still: boolean; readonly disabled: boolean }): boolean {
  return !o.reducedMotion && !o.qa && !o.still && !o.disabled;
}

/**
 * The hole flyover: (1) a high establishing glide behind the green looking back down the hole, (2) a fairway pass
 * toward the green, (3) a descent behind the tee onto the opening camera, so the sequence hands over to the address
 * cam without a jump. Every rail point sits at least BROADCAST_CLEARANCE_M above the turf.
 */
export function flyoverShots(terrain: HoleTerrain, hole: HoleSpec): readonly BroadcastShot[] {
  const tee = terrain.tee;
  const cup = terrain.cup;
  const yaw = terrain.lineYaw;
  const dir: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)];
  const side: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const path = hole.layout.path;
  const mid = path[Math.floor(path.length / 2)] ?? [tee[0] + dir[0] * hole.lengthM * 0.5, tee[2] + dir[2] * hole.lengthM * 0.5];
  const midP: Vec3 = [mid[0], terrain.height(mid[0], mid[1]), mid[1]];
  const lift = (p: Vec3) => aboveTurf(terrain, p);

  const establish: BroadcastShot = {
    name: "establish",
    points: [
      lift(add(add(cup, scale(dir, 34)), add(scale(side, -18), [0, 34, 0]))),
      lift(add(add(cup, scale(dir, 26)), add(scale(side, 10), [0, 30, 0])))
    ],
    lookAt: [midP, add(midP, scale(dir, -20))],
    fov: 46,
    duration: 1.6
  };
  const fairway: BroadcastShot = {
    name: "fairway",
    points: [
      lift(add(add(midP, scale(dir, -30)), add(scale(side, 14), [0, 16, 0]))),
      lift(add(add(midP, scale(dir, 30)), add(scale(side, 8), [0, 13, 0])))
    ],
    lookAt: [cup, cup],
    fov: 40,
    duration: 1.8
  };
  // ends on holeOpeningCamera() in main.ts: tee + (-2.0, 5.8, -8.6) looking 40 m down the line
  const open: Vec3 = [tee[0] - 2.0, tee[1] + 5.8, tee[2] - 8.6];
  const openTarget: Vec3 = [tee[0] + dir[0] * 40, tee[1] + 0.5, tee[2] + dir[2] * 40];
  const descend: BroadcastShot = {
    name: "tee",
    points: [lift(add(add(tee, scale(dir, -28)), add(scale(side, -10), [0, 20, 0]))), lift(open)],
    lookAt: [add(tee, scale(dir, 60)), openTarget],
    fov: 40,
    duration: FLYOVER_SECONDS - establish.duration - fairway.duration
  };
  return [establish, fairway, descend];
}

/** Tracer cam on drives at or beyond TRACER_CAM_MIN_CARRY_M (club carry). */
export function wantsTracerCam(o: { readonly putter: boolean; readonly carry: number }): boolean {
  return !o.putter && o.carry >= TRACER_CAM_MIN_CARRY_M;
}

/** Cup cam on putts from CUP_CAM_MAX_PUTT_M or closer. */
export function wantsCupCam(o: { readonly putter: boolean; readonly distanceToCup: number }): boolean {
  return o.putter && o.distanceToCup <= CUP_CAM_MAX_PUTT_M;
}

/**
 * The tracer cam: locked off behind and above the striking position, looking down the shot line toward the ball, the
 * lens tightening as the ball flies out (broadcast "tracer" framing).
 */
export function tracerCamPose(terrain: HoleTerrain, launch: Vec3, shotYaw: number, ball: Vec3): { readonly position: Vec3; readonly target: Vec3; readonly fov: number } {
  const back: Vec3 = [-Math.sin(shotYaw) * 7, 0, -Math.cos(shotYaw) * 7];
  const position = aboveTurf(terrain, [launch[0] + back[0], launch[1] + 2.4, launch[2] + back[2]], 1.6);
  const range = Math.hypot(ball[0] - launch[0], ball[2] - launch[2]);
  const fov = Math.max(18, 38 - range * 0.09);
  return { position, target: ball, fov };
}

/** The cup cam: low behind the cup on the ball-to-cup line, looking back at the rolling ball. */
export function cupCamPose(terrain: HoleTerrain, ball: Vec3): { readonly position: Vec3; readonly target: Vec3; readonly fov: number } {
  const cup = terrain.cup;
  const dx = cup[0] - ball[0], dz = cup[2] - ball[2];
  const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d;
  const px = cup[0] + ux * 1.7, pz = cup[2] + uz * 1.7;
  const position: Vec3 = [px, terrain.height(px, pz) + 0.32, pz];
  return { position, target: [ball[0], terrain.height(ball[0], ball[2]) + 0.06, ball[2]], fov: 34 };
}
