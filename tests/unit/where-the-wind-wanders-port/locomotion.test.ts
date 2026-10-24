import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIP_SECONDS, STRIDE_SPEED, footSlide, pickGait, playbackRate, quantiseRate } from "../../../examples/where-the-wind-wanders-port/locomotion";
import { WALK_SPEED } from "../../../examples/where-the-wind-wanders-port/sim";
import { glbStride } from "./glb-stride";

const HERO_HEIGHT = 2.9;
const hero = glbStride(resolve("examples/where-the-wind-wanders-port/assets/models/hero.glb"));
const scale = HERO_HEIGHT / hero.meshHeight;

describe("hero stride constants come from the rig", () => {
  it("planted-foot speed matches forward kinematics of hero.glb within 2%", () => {
    expect(hero.clips.Walk!.stanceFootSpeed * scale).toBeCloseTo(STRIDE_SPEED.Walk, 1);
    expect(Math.abs(hero.clips.Walk!.stanceFootSpeed * scale / STRIDE_SPEED.Walk - 1)).toBeLessThan(0.02);
    expect(Math.abs(hero.clips.Run!.stanceFootSpeed * scale / STRIDE_SPEED.Run - 1)).toBeLessThan(0.02);
  });
  it("clip durations match the file", () => {
    for (const name of ["Walk", "Run", "Idle"] as const) expect(hero.clips[name]!.duration).toBeCloseTo(CLIP_SECONDS[name], 2);
  });
});

describe("gait selection and playback rate", () => {
  it("walks at the sim's walk speed with no foot slide", () => {
    expect(pickGait("Idle", WALK_SPEED, false)).toBe("Walk");
    expect(footSlide("Walk", WALK_SPEED)).toBeLessThan(0.05);
  });
  it("keeps the planted foot at ground speed across the unclamped range", () => {
    for (const v of [1.6, 2.0, 2.6, 3.2, 3.8]) expect(footSlide("Walk", v)).toBeLessThan(1e-9);
    for (const v of [4.6, 5.6, 7.0]) expect(footSlide("Run", v)).toBeLessThan(1e-9);
  });
  it("uses hysteresis so a speed hovering at a threshold does not flicker", () => {
    let g = pickGait("Idle", 0.41, false);
    expect(g).toBe("Walk");
    for (const v of [0.35, 0.3, 0.28, 0.4]) { g = pickGait(g, v, false); expect(g).toBe("Walk"); }
    expect(pickGait("Walk", 0.2, false)).toBe("Idle");
    expect(pickGait("Walk", 4.7, false)).toBe("Run");
    expect(pickGait("Run", 4.2, false)).toBe("Run");
    expect(pickGait("Run", 3.9, false)).toBe("Walk");
  });
  it("plays the run clip airborne at rate 1 and idles at rate 1", () => {
    expect(pickGait("Idle", 0, true)).toBe("Run");
    expect(playbackRate("Run", 3.2, true)).toBe(1);
    expect(playbackRate("Idle", 0, false)).toBe(1);
  });
  it("quantises rates to 0.05 steps", () => {
    expect(quantiseRate(1.383)).toBe(1.4);
    expect(quantiseRate(1.374)).toBe(1.35);
  });
});
