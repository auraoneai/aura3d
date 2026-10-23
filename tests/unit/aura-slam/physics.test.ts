import { describe, expect, it } from "vitest";
import * as ts from "../../../examples/aura-slam/sim/physics";
import { physics as kit } from "../../../examples/aura-slam/sim/physics";
import { ballPopulation, diff, lerp, makeBall, makeRandom, originalPhysics as js } from "./slam-diff-lib";

const SURFACES = ["hard", "grass", "clay", "moon", "unknown"] as const;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v, (_k, x) => (x === Infinity ? "__inf__" : x)), (_k, x) => (x === "__inf__" ? Infinity : x));

function expectSame(a: unknown, b: unknown, label: string, tol = 1e-12): void {
  const d = diff(a, b, tol);
  if (d) throw new Error(`${label}: ${d}`);
}

describe("M-PHYSICS constants match physics.js", () => {
  it("exports identical constants", () => {
    for (const key of ["GRAVITY", "RADIUS", "NET_HEIGHT", "NET_POST", "NET_X", "SERVE_MAX_RISE_METRES"]) {
      expect((ts as any)[key], key).toBe(js[key]);
    }
    expectSame(ts.COURT, js.COURT, "COURT", 0);
    expectSame(ts.LINE_BOUNDS, js.LINE_BOUNDS, "LINE_BOUNDS", 0);
    expectSame(ts.SURFACES, js.SURFACES, "SURFACES", 0);
  });

  it("exposes the PhysicsKit contract surface", () => {
    for (const key of ["sample", "timeToGround", "timeToY", "landing", "speedKph", "netHeight", "solveShot", "serveTrajectory",
      "serveTargetNetRisk", "advance", "advanceLoose", "inSingles", "inServiceBox", "powerTarget", "releaseBall"]) {
      expect(typeof (kit as any)[key], key).toBe("function");
    }
  });
});

