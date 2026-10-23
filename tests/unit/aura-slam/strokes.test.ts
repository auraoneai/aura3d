import { describe, expect, it } from "vitest";
import * as ts from "../../../examples/aura-slam/sim/strokes";
import { strokes as kit } from "../../../examples/aura-slam/sim/strokes";
import { ballPopulation, diff, lerp, makeActor, makeRandom, originalStrokes as js } from "./slam-diff-lib";

const KINDS = ["forehand", "backhand", "forehand-volley", "backhand-volley", "smash", "serve"] as const;
const SHOTS = ["neutral", "short", "deep", "lob"] as const;
const SURFACES = ["hard", "grass", "clay"] as const;

function same(a: unknown, b: unknown, label: string, tol = 1e-12): void {
  const d = diff(a, b, tol);
  if (d) throw new Error(`${label}: ${d}`);
}

function actors(count: number, seed: number): any[] {
  const rnd = makeRandom(seed);
  return Array.from({ length: count }, () => makeActor({
    side: rnd() < 0.5 ? "player" : "ai", x: lerp(-1.1, 1.1, rnd()), y: lerp(-1, 1, rnd()),
    vx: lerp(-1, 1, rnd()), vy: lerp(-1, 1, rnd()), racketSide: rnd() < 0.5 ? 1 : -1, swingAge: lerp(0, 0.5, rnd())
  }));
}

describe("M-STROKES (differential vs strokes.js)", () => {
  const balls = ballPopulation(1500, 424242);
  const who = actors(1500, 515151);

  it("exports the same smash window and the StrokeModel surface", () => {
    expect(ts.SMASH_MIN).toBe(js.SMASH_MIN);
    expect(ts.SMASH_MAX).toBe(js.SMASH_MAX);
    for (const key of ["select", "prepare", "flightTime", "proAttackOpportunity", "defensiveLateness", "defensiveLobPlan", "highDeepLobPlan"]) {
      expect(typeof (kit as any)[key], key).toBe("function");
    }
  });

  it("select covers every stroke kind and matches", () => {
    const kinds = new Set<string>();
    let cases = 0;
    for (let i = 0; i < balls.length; i++) {
      const actor = who[i]!, ball = balls[i]!;
      const a = ts.select(actor, ball as any), b = js.select(actor, ball);
      same(a, b, "select"); kinds.add(a.kind); cases++;
      // Force close-to-actor geometry so smash/volley/groundstroke branches are all hit.
      const near = { ...ball, x: actor.x + lerp(-0.2, 0.2, (i % 17) / 16), y: actor.y + lerp(-0.25, 0.15, (i % 13) / 12), z: lerp(0.03, 1.2, (i % 11) / 10) };
      same(ts.select(actor, near as any), js.select(actor, near), "select near"); cases++;
      kinds.add(ts.select(actor, near as any).kind);
    }
    for (const kind of ["forehand", "backhand", "forehand-volley", "backhand-volley", "smash"]) expect(kinds.has(kind), kind).toBe(true);
    expect(cases).toBe(3000);
  });

  it("prepare (predicted contact through advance) matches", () => {
    let cases = 0;
    for (let i = 0; i < 1200; i++) {
      const actor = who[i]!, ball = balls[i]!, delay = lerp(0, 0.9, (i % 23) / 22), surface = SURFACES[i % 3]!;
      same(ts.prepare(actor, ball as any, delay, surface), js.prepare(actor, ball, delay, surface), "prepare"); cases++;
    }
    expect(cases).toBe(1200);
  });

  it("proAttackOpportunity matches across kinds, shot presets and quality", () => {
    const rnd = makeRandom(88);
    let cases = 0, nonzero = 0;
    for (let i = 0; i < 12000; i++) {
      const actor = who[i % who.length]!;
      const ball = { ...balls[(i * 7) % balls.length]!, bounceCount: rnd() < 0.7 ? 1 : 0, isServe: rnd() < 0.05, y: lerp(-0.9, 0.9, rnd()), z: lerp(0.25, 0.7, rnd()), vx: lerp(-0.6, 0.6, rnd()), vy: lerp(-1.4, 1.4, rnd()) };
      const shot = SHOTS[i % 4]!, kind = KINDS[i % 6]!, quality = rnd();
      const tuned = { ...actor, y: lerp(-0.9, 0.9, rnd()), swingAge: lerp(0, 0.3, rnd()), vx: lerp(-0.3, 0.3, rnd()), vy: lerp(-0.3, 0.3, rnd()) };
      const a = ts.proAttackOpportunity(tuned, ball as any, kind, shot, quality), b = js.proAttackOpportunity(tuned, ball, kind, shot, quality);
      same(a, b, "proAttackOpportunity"); cases++; if (a > 0) nonzero++;
    }
    expect(cases).toBe(12000);
    expect(nonzero).toBeGreaterThan(50);
  });

  it("flightTime matches for every kind, shot preset, quality and proAttack", () => {
    const rnd = makeRandom(7);
    let cases = 0;
    for (let i = 0; i < 8000; i++) {
      const ball = balls[i % balls.length]!;
      const kind = KINDS[i % 6]!, shot = i % 5 === 4 ? undefined : SHOTS[i % 4]!;
      const tx = lerp(-0.9, 0.9, rnd()), ty = lerp(-1, 1, rnd()), ground = lerp(0.2, 1.6, rnd()), q = rnd(), pro = rnd() < 0.5 ? undefined : rnd();
      same(ts.flightTime(kind, ball as any, tx, ty, ground, q, shot, pro), js.flightTime(kind, ball, tx, ty, ground, q, shot, pro), "flightTime"); cases++;
    }
    expect(cases).toBe(8000);
  });

  it("defensiveLateness / defensiveLobPlan / highDeepLobPlan match", () => {
    const rnd = makeRandom(1234);
    let cases = 0;
    for (let i = 0; i < 4000; i++) {
      const age = lerp(0, 0.6, rnd()), kind = KINDS[i % 6]!;
      same(ts.defensiveLateness(age, kind), js.defensiveLateness(age, kind), "defensiveLateness"); cases++;
      const ball = balls[i % balls.length]!, side = i % 2 ? "player" : "ai";
      const tx = lerp(-1, 1, rnd()), pressure = rnd(), depth = rnd(), height = rnd();
      same(ts.defensiveLobPlan(ball as any, tx, side, pressure, depth, height), js.defensiveLobPlan(ball, tx, side, pressure, depth, height), "defensiveLobPlan"); cases++;
      same(ts.highDeepLobPlan(ball as any, tx, side), js.highDeepLobPlan(ball, tx, side), "highDeepLobPlan"); cases++;
    }
    expect(cases).toBe(12000);
  });
});
