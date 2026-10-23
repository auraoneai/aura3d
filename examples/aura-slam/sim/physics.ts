/**
 * M-PHYSICS: faithful TypeScript transcription of public/toptennis/physics.js (deterministic ball physics).
 * Court units: x = 5.018 m, y = 11.885 m, z = 2.177 m. Every constant, iteration count and branch order is
 * preserved from the source; behaviour is checked against the original by tests/unit/aura-slam/physics.test.ts.
 */
import type { PhysicsEventType } from "../contract/events";
import type { PhysicsKit } from "../contract/modules";
import type { BallState, Side, Surface } from "../contract/sim";

export const GRAVITY = 9.81 / 2.177;
export const RADIUS = 0.0335 / 2.177;

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
export const NET_HEIGHT = 0.914 / 2.177;
export const NET_POST = 1.07 / 2.177;
export const NET_X = 1.08;
const DRAG = 0.09;
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

export const netHeight = (x: number): number => NET_HEIGHT + (NET_POST - NET_HEIGHT) * Math.min(1, (x / NET_X) ** 2);
const travelFactor = (t: number): number => -Math.expm1(-DRAG * t) / DRAG;

export function sample(ball: PhysicsBall, t: number): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
  const factor = travelFactor(t);
  const decay = Math.exp(-DRAG * t);
  return {
    x: ball.x + ball.vx * factor, y: ball.y + ball.vy * factor,
    z: ball.z + ball.vz * t - GRAVITY * t * t / 2,
    vx: ball.vx * decay, vy: ball.vy * decay, vz: ball.vz - GRAVITY * t
  };
}

export function timeToGround(ball: Pick<BallState, "z" | "vz">): number {
  return Math.max(0, (ball.vz + Math.sqrt(ball.vz ** 2 + 2 * GRAVITY * Math.max(0, ball.z - RADIUS))) / GRAVITY);
}

export function timeToY(ball: PhysicsBall, y: number): number {
  if (Math.abs(ball.vy) < 1e-9) return Infinity;
  const q = (y - ball.y) / ball.vy;
  return q >= 0 && q * DRAG < 1 ? -Math.log1p(-q * DRAG) / DRAG : Infinity;
}

export function landing(ball: PhysicsBall): { x: number; y: number; z: number; vx: number; vy: number; vz: number; time: number } {
  const time = timeToGround(ball);
  return { ...sample(ball, time), z: RADIUS, time };
}

export function speedKph(ball: PhysicsBall): number {
  return Math.round(Math.hypot(ball.vx * 5.018, ball.vy * 11.885, ball.vz * 2.177) * 3.6);
}

export function solveShot(ball: BallState, targetX: number, targetY: number, desiredTime: number, clearance = 0.065): BallState & { flightTime: number } {
  let time = Math.max(0.28, desiredTime);
  let solution: BallState;
  for (let i = 0; i < 140; i++, time += 0.025) {
    solution = {
      ...ball, vx: (targetX - ball.x) / travelFactor(time),
      vy: (targetY - ball.y) / travelFactor(time),
      vz: (RADIUS - ball.z + GRAVITY * time * time / 2) / time
    };
    const crossingTime = timeToY(solution, 0);
    if (crossingTime >= time) return { ...solution, flightTime: time };
    const crossing = sample(solution, crossingTime);
    if (crossing.z - RADIUS >= netHeight(crossing.x) + clearance) return { ...solution, flightTime: time };
  }
  throw new Error("Unable to construct a playable trajectory");
}

function serveFlight(ball: PhysicsBall, targetX: number, targetY: number, time: number): { vx: number; vy: number; vz: number; flightTime: number } {
  return {
    vx: (targetX - ball.x) / travelFactor(time), vy: (targetY - ball.y) / travelFactor(time),
    vz: (RADIUS - ball.z + GRAVITY * time * time / 2) / time, flightTime: time
  };
}

function serveFlightLimit(ball: Pick<BallState, "z">): number {
  return timeToGround({ z: ball.z, vz: Math.sqrt(2 * GRAVITY * SERVE_MAX_RISE_METRES / 2.177) });
}