describe("M-PHYSICS pure functions (differential vs physics.js)", () => {
  const balls = ballPopulation(1200, 20261023);
  const times = [0, 0.01, 0.05, 0.2, 0.5, 1.1, 2.5];

  it("sample / timeToGround / timeToY / landing / speedKph / netHeight", () => {
    let cases = 0;
    for (const ball of balls) {
      for (const t of times) { expectSame(ts.sample(ball, t), js.sample(ball, t), "sample"); cases++; }
      expectSame(ts.timeToGround(ball), js.timeToGround(ball), "timeToGround"); cases++;
      for (const y of [-1, -0.4, 0, 0.3, 1]) { expectSame(ts.timeToY(ball, y), js.timeToY(ball, y), `timeToY(${y})`); cases++; }
      expectSame(ts.landing(ball), js.landing(ball), "landing"); cases++;
      expect(ts.speedKph(ball)).toBe(js.speedKph(ball)); cases++;
    }
    for (let i = -140; i <= 140; i++) { expect(ts.netHeight(i / 100)).toBe(js.netHeight(i / 100)); cases++; }
    expect(cases).toBeGreaterThan(10000);
  });

  it("inSingles / inServiceBox / powerTarget / releaseBall", () => {
    const rnd = makeRandom(7);
    let cases = 0;
    for (let i = 0; i < 4000; i++) {
      const ball = makeBall({ x: lerp(-1.1, 1.1, rnd()), y: lerp(-1.1, 1.1, rnd()) });
      for (const side of ["player", "ai"] as const) {
        expect(ts.inSingles(ball, side)).toBe(js.inSingles(ball, side)); cases++;
        const serverX = rnd() < 0.5 ? -0.4 : 0.4;
        expect(ts.inServiceBox(ball, side, serverX)).toBe(js.inServiceBox(ball, side, serverX)); cases++;
      }
      const q = rnd();
      expectSame(ts.powerTarget(ball.x, ball.y, q), js.powerTarget(ball.x, ball.y, q), "powerTarget"); cases++;
    }
    for (const strong of [true, false]) {
      const a = makeBall({ rolling: strong }), b = clone(a);
      ts.releaseBall(a); js.releaseBall(b); expectSame(a, b, "releaseBall"); cases++;
    }
    expect(cases).toBeGreaterThan(20000);
  });

  it("rebound across surfaces, shot types and proDrop", () => {
    let cases = 0;
    for (const ball of balls.slice(0, 600)) {
      for (const surface of SURFACES) {
        const a = clone(ball), b = clone(ball);
        ts.rebound(a, surface); js.rebound(b, surface); expectSame(a, b, `rebound ${surface}`); cases++;
      }
    }
    expect(cases).toBe(3000);
  });

  it("solveShot returns identical solutions and throws identically", () => {
    const rnd = makeRandom(99);
    let solved = 0, thrown = 0;
    for (let i = 0; i < 1500; i++) {
      const ball = makeBall({ x: lerp(-1, 1, rnd()), y: (rnd() < 0.5 ? 1 : -1) * lerp(0.2, 1, rnd()), z: lerp(0.06, 1.1, rnd()) });
      const tx = lerp(-0.8, 0.8, rnd()), ty = -Math.sign(ball.y) * lerp(0.3, 0.95, rnd());
      const desired = lerp(0.2, 1.6, rnd()), clearance = rnd() < 0.5 ? undefined : lerp(0, 0.2, rnd());
      let a: unknown, b: unknown, ea: unknown, eb: unknown;
      try { a = ts.solveShot(ball as any, tx, ty, desired, clearance); } catch (e) { ea = (e as Error).message; }
      try { b = js.solveShot(ball, tx, ty, desired, clearance); } catch (e) { eb = (e as Error).message; }
      expect(ea).toBe(eb);
      if (ea) thrown++; else { expectSame(a, b, "solveShot"); solved++; }
    }
    expect(solved).toBeGreaterThan(500);
    // A net clearance no arc can satisfy must throw the same error as the source.
    const impossible = makeBall({ x: 0, y: 0.6, z: 0.05 });
    expect(() => ts.solveShot(impossible as any, 0, -0.9, 0.28, 50)).toThrow("Unable to construct a playable trajectory");
    expect(() => js.solveShot(impossible, 0, -0.9, 0.28, 50)).toThrow("Unable to construct a playable trajectory");
    expect(thrown).toBeGreaterThanOrEqual(0);
  });

  it("serveTrajectory / serveTargetNetRisk (36-step bisection) are identical", () => {
    const rnd = makeRandom(31337);
    let cases = 0;
    for (let i = 0; i < 1500; i++) {
      const ball = makeBall({ x: lerp(-0.6, 0.6, rnd()), y: (rnd() < 0.5 ? 1 : -1) * 1.0, z: lerp(0.9, 1.25, rnd()) });
      const tx = lerp(-0.8, 0.8, rnd()), ty = -Math.sign(ball.y) * lerp(0.05, 0.55, rnd());
      const kph = lerp(80, 230, rnd()), clearance = rnd() < 0.5 ? undefined : lerp(0, 0.2, rnd());
      const ex = lerp(-1, 1, rnd()), ey = lerp(-1, 1, rnd());
      expectSame(ts.serveTrajectory(ball, tx, ty, kph, clearance, ex, ey), js.serveTrajectory(ball, tx, ty, kph, clearance, ex, ey), "serveTrajectory"); cases++;
      expect(ts.serveTargetNetRisk(ball, tx, ty, clearance)).toBe(js.serveTargetNetRisk(ball, tx, ty, clearance)); cases++;
    }
    expect(cases).toBe(3000);
  });
});

