import type { AuraRuntimeNodeHandle } from "../index";
import { createRacketScoring, type RacketScoring, type RacketScoringRules } from "./racketScoring";

export * from "./racketScoring";

export type RacketVec3 = readonly [number, number, number];

export interface RacketBallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Topspin (+) or backspin (-) in rad/s */
  topspin: number;
  /** Sidespin in rad/s */
  sidespin: number;
}

export interface RacketSurfacePhysicsOptions {
  /** Gravity acceleration in m/s² (default 9.81, or 1.62 for lunar court) */
  readonly gravity?: number;
  /** Aerodynamic drag coefficient (default 0.12) */
  readonly airDrag?: number;
  /** Magnus lift coefficient for topspin/backspin/sidespin (default 0.085) */
  readonly magnusFactor?: number;
  /** Vertical restitution on court bounce (default 0.75; clay ~0.82, grass ~0.68) */
  readonly bounceRestitution?: number;
  /** Horizontal friction loss on court bounce (default 0.84; clay ~0.76, grass ~0.91) */
  readonly surfacePaceRetention?: number;
  /** Ball radius in metres (default 0.034) */
  readonly ballRadius?: number;
  /** Net height at center (default 0.914) */
  readonly netCenterHeight?: number;
  /** Net height at posts (default 1.07) */
  readonly netPostHeight?: number;
  /** Net half-width (default 5.94) */
  readonly netHalfWidth?: number;
}

export interface RacketBallStepEvents {
  readonly bouncedOnCourt: boolean;
  readonly hitNet: boolean;
}

