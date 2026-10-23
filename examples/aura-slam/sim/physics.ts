/**
 * M-PHYSICS: ball physics for Aura Slam, a thin tennis layer over the library's exact event-time ball flight
 * (`game.racketSports().ballFlight`, extracted from this module's original transcription of public/toptennis/physics.js).
 * Court units: x = 5.018 m, y = 11.885 m, z = 2.177 m. Constants, iteration counts and branch order are unchanged;
 * tests/unit/aura-slam/physics.test.ts replays the original JS against this module (and so against the library kit).
 * Tennis-specific parts that stay here: line calls (singles/service box), PRO power targeting and the venue surfaces.
 */
import { game } from "@aura3d/engine";
import type { PhysicsEventType } from "../contract/events";
import type { PhysicsKit } from "../contract/modules";
import type { BallState, Side, Surface } from "../contract/sim";

// Line calls follow the visible court and enlarged gameplay ball (kept shared with the renderer).
export const COURT = Object.freeze({
  singlesX: 0.82, baselineY: 1, serviceY: 0.52,
  renderX: 5.5, renderY: 8, lineWidth: 0.055, baselineWidth: 0.075, ballRadius: 0.072
});
export const LINE_BOUNDS = Object.freeze({
  singlesX: COURT.singlesX + (COURT.lineWidth / 2 + COURT.ballRadius) / COURT.renderX,
  baselineY: COURT.baselineY + (COURT.baselineWidth / 2 + COURT.ballRadius) / COURT.renderY,
  serviceY: COURT.serviceY + (COURT.lineWidth / 2 + COURT.ballRadius) / COURT.renderY,
  centerX: (COURT.lineWidth / 2 + COURT.ballRadius) / COURT.renderX
});
export const SERVE_MAX_RISE_METRES = 0.5;

interface SurfaceMaterial { readonly rebound: number; readonly retention: number }
const HARD_COURT: SurfaceMaterial = Object.freeze({ rebound: 0.65, retention: 0.79 });
export const SURFACES: Readonly<Record<string, SurfaceMaterial>> = Object.freeze({
  hard: HARD_COURT,
  // Every destination has a regulation hard playing surface and Earth gravity.
  desert: HARD_COURT, beach: HARD_COURT, moon: HARD_COURT,
  grass: { rebound: 0.59, retention: 0.86 },
  clay: { rebound: 0.7, retention: 0.72 }
});

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Ball fields the physics reads/writes. Real engine balls (`BallState`) satisfy it; tests may pass partial balls. */
export type PhysicsBall = Pick<BallState, "x" | "y" | "z" | "vx" | "vy" | "vz"> & Partial<BallState>;

// Collision faces match the rear sponsor panels and padded wall in scene units (render scale 5.5 x 8).
const REAR_BOARDS = [-1, 1].map((side) => ({ x: side * 5.2, y: -9.30, halfWidth: 0.75, height: 0.96, angle: -side * 0.16 }));
REAR_BOARDS.push({ x: 0, y: -10.80, halfWidth: 7.2, height: 0.765, angle: 0 });

const flight = game.racketSports().ballFlight({
  units: { x: 5.018, y: 11.885, z: 2.177 },
  gravity: 9.81,
  drag: 0.09,
  ballRadius: 0.0335,
  net: { centerHeight: 0.914, postHeight: 1.07, halfWidth: 1.08, tapeBand: 0.012, postMargin: 0.007 },
  // Same bounce materials as SURFACES plus the source's rolling resistance (clay 2.4, grass 1.8, otherwise 1.4 m/s^2).
  surfaces: Object.fromEntries(Object.entries(SURFACES).map(([name, material]) => [
    name, { ...material, rollingResistance: name === "clay" ? 2.4 : name === "grass" ? 1.8 : 1.4 }
  ])),
  defaultSurface: "hard",
  boards: { renderScale: { x: 5.5, y: 8 }, contactRadius: 0.072, impulse: 1.55, list: REAR_BOARDS },
  serveMaxRiseMetres: SERVE_MAX_RISE_METRES,
  reboundShaping: (ball) => {
    const slice = ball.shotType === "short";
    const topspin = ball.shotType === "deep";
    return {
      vertical: slice ? 0.72 : topspin ? 1.03 : 1,
      horizontal: slice ? 0.87 : 1,
      // PRO's clean touch loses more energy on the first bounce; the shot marker keeps legacy trajectories unchanged.
      after: slice && (ball.proDrop as number) > 0 ? (b) => {
        const touch = clamp(b.proDrop as number, 0, 1);
        b.vz *= 1 - 0.44 * touch;
        b.vx *= 1 - 0.30 * touch; b.vy *= 1 - 0.30 * touch;
      } : undefined
    };
  }
});

