import { describe, expect, it } from "vitest";
import { FOV_KICK_DEG, INTRO_SECONDS, ORBIT_MAX, PUSH_SECONDS, createShotDirector, secondsSinceStageStart, type ShotInput } from "../../../examples/saiyan-snake-way-port/art/shots";
import { applyShot } from "../../../examples/saiyan-snake-way-port/world";
import { STAGES } from "../../../examples/saiyan-snake-way-port/sim";

const S = (over: Partial<ShotInput["S"]> = {}): ShotInput["S"] => ({ time: 10, s: 100, leg: "out", speed: 40, surge: "off", phase: "run", ...over });
const input = (s: ShotInput["S"], extra: Partial<ShotInput> = {}): ShotInput => ({ S: s, dt: 1 / 60, lean: 0, outro: 0, reducedMotion: false, ...extra });

describe("serpentine-sky-run camera shots (SSR-15)", () => {
  it("runs a 4 s intro with bars that eases into the chase camera", () => {
    const d = createShotDirector();
    const start = d.step(input(S({ time: 0 })));
    expect(start.name).toBe("intro");
    expect(start.intro).toBe(1);
    expect(start.bars).toBe(1);
    const mid = d.step(input(S({ time: INTRO_SECONDS / 2 })));
    expect(mid.intro).toBeGreaterThan(0);
    expect(mid.intro).toBeLessThan(1);
    expect(d.step(input(S({ time: INTRO_SECONDS }))).name).toBe("chase");
  });

  it("pushes in for 1.2 s after each stage boundary", () => {
    const from = (STAGES[1] as { from: number }).from;
    expect(secondsSinceStageStart(from - 1, 40)).toBe(Number.POSITIVE_INFINITY);
    const d = createShotDirector();
    const shot = d.step(input(S({ s: from + 0.5 * PUSH_SECONDS * 40 })));
    expect(shot.name).toBe("push");
    expect(shot.back).toBeLessThan(0.8);
    expect(d.step(input(S({ s: from + 2 * PUSH_SECONDS * 40 }))).back).toBe(1);
  });

  it("kicks the FOV on surge start, rolls with the lean and orbits the leap", () => {
    const d = createShotDirector();
    d.step(input(S()));
    expect(d.step(input(S({ surge: "on" }))).fovAdd).toBeGreaterThan(FOV_KICK_DEG * 0.9);
    for (let i = 0; i < 60; i++) d.step(input(S({ surge: "on" })));
    expect(d.shot.fovAdd).toBe(0);
    expect(d.step(input(S(), { lean: 0.2 })).roll).toBeCloseTo(0.2 / 3);
    const leap = d.step(input(S({ phase: "leap" }), { outro: 3 }));
    expect(leap.name).toBe("leap-orbit");
    expect(leap.orbit).toBeCloseTo(ORBIT_MAX);
  });

  it("reduced motion skips the push, the kick, the roll, the orbit and the intro move (bars stay)", () => {
    const from = (STAGES[1] as { from: number }).from;
    const d = createShotDirector();
    const rm = { reducedMotion: true };
    expect(d.step(input(S({ time: 0 }), rm))).toMatchObject({ intro: 0, bars: 1 });
    d.step(input(S(), rm));
    expect(d.step(input(S({ surge: "on", s: from + 10 }), { ...rm, lean: 0.2 }))).toMatchObject({ back: 1, fovAdd: 0, roll: 0 });
    expect(d.step(input(S({ phase: "leap" }), { ...rm, outro: 3 })).orbit).toBe(0);
  });

  it("applyShot keeps the chase pose for the plain chase shot and moves the eye ahead for the intro", () => {
    const eye: [number, number, number] = [0, 3, 8], look: [number, number, number] = [0, 1.6, -12], runner: [number, number, number] = [0, 0, 0];
    const chase = { intro: 0, bars: 0, back: 1, fovAdd: 0, roll: 0, orbit: 0, name: "chase" as const };
    expect(applyShot(chase, eye, look, runner, [0, 0, -1], [0, 1, 0])).toEqual([eye, look, [0, 1, 0]]);
    const [e] = applyShot({ ...chase, intro: 1, name: "intro" }, eye, look, runner, [0, 0, -1], [0, 1, 0]);
    expect(e[2]).toBeCloseTo(-40);
    expect(e[1]).toBeCloseTo(14);
  });
});