function serveClearance(ball: PhysicsBall, targetX: number, targetY: number, time: number): number {
  const shot = { ...ball, ...serveFlight(ball, targetX, targetY, time) };
  const crossingTime = timeToY(shot, 0);
  if (!Number.isFinite(crossingTime) || crossingTime >= time - 1e-9) return -Infinity;
  const crossing = sample(shot, crossingTime);
  return (crossing.z - RADIUS - netHeight(crossing.x)) * 2.177;
}

// A cheap preview uses the same highest permitted arc as the launch solver.
export function serveTargetNetRisk(ball: PhysicsBall, targetX: number, targetY: number, clearanceMetres = 0.08): boolean {
  return serveClearance(ball, targetX, targetY, serveFlightLimit(ball as Pick<BallState, "z">)) < clearanceMetres;
}

// Serves ask for a measured launch speed. Find the fastest trajectory that respects both that request and the net.
export function serveTrajectory(
  ball: PhysicsBall, targetX: number, targetY: number, requestedKph: number,
  clearanceMetres = 0.08, errorXMetres = 0, errorYMetres = 0
): { vx: number; vy: number; vz: number; flightTime: number; targetX: number; targetY: number; netRisk: boolean; paceLimited: boolean } {
  const at = (time: number) => serveFlight(ball, targetX, targetY, time);
  const speed = (shot: { vx: number; vy: number; vz: number }) => Math.hypot(shot.vx * 5.018, shot.vy * 11.885, shot.vz * 2.177) * 3.6;
  const maximumTime = serveFlightLimit(ball as Pick<BallState, "z">);
  let low = 0.08, high = Math.min(1.2, maximumTime);
  for (let i = 0; i < 36; i++) { const t = (low + high) / 2; if (speed(at(t)) > requestedKph) low = t; else high = t; }
  const requestedTime = high;
  const clearance = (time: number) => serveClearance(ball, targetX, targetY, time);
  let time = requestedTime, netRisk = false;
  if (clearance(time) < clearanceMetres) {
    // As a target approaches the net, settle on the bounded arc instead of switching back to a fast net fault.
    if (clearance(maximumTime) < clearanceMetres) { time = maximumTime; netRisk = true; }
    else {
      low = time; high = maximumTime;
      for (let i = 0; i < 36; i++) { const t = (low + high) / 2; if (clearance(t) < clearanceMetres) low = t; else high = t; }
      time = high;
    }
  }
  const shot = at(time);
  // Timing changes the physical trajectory after selecting its safe base arc; keep flight time.
  targetX += errorXMetres / 5.018; targetY += errorYMetres / 11.885;
  shot.vx = (targetX - ball.x) / travelFactor(time); shot.vy = (targetY - ball.y) / travelFactor(time);
  return { ...shot, targetX, targetY, netRisk, paceLimited: speed(shot) < requestedKph - 1 };
}

export function rebound(ball: PhysicsBall, surface: Surface | string): void {
  const material = SURFACES[surface] || SURFACES.hard!;
  const slice = ball.shotType === "short";
  const topspin = ball.shotType === "deep";
  ball.z = RADIUS;
  ball.vz = Math.abs(ball.vz) * material.rebound * (slice ? 0.72 : topspin ? 1.03 : 1);
  ball.vx *= material.retention * (slice ? 0.87 : 1);
  ball.vy *= material.retention * (slice ? 0.87 : 1);
  // PRO's clean touch loses more energy on the first bounce; the shot marker keeps legacy trajectories unchanged.
  if (slice && (ball.proDrop as number) > 0) {
    const touch = clamp(ball.proDrop as number, 0, 1);
    ball.vz *= 1 - 0.44 * touch;
    ball.vx *= 1 - 0.30 * touch; ball.vy *= 1 - 0.30 * touch;
  }
  ball.bounceCount = (ball.bounceCount as number) + 1;
}

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

