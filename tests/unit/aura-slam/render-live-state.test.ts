import { describe, expect, it } from "vitest";
import { createAthletePose } from "../../../examples/aura-slam/view/pose";
import { ballWorld } from "../../../examples/aura-slam/view/ball";
import { playedEngine } from "./ui-original";

function nonFinite(value: unknown, path = ""): string[] {
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => nonFinite(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => nonFinite(v, `${path}.${k}`));
  return [];
}

describe("aura-slam view: the pose solver and ball placement accept real engine states", () => {
  const pose = createAthletePose();
  for (const steps of [0, 5, 70, 140, 200, 400]) {
    it(`finite poses and ball position after ${steps} steps`, () => {
      const engine = playedEngine(steps);
      const state = JSON.parse(JSON.stringify(engine.state));
      for (const side of ["player", "ai"] as const) expect(nonFinite(pose.pose(state[side], state)), `${side} pose`).toEqual([]);
      expect(nonFinite(ballWorld(state.ball))).toEqual([]);
      for (const side of ["player", "ai"] as const) {
        const r = pose.pose(state[side], state) as unknown as Record<string, unknown>;
        for (const k of ["hipY", "shoulderY", "headY", "torsoYaw", "leanX", "leanZ"]) expect(typeof r[k], `${side}.${k}`).toBe("number");
        for (const k of ["right", "left", "racketDirection"]) { expect(Array.isArray(r[k]), `${side}.${k}`).toBe(true); expect((r[k] as unknown[]).every((x) => typeof x === "number"), `${side}.${k} numeric`).toBe(true); }
        const legs = r.legs as Array<Record<string, unknown>>;
        expect(legs).toHaveLength(2);
        for (const leg of legs) for (const k of ["hip", "knee", "foot"]) expect((leg[k] as unknown[]).length, `${side}.legs.${k}`).toBe(3);
      }
    });
  }
});
