/**
 * M-STROKES: faithful TypeScript transcription of public/toptennis/strokes.js (stroke selection and pace profiles).
 * Normalised court coordinates. Behaviour is checked against the original by tests/unit/aura-slam/strokes.test.ts.
 */
import type { StrokeModel } from "../contract/modules";
import type { ActorState, BallState, ShotPreset, Side, StrokeKind, Surface } from "../contract/sim";
import { GRAVITY, NET_HEIGHT, RADIUS, advance, clamp, timeToGround, type PhysicsBall } from "./physics";

export const SMASH_MIN = 0.82, SMASH_MAX = 1.12; // Approximately 1.79-2.44 m: head to extended racket.

type SelectActor = Pick<ActorState, "side" | "x" | "y" | "racketSide">;
type StrokeSelection = { kind: StrokeKind; racketSide: 1 | -1; reachable: boolean; reachScale: number };

export function select(actor: SelectActor, ball: BallState): StrokeSelection {
  const face = actor.side === "player" ? 1 : -1;
  const localX = (ball.x - actor.x) * face, localY = (ball.y - actor.y) * face;
  const racketSide = (Math.abs(localX) > 0.018 ? Math.sign(localX) : (actor.racketSide || 1)) as 1 | -1;
  const hand = racketSide < 0 ? "backhand" : "forehand";
  // An overhead needs the ball above/in front of the shoulder, not far to the side or behind the body.
  const overhead = !ball.highDeepLob && ball.z >= SMASH_MIN && Math.abs(localX) <= 0.14 && localY >= -0.18 && localY <= 0.10;
  const volley = ball.bounceCount === 0 && !ball.isServe;
  const kind = (overhead ? "smash" : volley ? `${hand}-volley` : hand) as StrokeKind;
  return { kind, racketSide, reachable: ball.z >= RADIUS && ball.z <= (overhead ? SMASH_MAX : SMASH_MIN), reachScale: overhead ? 0.78 : 1 };
}

export function prepare(actor: ActorState, ball: BallState, delay: number, surface: Surface | string): StrokeSelection & { height: number } {
  const predicted = { ...ball };
  if (predicted.active) advance(predicted as PhysicsBall, delay, surface, () => {});
  return { ...select(actor, predicted), height: predicted.z };
}

export function proAttackOpportunity(actor: ActorState, ball: BallState, kind: StrokeKind, shotType: ShotPreset, spatialQuality: number): number {
  if ((kind !== "forehand" && kind !== "backhand") || ball.bounceCount !== 1 ||
    ball.isServe || ball.shotType === "serve" || (shotType !== "neutral" && shotType !== "deep")) return 0;
  const face = actor.side === "player" ? 1 : -1;
  // A floating return is an opportunity only at contact: inside the court, above net height, in front,
  // comfortably reached and prepared on time. Horizontal arrival speed excludes the gravity of a descending ball.
  const speed = Math.hypot(ball.vx * 5.018, ball.vy * 11.885);
  const slow = clamp((18 - speed) / 8, 0, 1);
  const forward = clamp((0.80 - Math.max(Math.abs(actor.y), Math.abs(ball.y))) / 0.25, 0, 1);
  const high = clamp((ball.z - NET_HEIGHT - 0.06) / 0.16, 0, 1);
  const comfortable = clamp((spatialQuality - 0.45) / 0.25, 0, 1);
  const inFront = clamp((0.055 - (ball.y - actor.y) * face) / 0.055, 0, 1);
  const onTime = clamp((0.24 - actor.swingAge) / 0.04, 0, 1);
  const balanced = clamp((1 - Math.hypot(actor.vx, actor.vy)) / 0.5, 0, 1);
  return slow * forward * high * comfortable * inFront * onTime * balanced;
}

export function flightTime(
  kind: StrokeKind, ball: BallState, targetX: number, targetY: number, groundTime: number, quality: number,
  shotType: ShotPreset = "neutral", proAttack = 0
): number {
  const meters = Math.hypot((targetX - ball.x) * 5.018, (targetY - ball.y) * 11.885);
  if (kind === "smash") return clamp(meters / (25 + 9 * quality), 0.30, 1.05);
  if (kind.endsWith("-volley")) {
    const punch = clamp(meters / (13 + 6 * quality), 0.38, 0.98);
    // A low volley is a controlled lift, not a drive through the net.
    return ball.z < NET_HEIGHT + 0.08 ? Math.max(punch, groundTime * 0.86) : punch;
  }
  // A clean groundstroke inside the court keeps attacking pace instead of slowing down to fill the baseline
  // travel time; low/stretched pickups and intentional drops retain their controlled arc.
  if (shotType === "short" || shotType === "lob") return groundTime;
  const forward = clamp((0.80 - Math.abs(ball.y)) / 0.35, 0, 1);
  const height = clamp((ball.z - 0.22) / 0.30, 0, 1);
  const clean = clamp((quality - 0.55) / 0.30, 0, 1);
  const attackTime = Math.min(groundTime, Math.max(0.38, meters / (21 + 5 * quality)));
  const normalTime = groundTime + (attackTime - groundTime) * forward * height * clean;
  // A prepared attack after a slow high bounce generates its own pace; power stays a separate boost in the engine.
  const finishTime = Math.min(normalTime, Math.max(0.34, meters / (26 + 3 * quality)));
  return normalTime + (finishTime - normalTime) * clamp(proAttack, 0, 1);
}

export function defensiveLateness(swingAge: number, kind: StrokeKind): number {
  if (kind === "smash") return 0;
  // Only late contact can float up; stretching and low pickups alone cannot.
  return clamp((swingAge - 0.24) / 0.12, 0, 1);
}

export function defensiveLobPlan(
  ball: BallState, targetX: number, side: Side, pressure: number, depthDraw: number, heightDraw: number
): { targetX: number; targetY: number; time: number; short: boolean } {
  const short = depthDraw < 0.5 + 0.25 * pressure;
  const targetY = (side === "player" ? -1 : 1) * (short ? 0.46 + 0.10 * heightDraw : 0.86 + 0.08 * heightDraw);
  const apex = Math.max(ball.z + 0.35, short ? 1.55 + 0.20 * heightDraw : 2.10 + 0.30 * heightDraw);
  const vz = Math.sqrt(2 * GRAVITY * (apex - ball.z));
  // Choose the complete arc at impact; gravity, net and bounce events then use the ordinary ball simulation.
  return { targetX: clamp(targetX * 0.72, -0.66, 0.66), targetY, time: timeToGround({ ...ball, vz }), short };
}

export function highDeepLobPlan(ball: BallState, targetX: number, side: Side): { targetX: number; targetY: number; time: number } {
  // Intentional lobs share one deep, generous arc. Timing and reach still decide whether contact occurs.
  const apex = Math.max(ball.z + 0.35, 2.1);
  return {
    targetX: clamp(targetX * 0.75, -0.6, 0.6), targetY: (side === "player" ? -1 : 1) * 0.92,
    time: timeToGround({ ...ball, vz: Math.sqrt(2 * GRAVITY * (apex - ball.z)) })
  };
}

export const strokes: StrokeModel & { SMASH_MIN: number; SMASH_MAX: number } = {
  SMASH_MIN, SMASH_MAX, select, prepare, flightTime, proAttackOpportunity, defensiveLateness, defensiveLobPlan, highDeepLobPlan
};
