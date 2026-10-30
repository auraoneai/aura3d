import { describe, expect, it } from "vitest";
import { LEAN_MAX, auraPulse, createRunnerAnimator, runnerLean, type MixerActorLike } from "../../../examples/saiyan-snake-way-port/art/motion";

function fakeActor() {
  const calls: string[] = [];
  let advanced = 0;
  const actor: MixerActorLike = {
    crossFadeTo: (clip, seconds) => { calls.push(`fade:${clip}:${seconds}`); },
    playLayer: (layer, clip, o) => { calls.push(`layer:${layer}:${clip}:${o?.mask?.humanoid}`); },
    stopLayer: (layer) => { calls.push(`stop:${layer}`); },
    advance: (dt) => { advanced += dt; }
  };
  return { actor, calls, get advanced() { return advanced; } };
}

describe("serpentine-sky-run runner body language (SSR-14)", () => {
  it("leans into the bend and the lane change, at least 8 deg in a hard bend and never past 12 deg", () => {
    const deg = (r: number): number => (r * 180) / Math.PI;
    expect(deg(runnerLean(0, 0.019, 60))).toBeGreaterThanOrEqual(8);
    expect(runnerLean(0, 0.05, 120)).toBeCloseTo(LEAN_MAX);
    expect(runnerLean(-200, 0, 40)).toBeCloseTo(-LEAN_MAX);
    expect(runnerLean(0, -0.019, 60)).toBeLessThan(0);
    expect(runnerLean(0, 0, 60)).toBe(0);
  });

  it("halves the lean cap and softens the aura pulse on reduced motion", () => {
    expect(runnerLean(0, 0.05, 120, true)).toBeCloseTo(LEAN_MAX / 2);
    expect(auraPulse(1)).toBeCloseTo(1.35);
    expect(auraPulse(1, true)).toBeCloseTo(1.15);
    expect(auraPulse(0)).toBe(1);
  });

  it("cross-fades the base clip on change and blends Hit_React as a masked upper-body layer", () => {
    const f = fakeActor();
    const a = createRunnerAnimator(f.actor, "Hit_React");
    a.step({ clip: "Run_Loop", rate: 2, stumble: 0, dt: 0.1 });
    a.step({ clip: "Run_Loop", rate: 2, stumble: 0, dt: 0.1 });
    expect(f.calls).toEqual(["fade:Run_Loop:0"]);
    expect(f.advanced).toBeCloseTo(0.4);
    a.step({ clip: "Run_Loop", rate: 2, stumble: 0.75, dt: 0.1 });
    expect(a.hitLayer).toBe(true);
    expect(f.calls).toContain("layer:hit:Hit_React:upper-body");
    // the base clip is never swapped for the hit (no popped frame across the hit)
    expect(f.calls.filter((c) => c.startsWith("fade:"))).toHaveLength(1);
    a.step({ clip: "Run_Loop", rate: 2, stumble: 0.4, dt: 0.1 });
    a.step({ clip: "Run_Loop", rate: 2, stumble: 0, dt: 0.1 });
    expect(a.hitLayer).toBe(false);
    expect(f.calls.at(-1)).toBe("stop:hit");
    a.step({ clip: "Jump_Loop", rate: 1, stumble: 0, dt: 0.1 });
    expect(f.calls.at(-1)).toBe("fade:Jump_Loop:0.15");
  });
});
