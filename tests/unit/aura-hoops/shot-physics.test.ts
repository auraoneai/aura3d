import { describe, expect, it } from "vitest";
import { RING_R, TUBE_R, aimError, advanceShotBall, createHoopWorld, crossedRimDownward, solveLaunch } from "../../../apps/showcase-aura-hoops-3d/src/shotPhysics";

const GRAVITY = -10.4;
const BALL_R = 0.13;
const RIM: [number, number, number] = [0, 3.05, 0];
const HOOP = { rim: RIM, boardFaceZ: -0.35 + 0.06, boardHalfW: 0.9, boardY0: 2.82, boardY1: 3.9 };

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

interface Outcome { made: boolean; rim: number; board: number; tunneled: boolean }

function shoot(quality: number, dist: number, rand: () => number, contest = 0, skill = 0): Outcome {
  let rim = 0, board = 0, madeAlready = false;
  // contacts after the ball is through the hoop (dropping onto the glass below the rim) do not change how the shot is classified
  const world = createHoopWorld(HOOP, (i) => { if (madeAlready) return; if (i.tag === "rim") rim += 1; else board += 1; });
  const ang = (rand() - 0.5) * 1.6;
  const from: [number, number, number] = [Math.sin(ang) * dist, 2.0, Math.cos(ang) * dist];
  const err = aimError(quality, dist, contest, skill, rand);
  const v = solveLaunch(from, [RIM[0] + err.dx, RIM[1], RIM[2] + err.dz], GRAVITY);
  const ball = { x: from[0], y: from[1], z: from[2], vx: v[0], vy: v[1], vz: v[2] };
  let made = false, tunneled = false;
  for (let i = 0; i < 360 && ball.y > 1.2; i += 1) {
    const prev: [number, number, number] = [ball.x, ball.y, ball.z];
    advanceShotBall(world, ball, BALL_R, 1 / 60, GRAVITY);
    if (!made && crossedRimDownward(prev, [ball.x, ball.y, ball.z], RIM)) { made = true; madeAlready = true; }
    // the glass is solid: the ball centre is never inside the glass volume (it may legitimately drop behind it over the top)
    if (ball.z < HOOP.boardFaceZ && ball.z > HOOP.boardFaceZ - 0.6 && Math.abs(ball.x) < HOOP.boardHalfW && ball.y > HOOP.boardY0 && ball.y < HOOP.boardY1) tunneled = true;
  }
  return { made, rim, board, tunneled };
}

function sample(quality: number, n: number, seed: number, contest = 0) {
  const rand = lcg(seed);
  const out: Outcome[] = [];
  for (let i = 0; i < n; i += 1) out.push(shoot(quality, 2.5 + rand() * 5, rand, contest));
  return {
    makePct: out.filter((o) => o.made).length / n,
    rimPct: out.filter((o) => o.rim > 0).length / n,
    rimRoll: out.filter((o) => o.made && o.rim > 0).length,
    rimMiss: out.filter((o) => !o.made && o.rim > 0).length,
    airball: out.filter((o) => !o.made && o.rim === 0 && o.board === 0).length,
    bank: out.filter((o) => o.made && o.board > 0 && o.rim === 0).length,
    tunneled: out.filter((o) => o.tunneled).length
  };
}

describe("Aura Hoops shot physics", () => {
  it("opening is a real ring: clearance for the ball centre is positive and smaller than the ring", () => {
    expect(RING_R - TUBE_R - BALL_R).toBeGreaterThan(0.1);
    expect(RING_R - TUBE_R - BALL_R).toBeLessThan(RING_R);
  });

  it("a perfect release almost always swishes; makes fall as the release gets worse", () => {
    const perfect = sample(0.995, 600, 11);
    const green = sample(0.92, 600, 12);
    const mid = sample(0.75, 600, 13);
    const bad = sample(0.4, 600, 14);
    expect(perfect.makePct).toBeGreaterThan(0.95);
    expect(perfect.makePct).toBeGreaterThan(green.makePct);
    expect(green.makePct).toBeGreaterThan(mid.makePct);
    expect(mid.makePct).toBeGreaterThan(bad.makePct);
    expect(bad.makePct).toBeLessThan(0.25);
  });

  it("physics produces rim bounces: made-after-rim, rim misses, glass banks and airballs all occur", () => {
    const s = sample(0.7, 1500, 21);
    expect(s.rimRoll).toBeGreaterThan(10);
    expect(s.rimMiss).toBeGreaterThan(50);
    expect(s.bank).toBeGreaterThan(0);
    expect(s.rimPct).toBeGreaterThan(0.2);
    expect(sample(0.4, 800, 22).airball).toBeGreaterThan(10);
  });

  it("never tunnels through the glass", () => {
    for (const q of [0.995, 0.8, 0.5, 0.2]) expect(sample(q, 400, 31 + Math.round(q * 10)).tunneled).toBe(0);
  });

  it("is deterministic for a given seed and a defender in the face lowers the make rate", () => {
    expect(sample(0.85, 200, 5)).toEqual(sample(0.85, 200, 5));
    expect(sample(0.85, 800, 6, -0.28).makePct).toBeLessThan(sample(0.85, 800, 6, 0).makePct);
  });
});
