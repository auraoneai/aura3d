import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });
import { game, material } from "@aura3d/engine";
import { createOriginalRig } from "../../../examples/aura-slam/view/__generated__/originalRig.js";
import {
  buildAthleteNodes,
  resolveAthleteRig,
  updateAthleteRig,
  type AthleteAppearance,
  type AthleteRigHandles
} from "../../../examples/aura-slam/view/athleteRig";
import { pose, type PoseActor, type PoseMatchState } from "../../../examples/aura-slam/view/pose";
// @ts-expect-error plain ESM tool without types
import { extractOriginalRig, MAIN_PATH, OUT_PATH } from "../../../tools/aura-slam/extractOriginalRig.mjs";

type V3 = [number, number, number];
class MockHandle {
  pos: V3 | null = null;
  rot: V3 | null = null;
  scale: V3 | null = null;
  visible: boolean | null = null;
  materials: unknown[] = [];
  setPosition(x: number, y: number, z: number): this { this.pos = [x, y, z]; return this; }
  setRotation(x: number, y: number, z: number): this { this.rot = [x, y, z]; return this; }
  setScale(s: readonly number[]): this { this.scale = [s[0]!, s[1]!, s[2]!]; return this; }
  setVisible(v: boolean): this { this.visible = v; return this; }
  setMaterial(m: unknown): this { this.materials.push(m); return this; }
}
const KEYS = [
  "torso", "collar", "hips", "head", "hairCap", "visorBrim", "apolloHelmet", "apolloPack", "leftUpperLeg", "leftLowerLeg",
  "leftKnee", "leftShoe", "rightUpperLeg", "rightLowerLeg", "rightKnee", "rightShoe", "leftUpperArm", "leftLowerArm",
  "leftHand", "rightUpperArm", "rightLowerArm", "rightHand", "racketHandle", "racketThroatLeft", "racketThroatRight",
  "racketHoop", "racketStrings", "shadowDisc"
] as const;
const makeRig = (): AthleteRigHandles =>
  Object.fromEntries(KEYS.map((k) => [k, new MockHandle()])) as unknown as AthleteRigHandles;
const snapshot = (rig: AthleteRigHandles): unknown =>
  Object.fromEntries(KEYS.map((k) => [k, structuredClone({ ...(rig[k] as unknown as MockHandle) })]));

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
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const num = (r: () => number, lo: number, hi: number): number => lo + (hi - lo) * r();

const APPEARANCES: Array<AthleteAppearance | undefined> = [
  undefined,
  {},
  { skin: "#111111", shirt: "#222222", pants: "#333333", shoes: "#444444", racket: "#555555" },
  { shirt: "#aa0000" }
];
const resolve = (appearance: unknown): AthleteAppearance | undefined => APPEARANCES[(appearance as number | undefined) ?? 0];

describe("M-POSE rig: updateAthleteRig is identical to the live adapter code", () => {
  const original = createOriginalRig({ game, material, window: { TennisAppearance: { resolve } } });
  const STROKES = ["forehand", "backhand", "forehand-volley", "backhand-volley", "smash", "serve"] as const;

  it("matches transforms, visibility and materials over 4,000 pose/actor cases (exact)", () => {
    const r = rng(20261023);
    for (let i = 0; i < 4000; i++) {
      const side = pick(r, ["player", "ai"] as const);
      const isPlayer = side === "player";
      const actorBase = {
        side, moveBlend: pick(r, [0, 0.1, 0.4, 0.8, 1]), stride: num(r, 0, 30), vx: pick(r, [0, num(r, -1, 1)]), vy: pick(r, [0, num(r, -1, 1)]),
        splitStep: pick(r, [0, 0.1]), strokeContactAge: pick(r, [0, 0.14, 0.2]), swingAge: num(r, 0, 0.4), strokeConnected: r() < 0.5,
        swing: pick(r, [0, num(r, 0.01, 0.4)]), stroke: pick(r, STROKES), strokeContactZ: num(r, 0, 1.2), slideRemaining: pick(r, [0, num(r, 0, 0.3)]),
        slidePoseStatic: r() < 0.3, serveMotion: pick(r, [0, num(r, 0, 0.4)]), serveContactPoint: null
      } as unknown as PoseActor;
      const state = { phase: pick(r, ["serve", "rally", "serveToss"] as const), time: num(r, 0, 40), server: side, serveAttempt: null } as unknown as PoseMatchState;
      const p = pose(actorBase, state);
      const actorView = pick(r, [
        null, undefined, {}, { x: num(r, -1, 1), y: num(r, -1, 1), end: pick(r, [1, -1]), appearance: pick(r, [0, 1, 2, 3]) }
      ] as const);
      const isMoon = r() < 0.25;
      const a = makeRig(), b = makeRig();
      const ca = { lastKey: pick(r, ["", "x"]) }, cb = { lastKey: ca.lastKey };
      original.updateAthleteRig(a, actorView, p, isPlayer, isMoon, ca);
      updateAthleteRig(b, actorView as never, p, isPlayer, isMoon, cb, resolve);
      expect(snapshot(b)).toEqual(snapshot(a));
      expect(cb.lastKey).toBe(ca.lastKey);
    }
  });

  it("falls back to the original defaults when pose limbs are missing", () => {
    const base = pose({ side: "player", moveBlend: 0, stride: 0, vx: 0, vy: 0, splitStep: 0, strokeContactAge: 0, swingAge: 0, strokeConnected: false, swing: 0, stroke: "forehand", serveMotion: 0 } as unknown as PoseActor, { phase: "rally", time: 0, serveAttempt: null });
    const partial = { ...base, legs: undefined, left: undefined, right: undefined, racketDirection: undefined } as never;
    const a = makeRig(), b = makeRig();
    original.updateAthleteRig(a, {}, partial, true, false, { lastKey: "" });
    updateAthleteRig(b, {}, partial, true, false, { lastKey: "" }, resolve);
    expect(snapshot(b)).toEqual(snapshot(a));
  });
});

describe("M-POSE rig: node build and wiring", () => {
  it("builds one uniquely named node per rig handle (28) for both athletes and resolves every handle", () => {
    for (const isPlayer of [true, false]) {
      const nodes = buildAthleteNodes(isPlayer ? "p" : "a", isPlayer);
      const names = nodes.map((n) => (n as { name?: string }).name);
      expect(names).toHaveLength(KEYS.length);
      expect(new Set(names).size).toBe(KEYS.length);
      const seen: string[] = [];
      const rig = resolveAthleteRig({ nodes: { require: (id: string) => { seen.push(id); return new MockHandle() as never; } } }, isPlayer ? "p" : "a");
      expect(Object.keys(rig)).toHaveLength(KEYS.length);
      expect(seen).toHaveLength(KEYS.length);
    }
  });
});

describe("generated original rig", () => {
  it("is up to date with apps/showcase-top-tennis/src/main.ts", () => {
    expect(extractOriginalRig(readFileSync(MAIN_PATH, "utf8"))).toBe(readFileSync(OUT_PATH, "utf8"));
  });
});