export interface RacketSportsGameKit {
  readonly id: string;
  directionToEulerXYZ(dx: number, dy: number, dz: number): [number, number, number];
  orientCylinderBetween(
    handle: AuraRuntimeNodeHandle | undefined,
    a: RacketVec3,
    b: RacketVec3,
    radiusX: number,
    radiusZ?: number
  ): void;
  solveArmElbow(
    shoulder: RacketVec3,
    hand: RacketVec3,
    sideSign: number,
    upperLen?: number,
    lowerLen?: number
  ): [number, number, number];
  localToWorld(rootPos: RacketVec3, yaw: number, scale: RacketVec3, local: RacketVec3): [number, number, number];
  localDirToWorld(yaw: number, dir: RacketVec3): [number, number, number];
  stepBallPhysics(
    dt: number,
    ball: RacketBallState,
    surface?: RacketSurfacePhysicsOptions
  ): RacketBallStepEvents;
  /** Pure game/match/tiebreak scoring state machine; defaults to the Aura Slam tennis rules. */
  scoring(rules?: RacketScoringRules): RacketScoring;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function directionToEulerXYZ(dx: number, dy: number, dz: number): [number, number, number] {
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  const rx = Math.asin(clamp(uz, -1, 1));
  const ry = 0;
  const rz = Math.atan2(-ux, uy);
  return [rx, ry, rz];
}

export function orientCylinderBetween(
  handle: AuraRuntimeNodeHandle | undefined,
  a: RacketVec3,
  b: RacketVec3,
  radiusX: number,
  radiusZ = radiusX
): void {
  if (!handle) return;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.max(0.001, Math.hypot(dx, dy, dz));
  const mid: [number, number, number] = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
  const rot = directionToEulerXYZ(dx, dy, dz);
  handle
    .setPosition(mid[0], mid[1], mid[2])
    .setRotation(rot[0], rot[1], rot[2])
    .setScale([radiusX, len, radiusZ])
    .setVisible(true);
}

export function solveArmElbow(
  shoulder: RacketVec3,
  hand: RacketVec3,
  sideSign: number,
  upperLen = 0.3,
  lowerLen = 0.285
): [number, number, number] {
  const sx = hand[0] - shoulder[0];
  const sy = hand[1] - shoulder[1];
  const sz = hand[2] - shoulder[2];
  const dist = Math.max(0.001, Math.hypot(sx, sy, sz));
  const wx = sx / dist;
  const wy = sy / dist;
  const wz = sz / dist;
  let bx = sideSign * 0.8;
  let by = -0.45;
  let bz = 0.9;
  const dot = bx * wx + by * wy + bz * wz;
  bx -= wx * dot;
  by -= wy * dot;
  bz -= wz * dot;
  const bLen = Math.hypot(bx, by, bz) || 1;
  bx /= bLen;
  by /= bLen;
  bz /= bLen;
  const along = (upperLen * upperLen - lowerLen * lowerLen + dist * dist) / (2 * dist);
  const bend = Math.sqrt(Math.max(0, upperLen * upperLen - along * along));
  return [
    shoulder[0] + wx * along + bx * bend,
    shoulder[1] + wy * along + by * bend,
    shoulder[2] + wz * along + bz * bend
  ];
}

export function localToWorld(
  rootPos: RacketVec3,
  yaw: number,
  scale: RacketVec3,
  local: RacketVec3
): [number, number, number] {
  const sx = local[0] * scale[0];
  const sy = local[1] * scale[1];
  const sz = local[2] * scale[2];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [
    rootPos[0] + sx * c + sz * s,
    rootPos[1] + sy,
    rootPos[2] - sx * s + sz * c
  ];
}

export function localDirToWorld(yaw: number, dir: RacketVec3): [number, number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [dir[0] * c + dir[2] * s, dir[1], -dir[0] * s + dir[2] * c];
}

export function stepRacketBallPhysics(
  dt: number,
  ball: RacketBallState,
  surface: RacketSurfacePhysicsOptions = {}
): RacketBallStepEvents {
  const gravity = surface.gravity ?? 9.81;
  const airDrag = surface.airDrag ?? 0.12;
  const magnusFactor = surface.magnusFactor ?? 0.085;
  const bounceRestitution = surface.bounceRestitution ?? 0.75;
  const surfacePaceRetention = surface.surfacePaceRetention ?? 0.84;
  const ballRadius = surface.ballRadius ?? 0.034;
  const netCenterHeight = surface.netCenterHeight ?? 0.914;
  const netPostHeight = surface.netPostHeight ?? 1.07;
  const netHalfWidth = surface.netHalfWidth ?? 5.94;

  const prevZ = ball.z;
  const drag = Math.exp(-airDrag * dt);
  ball.vx *= drag;
  ball.vz *= drag;

  // Magnus effect: topspin dips the ball downward, backspin floats it upward, sidespin curves X
  const speedHoriz = Math.hypot(ball.vx, ball.vz);
  const magnusAccelY = -ball.topspin * magnusFactor * Math.min(1.4, speedHoriz * 0.08);
  const magnusAccelX = ball.sidespin * magnusFactor * Math.min(1.2, speedHoriz * 0.06);

  ball.vx += magnusAccelX * dt;
  ball.vy += (-gravity + magnusAccelY) * dt;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;

  let hitNet = false;
  if ((prevZ < 0 && ball.z >= 0) || (prevZ > 0 && ball.z <= 0)) {
    const netRatio = Math.min(1, Math.abs(ball.x) / Math.max(0.1, netHalfWidth));
    const netHeightAtX = netCenterHeight + (netPostHeight - netCenterHeight) * (netRatio * netRatio);
    if (ball.y - ballRadius < netHeightAtX && Math.abs(ball.x) <= netHalfWidth) {
      hitNet = true;
      ball.vz = -ball.vz * 0.28;
      ball.vx *= 0.55;
      ball.z = prevZ < 0 ? -ballRadius : ballRadius;
    }
  }

  let bouncedOnCourt = false;
  if (ball.y <= ballRadius) {
    ball.y = ballRadius;
    if (ball.vy < -0.15) {
      bouncedOnCourt = true;
      ball.vy = Math.abs(ball.vy) * bounceRestitution;
      // Topspin kicks forward on bounce; backspin checks up
      const forwardSign = ball.vz >= 0 ? 1 : -1;
      ball.vz = ball.vz * surfacePaceRetention + forwardSign * ball.topspin * 0.045;
      ball.vx = ball.vx * surfacePaceRetention + ball.sidespin * 0.03;
      ball.topspin *= 0.65;
      ball.sidespin *= 0.65;
    } else {
      ball.vy = 0;
    }
  }

  return { bouncedOnCourt, hitNet };
}

export function createRacketSportsGameKit(id = "racket-sports"): RacketSportsGameKit {
  return {
    id,
    directionToEulerXYZ,
    orientCylinderBetween,
    solveArmElbow,
    localToWorld,
    localDirToWorld,
    stepBallPhysics: stepRacketBallPhysics,
    scoring: createRacketScoring
  };
}

export const racketSports = {
  create: createRacketSportsGameKit,
  directionToEulerXYZ,
  orientCylinderBetween,
  solveArmElbow,
  localToWorld,
  localDirToWorld,
  stepBallPhysics: stepRacketBallPhysics,
  scoring: createRacketScoring
} as const;
