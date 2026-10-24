import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIP_SECONDS, HERO_GAITS, STRIDE_SPEED } from "../../../examples/where-the-wind-wanders-port/locomotion";
import { glbStride } from "./glb-stride";

const HERO_HEIGHT = 2.9;
const hero = glbStride(resolve("examples/where-the-wind-wanders-port/assets/models/hero.glb"));
const scale = HERO_HEIGHT / hero.meshHeight;

describe("hero gait table comes from the rig", () => {
  it("planted-foot speed matches forward kinematics of hero.glb within 2%", () => {
    expect(Math.abs(hero.clips.Walk!.stanceFootSpeed * scale / STRIDE_SPEED.Walk - 1)).toBeLessThan(0.02);
    expect(Math.abs(hero.clips.Run!.stanceFootSpeed * scale / STRIDE_SPEED.Run - 1)).toBeLessThan(0.02);
  });
  it("clip durations match the file", () => {
    for (const name of ["Walk", "Run", "Idle"] as const) expect(hero.clips[name]!.duration).toBeCloseTo(CLIP_SECONDS[name], 2);
  });
  it("feeds the library gait table: idle, walk, run in speed order", () => {
    expect(HERO_GAITS.map((g) => g.name)).toEqual(["Idle", "Walk", "Run"]);
    expect(HERO_GAITS.map((g) => g.speed)).toEqual([0, STRIDE_SPEED.Walk, STRIDE_SPEED.Run]);
    expect(HERO_GAITS.map((g) => g.cycle)).toEqual([CLIP_SECONDS.Idle, CLIP_SECONDS.Walk, CLIP_SECONDS.Run]);
  });
});