// A dead ball still has momentum; scoring and visible motion are separate.
export function releaseBall(ball: PhysicsBall): void {
  ball.active = false;
  ball.dead = true;
  ball.settling = true;
  ball.rolling = false;
}

export function deflectNet(ball: PhysicsBall): void {
  const incoming = Math.sign(ball.vy) || (ball.y > 0 ? -1 : 1);
  ball.y = -incoming * 0.01;
  ball.vx *= 0.35;
  ball.vy = -incoming * Math.min(0.45, Math.abs(ball.vy) * 0.16);
  ball.vz = Math.min(0, ball.vz * 0.25);
  ball.netTouched = true;
}

// Collision faces match the rear sponsor panels and padded wall in scene units; convert only at the boundary.
interface RearBoard { x: number; y: number; halfWidth: number; height: number; angle: number }
const REAR_BOARDS: RearBoard[] = [-1, 1].map((side) => ({ x: side * 5.2, y: -9.30, halfWidth: 0.75, height: 0.96, angle: -side * 0.16 }));
REAR_BOARDS.push({ x: 0, y: -10.80, halfWidth: 7.2, height: 0.765, angle: 0 });

interface BoardHit { time: number; nx?: number; ny?: number }
const defaultTimeFromFactor = (q: number): number => (q >= 0 && q * DRAG < 1 ? -Math.log1p(-q * DRAG) / DRAG : Infinity);

function boardImpact(ball: PhysicsBall, timeFromFactor: (q: number) => number = defaultTimeFromFactor): BoardHit {
  let hit: BoardHit = { time: Infinity };
  for (const board of REAR_BOARDS) {
    const nx = Math.sin(board.angle), ny = Math.cos(board.angle);
    const distance = (ball.x * 5.5 - board.x) * nx + (ball.y * 8 - board.y) * ny - 0.072;
    const velocity = ball.vx * 5.5 * nx + ball.vy * 8 * ny;
    if (distance < -1e-7 || velocity >= -1e-9) continue;
    const q = Math.max(0, -distance / velocity), time = timeFromFactor(q);
    if (!Number.isFinite(time) || time >= hit.time) continue;
    const x = ball.x * 5.5 + ball.vx * 5.5 * q - board.x, y = ball.y * 8 + ball.vy * 8 * q - board.y;
    const z = ball.rolling ? RADIUS : ball.z + ball.vz * time - GRAVITY * time * time / 2;
    if (Math.abs(x * ny - y * nx) > board.halfWidth + 0.072 || z * 2.177 < -0.072 || z * 2.177 > board.height + 0.072) continue;
    hit = { time, nx, ny };
  }
  return hit;
}

function deflectBoard(ball: PhysicsBall, hit: BoardHit): void {
  let vx = ball.vx * 5.5, vy = ball.vy * 8;
  const normal = vx * hit.nx! + vy * hit.ny!;
  vx -= 1.55 * normal * hit.nx!; vy -= 1.55 * normal * hit.ny!;
  ball.vx = vx / 5.5; ball.vy = vy / 8;
  ball.x += hit.nx! * 1e-6 / 5.5; ball.y += hit.ny! * 1e-6 / 8;
}

