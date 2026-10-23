import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { playedEngine } from "./ui-original";

type Call = { id: string; fn: string; args: unknown[] };
const calls: Call[] = [];

vi.mock("@aura3d/engine", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  const handle = (id: string): unknown => new Proxy({}, { get: (_t, fn: string) => (...args: unknown[]) => { calls.push({ id, fn, args }); return handle(id); } });
  return { ...real, createAuraApp: () => ({ ready: async () => undefined, nodes: { require: (id: string) => handle(id) } }) };
});

function nonFinite(value: unknown, path = ""): string[] {
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => nonFinite(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => nonFinite(v, `${path}.${k}`));
  return [];
}

describe("aura-slam view: every transform handed to the engine is finite for real engine states", () => {
  let renderer: ReturnType<typeof import("../../../examples/aura-slam/view/renderer").createSceneRenderer>;
  beforeAll(async () => {
    const { createSceneRenderer } = await import("../../../examples/aura-slam/view/renderer");
    const { createAthletePose } = await import("../../../examples/aura-slam/view/pose");
    renderer = createSceneRenderer({ pose: createAthletePose(), safety: false });
    await renderer.mount({ dataset: {}, getContext: () => null } as unknown as HTMLCanvasElement);
  }, 180_000);
  for (const steps of [0, 5, 70, 140, 200, 400]) {
    it(`after ${steps} steps`, () => {
      const state = JSON.parse(JSON.stringify(playedEngine(steps).state));
      calls.length = 0;
      renderer.render(state, 1 / 60);
      expect(calls.length).toBeGreaterThan(50);
      const bad = calls.flatMap((c) => nonFinite(c.args).map((p) => `${c.id}.${c.fn}${p}`));
      expect(bad).toEqual([]);
    });
  }

  for (const venue of ["hard", "grass", "clay", "desert", "beach", "moon"]) {
    it(`live page state captured on ${venue}`, () => {
      const state = JSON.parse(readFileSync(`tests/fixtures/aura-slam/live-state-${venue}.json`, "utf8"));
      calls.length = 0;
      renderer.render(state, 1 / 60);
      const bad = calls.flatMap((c) => nonFinite(c.args).map((p) => `${c.id}.${c.fn}${p}`));
      expect(bad).toEqual([]);
    });
  }
});
