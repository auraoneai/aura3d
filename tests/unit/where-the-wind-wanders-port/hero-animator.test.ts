import { describe, expect, it } from "vitest";
import type { AuraApp } from "@aura3d/engine";
import { createHeroAnimator } from "../../../examples/where-the-wind-wanders-port/models";
import { CLIP_SECONDS, STRIDE_SPEED } from "../../../examples/where-the-wind-wanders-port/locomotion";
import { WALK_SPEED } from "../../../examples/where-the-wind-wanders-port/sim";

interface Call { clip: string; loop?: boolean; captureTime?: number; crossFade?: number | false }
function fakeApp(calls: Call[]): AuraApp {
  const hero = { play(clip: string, o: Omit<Call, "clip">) { calls.push({ clip, ...o }); return hero; } };
  return { nodes: { require: () => hero } } as unknown as AuraApp;
}
const STEP = 0.0167;

function walk(steps: number, twicePerStep: boolean) {
  const calls: Call[] = [];
  const anim = createHeroAnimator(fakeApp(calls));
  anim.reset(0, 0, 0);
  let x = 0, t = 0;
  for (let i = 0; i < steps; i++) {
    x += WALK_SPEED * STEP; t += STEP;
    anim.update({ x, z: 0, airborne: false, onBoat: false, time: t });
    if (twicePerStep) anim.update({ x, z: 0, airborne: false, onBoat: false, time: t });
  }
  return { calls, anim, x, t };
}

describe("hero animator", () => {
  it("advances the pinned phase by distance over planted-foot speed", () => {
    const { calls, anim } = walk(120, false);
    expect(anim.gait).toBe("Walk");
    const walking = calls.filter((c) => c.clip === "Walk");
    const per = (WALK_SPEED * STEP) / STRIDE_SPEED.Walk;
    // total phase travelled (unwrapped) after the settle steps equals distance / stride speed
    let travelled = 0;
    for (let i = 1; i < walking.length; i++) { let d = walking[i]!.captureTime! - walking[i - 1]!.captureTime!; if (d < 0) d += CLIP_SECONDS.Walk; travelled += d; }
    expect(travelled).toBeCloseTo(per * (walking.length - 1), 3);
  });
  it("gives the same phase whether update is called once or twice per sim step", () => {
    const a = walk(120, false).calls.at(-1)!;
    const b = walk(120, true).calls.at(-1)!;
    expect(b.clip).toBe(a.clip);
    expect(b.captureTime).toBeCloseTo(a.captureTime!, 6);
  });
  it("pins the pose and only crossfades on a gait change", () => {
    const { calls } = walk(120, false);
    expect(calls.every((c) => c.loop === false)).toBe(true);
    const fades = calls.map((c, i) => (c.crossFade !== false ? i : -1)).filter((i) => i >= 0);
    const changes = calls.map((c, i) => (i === 0 || c.clip !== calls[i - 1]!.clip ? i : -1)).filter((i) => i >= 0);
    expect(fades).toEqual(changes);
  });
  it("idles on the sim clock and ignores boat motion", () => {
    const calls: Call[] = [];
    const anim = createHeroAnimator(fakeApp(calls));
    anim.reset(5, 5, 0);
    anim.update({ x: 5, z: 5, airborne: false, onBoat: false, time: 1.25 });
    expect(calls.at(-1)).toMatchObject({ clip: "Idle", captureTime: 1.25 });
    anim.update({ x: 50, z: 50, airborne: false, onBoat: true, time: 1.3 });
    expect(anim.gait).toBe("Idle");
  });
});
