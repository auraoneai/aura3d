import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });
import { createAthletePose, pose, type PoseActor, type PoseMatchState } from "../../../examples/aura-slam/view/pose";

/** Load the original UMD source as data (it assigns module.exports under CommonJS). */
function loadUmd<T>(relative: string): T {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const module = { exports: {} as unknown };
  new Function("module", "exports", source)(module, module.exports);
  return module.exports as T;
}
const original = loadUmd<{ pose: (player: unknown, state: unknown) => unknown }>(
  "../../../apps/showcase-top-tennis/public/toptennis/player-pose.js"
);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STROKES = ["forehand", "backhand", "forehand-volley", "backhand-volley", "smash", "serve"] as const;
const PHASES = ["serve", "serveToss", "rally", "point", "menu"] as const;
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const num = (r: () => number, lo: number, hi: number): number => lo + (hi - lo) * r();
const maybe = <T,>(r: () => number, p: number, v: T, other: T): T => (r() < p ? v : other);

function randomCase(r: () => number): { actor: PoseActor; state: PoseMatchState } {
  const side = pick(r, ["player", "ai"] as const);
  const swing = maybe(r, 0.45, num(r, 0, 0.42), 0);
  const actor = {
    side,
    moveBlend: pick(r, [-0.2, 0, 0.03, 0.1, 0.25, 0.4, 0.6, 1, 1.4, num(r, 0, 1)]),
    stride: num(r, -20, 40),
    vx: pick(r, [0, 0, 0.0005, num(r, -1.3, 1.3)]),
    vy: pick(r, [0, 0, 0.0005, num(r, -1.3, 1.3)]),
    splitStep: maybe(r, 0.3, num(r, 0, 0.3), 0),
    strokeContactAge: maybe(r, 0.6, num(r, 0.05, 0.3), 0),
    swingAge: num(r, 0, 0.5),
    strokeConnected: r() < 0.5,
    swing,
    stroke: pick(r, STROKES),
    strokeContactZ: pick(r, [undefined, num(r, 0, 1.4)]),
    slideRemaining: pick(r, [undefined, 0, num(r, 0, 0.34)]),
    slidePoseStatic: r() < 0.3,
    serveMotion: maybe(r, 0.3, num(r, 0, 0.45), 0),
    serveContactPoint: pick(r, [null, undefined, [num(r, -0.5, 0.6), num(r, 1.2, 2.6), num(r, -0.8, 0.4)] as const]),
    // contract fields the solver does not read
    id: side === "player" ? "p1" : "p2"
  } as unknown as PoseActor;
  const time = num(r, 0, 60);
  const swingAt = maybe(r, 0.7, num(r, 0, 60), null as number | null);
  const state = {
    phase: pick(r, PHASES),
    time,
    server: pick(r, ["player", "ai"] as const),
    serveAttempt: maybe(
      r,
      0.8,
      {
        server: pick(r, ["player", "ai"] as const),
        number: 1,
        tossAt: null,
        swingAt: swingAt === null ? null : Math.min(time, swingAt),
        contactAt: (swingAt ?? 0) + num(r, 0, 0.8),
        aim: { x: 0, y: 0 },
        power: false
      },
      null
    )
  } as unknown as PoseMatchState;
  return { actor, state };
}

describe("M-POSE: pose() is bit-identical to player-pose.js", () => {
  it("matches over 60,000 random actor/state cases (exact equality)", () => {
    const r = rng(20261023);
    let compared = 0;
    for (let i = 0; i < 60000; i++) {
      const { actor, state } = randomCase(r);
      const a = JSON.parse(JSON.stringify(original.pose(structuredClone(actor), structuredClone(state))));
      const b = JSON.parse(JSON.stringify(pose(structuredClone(actor), structuredClone(state))));
      expect(b).toEqual(a);
      compared++;
    }
    expect(compared).toBe(60000);
  });

  it("covers every mode the source can emit", () => {
    const r = rng(7);
    const modes = new Set<string>();
    for (let i = 0; i < 20000; i++) {
      const { actor, state } = randomCase(r);
      modes.add(pose(actor, state).mode);
    }
    for (const m of ["ready", "shuffle", "run", "slide", "serve", "serve-windup", "toss", "forehand", "backhand", "smash", "forehand-volley", "backhand-volley"]) {
      expect(modes.has(m), `mode ${m}`).toBe(true);
    }
  });

  it("is a pure function (does not mutate its inputs)", () => {
    const r = rng(11);
    for (let i = 0; i < 500; i++) {
      const { actor, state } = randomCase(r);
      const before = JSON.stringify([actor, state]);
      pose(actor, state);
      expect(JSON.stringify([actor, state])).toBe(before);
    }
  });

  it("createAthletePose() implements the contract interface", () => {
    const r = rng(3);
    const { actor, state } = randomCase(r);
    expect(createAthletePose().pose(actor as never, state)).toEqual(pose(actor, state));
  });
});
