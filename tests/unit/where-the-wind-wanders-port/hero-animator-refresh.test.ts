import { describe, expect, it } from "vitest";
import type { AuraApp } from "@aura3d/engine";
import { createFixedStepLoop } from "@aura3d/engine";
import { createHeroAnimator } from "../../../examples/where-the-wind-wanders-port/models";
import { createWindPresenter, viewOf } from "../../../examples/where-the-wind-wanders-port/presentation";
import { CLIP_SECONDS } from "../../../examples/where-the-wind-wanders-port/locomotion";
import { VIRTUAL_STEP_MS, createState, stepFrame } from "../../../examples/where-the-wind-wanders-port/sim";

interface Call { clip: string; captureTime?: number; crossFade?: number | false }

/** Runs main.ts's real pipeline (fixed-step loop, presenter, animator) at a display refresh rate with timestamp jitter. */
function run(hz: number, jitter: number, seconds: number, walkFrom = 0.5, walkTo = seconds - 0.5) {
  const calls: Call[] = [];
  const hero = { play(clip: string, o: Omit<Call, "clip">) { calls.push({ clip, ...o }); return hero; } };
  const anim = createHeroAnimator({ nodes: { require: () => hero } } as unknown as AuraApp);
  const state = createState();
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5;
  let t = 0;
  const loop = createFixedStepLoop({
    manual: false, stepSeconds: VIRTUAL_STEP_MS / 1000, maxFrameSeconds: 0.1, minFrameSeconds: 0,
    step() { stepFrame(state, { keys: t >= walkFrom && t < walkTo ? "D" : "", act: null }, VIRTUAL_STEP_MS); presenter.afterStep(); }
  });
  const presenter = createWindPresenter(() => state);
  anim.reset(state.pos.x, state.pos.z, 0);
  let renderTime = 0, last = 0;
  const frames: { clip: string; phase: number; walking: boolean }[] = [];
  const period = 1000 / hz;
  for (let now = period; now < seconds * 1000; now += period + jitter * period * (rnd() * 2)) {
    t = now / 1000;
    const dt = now - last; last = now;
    loop.tick(now);
    renderTime += dt / 1000;
    const v = viewOf(state, presenter.present(loop, true));
    anim.update({ x: v.pos.x, z: v.pos.z, airborne: false, onBoat: false, time: renderTime });
    const c = calls.at(-1)!;
    frames.push({ clip: c.clip, phase: c.captureTime!, walking: t >= walkFrom + 0.8 && t < walkTo });
  }
  return { calls, frames };
}

describe("hero gait with stepped (un-interpolated) positions on a faster display", () => {
  // the hypothesised bug: position only changes on 60 Hz sim steps while frames arrive at 144 Hz, so the per-frame speed
  // alternates between 0 and a spike. The animator must hold Walk, keep the phase moving, and not re-issue crossfades.
  it("holds Walk with one crossfade per real gait change", () => {
    const calls: Call[] = [];
    const hero = { play(clip: string, o: Omit<Call, "clip">) { calls.push({ clip, ...o }); return hero; } };
    const anim = createHeroAnimator({ nodes: { require: () => hero } } as unknown as AuraApp);
    anim.reset(0, 0, 0);
    const frame = 1 / 144, step = VIRTUAL_STEP_MS / 1000;
    let z = 0, simTime = 0;
    const phases: number[] = [];
    for (let i = 1; i <= 144 * 4; i++) {
      const t = i * frame;
      while (simTime + step <= t) { simTime += step; if (t > 0.5) z += 3.2 * step; }
      anim.update({ x: 0, z, airborne: false, onBoat: false, time: t });
      if (t > 1.5) phases.push(calls.at(-1)!.captureTime!);
    }
    expect(calls.at(-1)!.clip).toBe("Walk");
    expect(calls.filter((c) => c.crossFade !== false).length).toBeLessThanOrEqual(2);
    let stalls = 0;
    for (let i = 1; i < phases.length; i++) { let d = phases[i]! - phases[i - 1]!; if (d < 0) d += CLIP_SECONDS.Walk; if (d < 1e-6) stalls++; }
    expect(stalls).toBe(0);
  });
});

describe("hero gait at display refresh rates (sliding regression)", () => {
  for (const hz of [30, 60, 75, 120, 144, 165, 240]) {
    it(`${hz} Hz with jittered frame times: one Idle to Walk switch and a continuous cycle`, () => {
      const { calls, frames } = run(hz, 0.25, 6);
      const switches = calls.filter((c, i) => i > 0 && c.clip !== calls[i - 1]!.clip).length;
      const fades = calls.filter((c) => c.crossFade !== false).length;
      const walking = frames.filter((f) => f.walking);
      const clips = new Set(walking.map((f) => f.clip));
      console.log(hz, "switches", switches, "fades", fades, [...clips].join());
      expect(switches).toBeLessThanOrEqual(4);
      expect(fades).toBeLessThanOrEqual(5);
      expect(walking.every((f) => f.clip === walking[0]!.clip)).toBe(true);
      // phase advances monotonically in small increments (no stalls or jumps) while walking
      let maxJump = 0, stalls = 0;
      for (let i = 1; i < walking.length; i++) {
        let d = walking[i]!.phase - walking[i - 1]!.phase; if (d < 0) d += CLIP_SECONDS.Walk;
        maxJump = Math.max(maxJump, d); if (d < 1e-6) stalls++;
      }
      console.log(hz, "maxJump", maxJump.toFixed(4), "stalls", stalls);
      expect(stalls).toBe(0);
    });
  }
});
