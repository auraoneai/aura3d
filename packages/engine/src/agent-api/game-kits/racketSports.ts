import type { AuraRuntimeNodeHandle } from "../index";
import { racketAthleteRig, type RacketAthleteRigKit } from "./racketAthleteRig";
import { directionToEulerXYZ, localDirToWorld, localToWorld, orientCylinderBetween, solveArmElbow, type RacketVec3 } from "./racketGeometry";
import { createBallFlight, type BallFlightConfig, type BallFlightKit } from "./ballFlight";
import { createRacketScoring, type RacketScoring, type RacketScoringRules } from "./racketScoring";

export * from "./racketScoring";
export { createBallFlight };
export type { BallFlightBall, BallFlightBoard, BallFlightConfig, BallFlightEventType, BallFlightKit, BallFlightSample, BallFlightSurface } from "./ballFlight";

export { directionToEulerXYZ, localDirToWorld, localToWorld, orientCylinderBetween, solveArmElbow, type RacketVec3 };

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
  /** Procedural athlete rig: stride/split-step/slide locomotion solver and a limb applicator (see racketAthleteRig). */
  readonly athleteRig: RacketAthleteRigKit;
  /**
   * Exact event-time ball flight (x lateral, y along the court, z up). Configure units, gravity, drag, net,
   * surfaces and optional boards; returns pure sample/solve/advance functions. See docs/api/ball-flight.md.
   */
  ballFlight(config: BallFlightConfig): BallFlightKit;
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
    scoring: createRacketScoring,
    athleteRig: racketAthleteRig,
    ballFlight: createBallFlight
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
  scoring: createRacketScoring,
  athleteRig: racketAthleteRig,
  ballFlight: createBallFlight
} as const;