export function advanceLoose(ball: PhysicsBall, dt: number, surface: Surface | string, onBounce: (ball: BallState) => void = () => {}): void {
  let remaining = dt;
  const material = SURFACES[surface] || SURFACES.hard!;
  while (ball.settling && remaining > 1e-9) {
    if (ball.rolling) {
      // Constant rolling resistance in metres, not differently scaled x/y court units. Exact stopping time.
      const speed = Math.hypot(ball.vx * 5.018, ball.vy * 11.885);
      const resistance = surface === "clay" ? 2.4 : surface === "grass" ? 1.8 : 1.4;
      const distanceToNet = Math.abs(ball.vy) > 1e-9 ? -ball.y / ball.vy * speed : -1;
      const netTime = distanceToNet > 0 && distanceToNet <= speed * speed / (2 * resistance)
        ? (speed - Math.sqrt(Math.max(0, speed * speed - 2 * resistance * distanceToNet))) / resistance : Infinity;
      const board = boardImpact(ball, (q) => q * speed <= speed * speed / (2 * resistance)
        ? (speed - Math.sqrt(Math.max(0, speed * speed - 2 * resistance * q * speed))) / resistance : Infinity);
      const time = Math.min(remaining, speed / resistance, netTime, board.time);
      const distanceFactor = speed > 1e-9 ? time - resistance * time * time / (2 * speed) : 0;
      ball.x += ball.vx * distanceFactor; ball.y += ball.vy * distanceFactor;
      const fraction = speed > 1e-9 ? Math.max(0, 1 - resistance * time / speed) : 0;
      ball.vx *= fraction; ball.vy *= fraction; ball.z = RADIUS; ball.vz = 0;
      remaining -= time;
      if (fraction < 1e-9) { ball.vx = 0; ball.vy = 0; ball.settling = false; }
      if (board.time <= time + 1e-9 && ball.settling) { deflectBoard(ball, board); continue; }
      if (netTime <= time + 1e-9 && ball.settling) {
        if (Math.abs(ball.x) <= NET_X) deflectNet(ball);
        else ball.y = Math.sign(ball.vy) * 1e-8;
        continue;
      }
      return;
    }
    const ground = timeToGround(ball as Pick<BallState, "z" | "vz">);
    const net = Math.abs(ball.y) > 1e-8 ? timeToY(ball, 0) : Infinity;
    const board = boardImpact(ball);
    const elapsed = Math.min(remaining, ground, net, board.time);
    Object.assign(ball, sample(ball, elapsed)); remaining -= elapsed;
    if (board.time <= elapsed + 1e-9) { deflectBoard(ball, board); }
    else if (net <= ground + 1e-9 && net <= elapsed + 1e-9) {
      if (Math.abs(ball.x) <= NET_X && ball.z - RADIUS <= netHeight(ball.x)) deflectNet(ball);
      else ball.y = Math.sign(ball.vy) * 1e-8;
    } else if (ground <= elapsed + 1e-9) {
      const impact = Math.abs(ball.vz);
      ball.z = RADIUS; ball.vz = impact * material.rebound;
      ball.vx *= material.retention; ball.vy *= material.retention;
      if (impact > 0.35) onBounce(ball as BallState);
      if (ball.vz < 0.22) { ball.vz = 0; ball.rolling = true; }
    }
  }
}

// Resolve impacts at their exact time, then integrate the remainder of the frame.
export function advance(ball: PhysicsBall, dt: number, surface: Surface | string, onEvent: (type: PhysicsEventType, ball: BallState) => void): void {
  let remaining = dt;
  for (let events = 0; ball.active && remaining > 1e-9 && events < 8; events++) {
    const ground = timeToGround(ball as Pick<BallState, "z" | "vz">);
    const net = ball.crossedNet ? Infinity : timeToY(ball, 0);
    const board = boardImpact(ball);
    const elapsed = Math.min(remaining, ground, net, board.time);
    Object.assign(ball, sample(ball, elapsed));
    remaining -= elapsed;
    if (board.time <= elapsed + 1e-9) { deflectBoard(ball, board); onEvent("board", ball as BallState); }
    else if (net <= ground + 1e-9 && net <= elapsed + 1e-9) {
      ball.crossedNet = true;
      if (Math.abs(ball.x) <= NET_X + 0.007) {
        const clearance = ball.z - RADIUS - netHeight(ball.x);
        if (clearance < -0.012) { onEvent("net", ball as BallState); }
        else if (clearance <= 0.012) {
          ball.netTouched = true;
          ball.vx *= 0.92;
          ball.vy *= 0.92;
          ball.vz = Math.max(0.13, ball.vz * 0.75);
          onEvent("tape", ball as BallState);
        }
      }
    } else if (ground <= elapsed + 1e-9) {
      rebound(ball, surface);
      onEvent("bounce", ball as BallState);
    }
  }
  if (!ball.active && ball.settling && remaining > 1e-9) advanceLoose(ball, remaining, surface);
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
