import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SWIPE_STORAGE_KEY, type RawSwipeGesture } from "../../../examples/aura-slam/contract/input";
import type { StorageLike } from "../../../examples/aura-slam/input/bindings";
import { classifyGesture, createGesture, createSwipePreferences, directionalTarget } from "../../../examples/aura-slam/input/swipe";

function loadUmd(file: string): unknown {
  const mod: { exports: unknown } = { exports: {} };
  new Function("module", "exports", readFileSync(resolve(process.cwd(), file), "utf8"))(mod, mod.exports);
  return mod.exports;
}
interface OriginalSwipe {
  classifyGesture(g: unknown): unknown;
  directionalTarget(shot: unknown, options: unknown): number | null;
  createGesture(): { begin(p: unknown): boolean; move(p: unknown): boolean; end(p: unknown): unknown; cancel(id?: number): boolean; snapshot(): unknown };
  create(o: { storage?: StorageLike | null }): { getPreference(): string; setPreference(s: unknown): unknown; subscribe(l: (e: unknown) => void): () => void };
  STORAGE_KEY: string;
}
const original = loadUmd("tests/fixtures/aura-slam-original/toptennis/mobile-swipe.js") as OriginalSwipe;

class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const bits = (n: number): number => n; // keep the grids readable

describe("M-INPUT swipe: differential against mobile-swipe.js", () => {
  it("uses the same storage key", () => {
    expect(SWIPE_STORAGE_KEY).toBe(original.STORAGE_KEY);
  });

  it("classifyGesture agrees (exactly) over a dense grid of end points, durations and screen sizes", () => {
    let cases = 0, shots = 0, mismatches = 0;
    for (const [width, height] of [[390, 844], [844, 390], [1280, 720], [600, 600]] as const) {
      for (let ex = -300; ex <= 300; ex += 12.5) {
        for (let ey = -330; ey <= 170; ey += 12.5) {
          for (const duration of [10, 30, 60, 120, 250, 600, 1500]) {
            const g: RawSwipeGesture = { startX: bits(width / 2), startY: bits(height * 0.7), endX: width / 2 + ex, endY: height * 0.7 + ey, startTime: 1000, endTime: 1000 + duration, width, height };
            const mine = classifyGesture(g);
            if (JSON.stringify(mine) !== JSON.stringify(original.classifyGesture(g))) mismatches++;
            cases++; if (mine) shots++;
          }
        }
      }
    }
    expect(mismatches).toBe(0);
    expect(cases).toBeGreaterThan(20000);
    expect(shots).toBeGreaterThan(2000);
  }, 120_000);

  it("classifyGesture agrees on invalid and degenerate input", () => {
    const base: RawSwipeGesture = { startX: 100, startY: 400, endX: 120, endY: 200, startTime: 0, endTime: 100, width: 400, height: 800 };
    const bad: unknown[] = [
      null, undefined, {}, { ...base, width: 0 }, { ...base, height: -1 }, { ...base, endTime: 0 }, { ...base, endTime: -5 }, { ...base, startX: NaN },
      { ...base, endY: Infinity }, { ...base, width: "400" }, { ...base, startTime: undefined }, { ...base, endX: 100, endY: 400 }, { ...base, endY: 450 },
    ];
    for (const g of bad) expect(classifyGesture(g as RawSwipeGesture)).toEqual(original.classifyGesture(g));
  });

  it("directionalTarget agrees over screen geometry grids including the rejection paths", () => {
    let cases = 0;
    for (let dx = -1; dx <= 1; dx += 0.125) {
      for (const dy of [-0.5, 0, 0.2, 0.5, 1]) {
        const shot = { targetX: 0, targetDepth: 0.5, directionX: dx, directionY: dy, strength: 1 };
        for (const geometry of [
          { origin: { x: 200, y: 700 }, left: { x: 40, y: 150 }, right: { x: 360, y: 150 } },
          { origin: { x: 20, y: 700 }, left: { x: 100, y: 300 }, right: { x: 300, y: 300 } },
          { origin: { x: 380, y: 650 }, left: { x: 150, y: 220 }, right: { x: 250, y: 220 }, minX: -0.5, maxX: 0.5 },
          { origin: { x: 200, y: 700 }, left: { x: 100, y: 300 }, right: { x: 100, y: 300 } },
          { origin: { x: 200, y: 700 }, left: { x: 0, y: 0 }, right: { x: 1, y: 1 }, minX: 1, maxX: 0.5 },
          { origin: { x: NaN, y: 1 }, left: { x: 0, y: 0 }, right: { x: 1, y: 1 } },
          { left: { x: 0, y: 0 }, right: { x: 1, y: 1 } },
        ]) {
          expect(directionalTarget(shot, geometry)).toEqual(original.directionalTarget(shot, geometry));
          cases++;
        }
      }
    }
    expect(directionalTarget(null, {})).toBe(original.directionalTarget(null, {}));
    expect(directionalTarget(undefined)).toBe(original.directionalTarget(undefined, undefined));
    expect(cases).toBeGreaterThan(250);
  });

  it("createGesture agrees step for step on scripted pointer sequences", () => {
    const script: Array<[("begin" | "move" | "end" | "cancel"), Record<string, unknown> | number | undefined]> = [
      ["move", { pointerId: 1, x: 5, y: 5, time: 10 }],
      ["begin", { pointerId: 1, x: 200, y: 700, time: 100, width: 390, height: 844 }],
      ["begin", { pointerId: 2, x: 10, y: 10, time: 100, width: 390, height: 844 }],
      ["move", { pointerId: 2, x: 5, y: 5, time: 120 }],
      ["move", { pointerId: 1, x: 205, y: 690, time: 90 }],
      ...Array.from({ length: 40 }, (_, i): ["move", Record<string, unknown>] => ["move", { pointerId: 1, x: 200 + i, y: 700 - i * 8, time: 110 + i * 10 }]),
      ["end", { pointerId: 2, x: 1, y: 1, time: 600 }],
      ["end", { pointerId: 1, x: 250, y: 380, time: 620 }],
      ["end", { pointerId: 1, x: 250, y: 380, time: 640 }],
      ["begin", { pointerId: 3, x: 100, y: 500, time: 1000, width: 390, height: 844 }],
      ["cancel", 9], ["cancel", undefined],
      ["begin", { pointerId: 4, x: 100, y: 500, time: 2000, width: 390, height: 844 }],
      ["end", { pointerId: 4, x: 100, y: 498, time: 2050 }],
      ["begin", { pointerId: 5.5, x: 1, y: 1, time: 1, width: 1, height: 1 }],
      ["begin", { pointerId: 6, x: 1, y: 1, time: 1, width: 0, height: 1 }],
    ];
    const mine = createGesture();
    const orig = original.createGesture();
    for (const [op, arg] of script) {
      const a = (mine[op] as (a: unknown) => unknown)(arg);
      const b = (orig[op] as (a: unknown) => unknown)(arg);
      expect(a).toEqual(b);
      expect(mine.snapshot()).toEqual(orig.snapshot());
    }
  });

  it("preferences persist, validate and notify like the original", () => {
    const s1 = new FakeStorage(), s2 = new FakeStorage();
    const mine = createSwipePreferences({ storage: s1 });
    const orig = original.create({ storage: s2 });
    const e1: unknown[] = [], e2: unknown[] = [];
    mine.subscribe((e) => e1.push(e)); orig.subscribe((e) => e2.push(e));
    expect(mine.getPreference()).toBe(orig.getPreference());
    for (const style of ["swipe", "classic", "bogus", undefined, 3, "swipe"]) {
      expect(mine.setPreference(style)).toEqual(orig.setPreference(style));
      expect(mine.getPreference()).toBe(orig.getPreference());
    }
    expect(e1).toEqual(e2);
    expect(s1.data.get(SWIPE_STORAGE_KEY)).toBe(s2.data.get(original.STORAGE_KEY));
    for (const raw of [JSON.stringify({ version: 1, style: "swipe" }), JSON.stringify({ version: 2, style: "swipe" }), JSON.stringify({ version: 1, style: "x" }), "junk", ""]) {
      const a = new FakeStorage(), b = new FakeStorage();
      a.data.set(SWIPE_STORAGE_KEY, raw); b.data.set(original.STORAGE_KEY, raw);
      expect(createSwipePreferences({ storage: a }).getPreference()).toBe(original.create({ storage: b }).getPreference());
    }
    expect(createSwipePreferences().setPreference("swipe")).toEqual({ ok: true, saved: false });
  });
});