describe("M-PHYSICS advance / advanceLoose (event-time integration)", () => {
  const FRAME = 1 / 60;

  function runFlight(ball0: ReturnType<typeof makeBall>, surface: string, maxFrames: number) {
    const a = clone(ball0), b = clone(ball0);
    const ea: Array<[string, unknown]> = [], eb: Array<[string, unknown]> = [];
    for (let frame = 0; frame < maxFrames; frame++) {
      ts.advance(a, FRAME, surface, (type, ball) => ea.push([type, clone({ ...ball, trail: [] })]));
      js.advance(b, FRAME, surface, (type: string, ball: any) => eb.push([type, clone({ ...ball, trail: [] })]));
      expectSame(a, b, `advance frame ${frame}`);
      if (!a.active && !a.settling) break;
      // Mirror the match engine: stop the active flight after a second bounce or net so loose physics takes over.
      if (a.active && (a.bounceCount >= 2 || ea.some(([t]) => t === "net" || t === "board"))) {
        ts.releaseBall(a); js.releaseBall(b);
      }
    }
    expectSame(ea, eb, "event log");
    return ea.length;
  }

  it("matches the original frame by frame, including bounce/tape/net/board events", () => {
    const rnd = makeRandom(555);
    const seen = new Set<string>();
    let flights = 0;
    for (let i = 0; i < 700; i++) {
      const toward = rnd() < 0.5 ? -1 : 1;
      const ball = makeBall({
        x: lerp(-1.2, 1.2, rnd()), y: -toward * lerp(0.3, 1.1, rnd()), z: lerp(0.2, 1.2, rnd()),
        vx: lerp(-0.7, 0.7, rnd()), vy: toward * lerp(0.8, 4.5, rnd()), vz: lerp(-0.4, 2.5, rnd()),
        shotType: (["neutral", "short", "deep", "lob"] as const)[Math.floor(rnd() * 4)], proDrop: rnd() < 0.3 ? rnd() : undefined
      });
      const surface = SURFACES[i % SURFACES.length]!;
      runFlight(ball, surface, 400);
      const probe = clone(ball);
      ts.advance(probe, 3, surface, (type) => seen.add(type));
      flights++;
    }
    expect(flights).toBe(700);
    // The grid must actually exercise the interesting branches.
    expect(seen.has("bounce")).toBe(true);
  });

  it("covers net, tape and board events with crafted trajectories", () => {
    const seen = new Set<string>();
    const record = (type: string) => seen.add(type);
    // Low drive into the net.
    const netShot = makeBall({ x: 0, y: 0.9, z: 0.18, vx: 0, vy: -3, vz: 0.1 });
    // Net-cord skim: apex right at tape height.
    const tapeShots: ReturnType<typeof makeBall>[] = [];
    for (let z = 0.40; z < 0.52; z += 0.002) tapeShots.push(makeBall({ x: 0.2, y: 0.8, z, vx: 0, vy: -2.2, vz: 0 }));
    // Deep drive into the rear boards.
    const boardShots = [makeBall({ x: 0.3, y: -0.95, z: 0.3, vx: 0.1, vy: -3.5, vz: 0.3 }), makeBall({ x: -0.9, y: -0.9, z: 0.2, vx: -0.5, vy: -3.0, vz: 0.5 })];
    for (const shot of [netShot, ...tapeShots, ...boardShots]) {
      const a = clone(shot), b = clone(shot);
      for (let f = 0; f < 240; f++) {
        ts.advance(a, FRAME, "hard", (t) => record(t));
        js.advance(b, FRAME, "hard", () => {});
        expectSame(a, b, "crafted advance");
        if (!a.active) break;
      }
    }
    expect([...seen].some((t) => t === "net" || t === "tape" || t === "board")).toBe(true);
  });

  it("advanceLoose rolling/bouncing/net/board paths are identical", () => {
    const rnd = makeRandom(8080);
    let cases = 0;
    for (let i = 0; i < 600; i++) {
      const ball = makeBall({
        x: lerp(-1.3, 1.3, rnd()), y: lerp(-1.1, 1.1, rnd()), z: lerp(0.034, 0.8, rnd()),
        vx: lerp(-1, 1, rnd()), vy: lerp(-3.5, 3.5, rnd()), vz: lerp(-1.5, 1.5, rnd()),
        active: false, dead: true, settling: true, rolling: i % 3 === 0
      });
      const surface = SURFACES[i % SURFACES.length]!;
      const a = clone(ball), b = clone(ball);
      const bounces: unknown[] = [], bouncesJs: unknown[] = [];
      for (let f = 0; f < 600; f++) {
        ts.advanceLoose(a, FRAME, surface, (ball) => bounces.push(clone({ ...ball, trail: [] })));
        js.advanceLoose(b, FRAME, surface, (ball: any) => bouncesJs.push(clone({ ...ball, trail: [] })));
        expectSame(a, b, `advanceLoose frame ${f}`); cases++;
        if (!a.settling) break;
      }
      expectSame(bounces, bouncesJs, "onBounce log");
    }
    expect(cases).toBeGreaterThan(2000);
  });

  it("advance emits through the kit and re-enters loose physics for a released ball", () => {
    const a = makeBall({ x: 0.1, y: -0.2, z: 0.3, vx: 0.2, vy: -1.5, vz: 0, active: false, settling: true, dead: true });
    const b = clone(a);
    ts.advance(a, 2, "clay", () => {});
    js.advance(b, 2, "clay", () => {});
    expectSame(a, b, "released ball advance");
  });
});
