import { readFileSync } from "node:fs";
import type { BallState } from "../../../examples/aura-slam/contract/sim";
import { resolve } from "node:path";

const SOURCE_DIR = resolve(process.cwd(), "apps/showcase-top-tennis/public/toptennis");

/**
 * Load an original UMD module as DATA: the surrounding package may be ESM, so `require` would not give us
 * `module.exports`. Evaluate the source text with an explicit CommonJS wrapper instead.
 */
function loadUmd(file: string, requireMap: Record<string, unknown> = {}): Record<string, any> {
  const source = readFileSync(resolve(SOURCE_DIR, file), "utf8");
  const module = { exports: {} as Record<string, any> };
  const fakeRequire = (id: string): unknown => {
    if (id in requireMap) return requireMap[id];
    throw new Error(`unexpected require(${id}) from ${file}`);
  };
  new Function("module", "exports", "require", source)(module, module.exports, fakeRequire);
  return module.exports;
}

/** The original UMD modules, loaded as data in Node for differential tests. */
export const originalPhysics = loadUmd("physics.js");
export const originalStrokes = loadUmd("strokes.js", { "./physics.js": originalPhysics });

/** Deterministic 32-bit LCG so the grids are identical on every run and machine. */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Deep compare with a numeric tolerance; NaN equals NaN, Infinity equals Infinity. Returns the first mismatch path or null. */
export function diff(a: unknown, b: unknown, tol = 1e-12, path = "$"): string | null {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return null;
    if (a === b) return null;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return `${path}: ${a} !== ${b}`;
    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    return Math.abs(a - b) <= tol * scale ? null : `${path}: ${a} vs ${b} (|d|=${Math.abs(a - b)})`;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return Object.is(a, b) ? null : `${path}: ${String(a)} !== ${String(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array mismatch`;
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const key of keys) {
    const d = diff((a as any)[key], (b as any)[key], tol, `${path}.${key}`);
    if (d) return d;
  }
  return null;
}

export interface TestBall {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  active: boolean; dead: boolean; settling: boolean; rolling: boolean;
  lastHit: "player" | "ai" | null; bounceCount: number; crossedNet: boolean;
  targetX: number | null; targetY: number | null;
  isServe: boolean; defensiveLob: boolean; highDeepLob: boolean; netTouched: boolean;
  speedKph: number; shotType?: BallState["shotType"]; proDrop?: number; trail: Array<{ x: number; y: number; z: number }>;
}

export function makeBall(over: Partial<TestBall> = {}): TestBall {
  return {
    x: 0, y: 0.8, z: 0.4, vx: 0, vy: -1, vz: 0.5,
    active: true, dead: false, settling: false, rolling: false, lastHit: null, bounceCount: 0, crossedNet: false,
    targetX: null, targetY: null, isServe: false, defensiveLob: false, highDeepLob: false, netTouched: false,
    speedKph: 0, trail: [], ...over
  };
}

/** A varied population of in-play balls: lateral, depth, height and speed sweeps, plus lobs, lows and fast drives. */
export function ballPopulation(count: number, seed: number): TestBall[] {
  const rnd = makeRandom(seed);
  const shotTypes: Array<BallState["shotType"]> = [undefined, "neutral", "short", "deep", "lob", "serve"];
  const out: TestBall[] = [];
  for (let i = 0; i < count; i++) {
    const towardAi = rnd() < 0.5;
    out.push(makeBall({
      x: lerp(-1.3, 1.3, rnd()), y: lerp(-1.15, 1.15, rnd()), z: lerp(0.03, 1.3, rnd()),
      vx: lerp(-1.2, 1.2, rnd()), vy: (towardAi ? -1 : 1) * lerp(0.2, 4.2, rnd()), vz: lerp(-1.6, 3.4, rnd()),
      bounceCount: Math.floor(rnd() * 3), isServe: rnd() < 0.1, highDeepLob: rnd() < 0.1,
      shotType: shotTypes[Math.floor(rnd() * shotTypes.length)],
      proDrop: rnd() < 0.3 ? rnd() : undefined, crossedNet: rnd() < 0.3,
      lastHit: rnd() < 0.5 ? "player" : "ai"
    }));
  }
  return out;
}

export function makeActor(over: Record<string, unknown> = {}): any {
  return {
    side: "player", x: 0, y: 0.9, vx: 0, vy: 0, racketSide: 1, swingAge: 0.1,
    ...over
  };
}