export const GRAVITY = flight.gravity;
export const RADIUS = flight.radius;
export const NET_HEIGHT = flight.netHeightCenter;
export const NET_POST = flight.netHeightPost;
export const NET_X = flight.netHalfWidth;

export const netHeight = flight.netHeight;
export const sample = flight.sample;
export const timeToGround = flight.timeToGround;
export const timeToY = flight.timeToY;
export const landing = flight.landing;
export const speedKph = flight.speedKph;
export const solveShot = flight.solveShot as <T extends PhysicsBall>(ball: T, targetX: number, targetY: number, desiredTime: number, clearance?: number) => T & { flightTime: number };
export const serveTargetNetRisk = flight.serveTargetNetRisk;
export const serveTrajectory = flight.serveTrajectory;
export const rebound = flight.rebound as (ball: PhysicsBall, surface: Surface | string) => void;
export const releaseBall = flight.releaseBall;
export const deflectNet = flight.deflectNet;
export const advance = flight.advance as (ball: PhysicsBall, dt: number, surface: Surface | string, onEvent: (type: PhysicsEventType, ball: BallState) => void) => void;
export const advanceLoose = flight.advanceLoose as (ball: PhysicsBall, dt: number, surface: Surface | string, onBounce?: (ball: BallState) => void) => void;

// Power amplifies imperfect contact toward the selected boundary (a continuous placement error, not a random roll).
export function powerTarget(x: number, y: number, quality: number): { x: number; y: number } {
  const strain = 1 - clamp(quality, 0, 1);
  const lateralRisk = (Math.abs(x) / 0.82) ** 4;
  const depthRisk = (Math.abs(y) / 0.90) ** 4;
  return {
    x: x + Math.sign(x) * (0.012 + 0.16 * strain ** 1.5) * lateralRisk,
    y: y + Math.sign(y) * (0.016 + 0.20 * strain ** 1.5) * depthRisk
  };
}

export function inSingles(ball: PhysicsBall, side: Side): boolean {
  return Math.abs(ball.x) <= LINE_BOUNDS.singlesX &&
    (side === "player" ? ball.y <= 0 && ball.y >= -LINE_BOUNDS.baselineY : ball.y >= 0 && ball.y <= LINE_BOUNDS.baselineY);
}

export function inServiceBox(ball: PhysicsBall, side: Side, serverX: number): boolean {
  // There is no painted service-box boundary at the net: keep the physical crossing allowance there.
  const yTolerance = 0.0335 / 11.885;
  return Math.abs(ball.x) <= LINE_BOUNDS.singlesX && ball.x * Math.sign(serverX) <= LINE_BOUNDS.centerX &&
    (side === "player" ? ball.y <= yTolerance && ball.y >= -LINE_BOUNDS.serviceY : ball.y >= -yTolerance && ball.y <= LINE_BOUNDS.serviceY);
}

/** The module as a `PhysicsKit` (contract) plus the source's extra exports used by strokes/rules. */
export const physics: PhysicsKit & {
  GRAVITY: number; RADIUS: number; NET_HEIGHT: number; NET_POST: number; NET_X: number; COURT: typeof COURT;
  LINE_BOUNDS: typeof LINE_BOUNDS; SERVE_MAX_RISE_METRES: number; SURFACES: typeof SURFACES;
  rebound: typeof rebound; deflectNet: typeof deflectNet; clamp: typeof clamp;
} = {
  GRAVITY, RADIUS, COURT, LINE_BOUNDS, NET_HEIGHT, NET_POST, NET_X, SERVE_MAX_RISE_METRES, SURFACES,
  netHeight, sample, timeToGround, timeToY, landing, speedKph, solveShot, serveTrajectory, serveTargetNetRisk,
  powerTarget, rebound, releaseBall, deflectNet, advanceLoose, advance, inSingles, inServiceBox, clamp
};
