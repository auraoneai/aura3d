import { describe, expect, it } from "vitest";
import { CA_PEAK, createCinePostDriver, motionBlurAmount, rollSectionAt, type CinePostInput } from "../../../examples/saiyan-snake-way-port/art/cinePost";
import { ROLL_SECTIONS } from "../../../examples/saiyan-snake-way-port/sim";

function fakePost(tier = "high") {
  const effects = new Map<string, Record<string, unknown>>();
  const enabled = new Map<string, boolean>();
  const app = {
    post: { setEffect: (name: string, patch: Record<string, unknown>) => { effects.set(name, patch); }, setEffectEnabled: (name: string, on: boolean) => { enabled.set(name, on); } },
    quality: { tier }
  };
  return { app, effects, enabled };
}

const run = (over: Partial<CinePostInput["S"]> = {}): CinePostInput["S"] => ({ speed: 40, surge: "off", phase: "run", s: 100, leg: "out", ...over });
const input = (S: CinePostInput["S"], extra: Partial<CinePostInput> = {}): CinePostInput => ({ S, dt: 1 / 60, reducedMotion: false, reducedFlash: false, ...extra });

describe("serpentine-sky-run speed and moment post (SSR-07)", () => {
  it("disables all three authored effects on the first frame of a slow run", () => {
    const f = fakePost();
    const d = createCinePostDriver(f.app as never);
    d.step(input(run()));
    expect(f.enabled.get("motionBlur")).toBe(false);
    expect(f.enabled.get("chromaticAberration")).toBe(false);
    expect(f.enabled.get("depthOfField")).toBe(false);
    d.step(input(run()));
    expect(d.writes).toBe(0);
  });

  it("ramps motion blur from 60 to 100 m/s on High and keeps it off on Medium", () => {
    expect(motionBlurAmount(60)).toBe(0);
    expect(motionBlurAmount(80)).toBeCloseTo(0.5);
    expect(motionBlurAmount(140)).toBe(1);
    const f = fakePost();
    const d = createCinePostDriver(f.app as never);
    d.step(input(run({ speed: 90 })));
    expect(f.enabled.get("motionBlur")).toBe(true);
    expect(d.state.motionBlur).toBeGreaterThan(0.5);
    const m = fakePost("medium");
    const dm = createCinePostDriver(m.app as never);
    dm.step(input(run({ speed: 120 })));
    expect(m.enabled.get("motionBlur")).toBe(false);
  });

  it("pulses aberration on surge start and on roll entry, then decays", () => {
    const f = fakePost();
    const d = createCinePostDriver(f.app as never);
    d.step(input(run()));
    d.step(input(run({ surge: "on" })));
    expect(f.enabled.get("chromaticAberration")).toBe(true);
    expect(d.state.aberration).toBeGreaterThan(CA_PEAK * 0.8);
    for (let i = 0; i < 30; i++) d.step(input(run({ surge: "on" })));
    expect(d.state.aberration).toBe(0);
    expect(f.enabled.get("chromaticAberration")).toBe(false);
    const roll = ROLL_SECTIONS[0]!;
    expect(rollSectionAt(roll.from + 1)).toBe(0);
    d.step(input(run({ surge: "on", s: roll.from + 1 })));
    expect(d.state.aberration).toBeGreaterThan(0);
  });

  it("focuses DOF on the outro only", () => {
    const f = fakePost();
    const d = createCinePostDriver(f.app as never);
    d.step(input(run()));
    d.step(input(run({ phase: "fall" })));
    expect(f.enabled.get("depthOfField")).toBe(true);
    expect(f.effects.get("depthOfField")!.focusDistance).toBeGreaterThan(0);
    d.step(input(run()));
    expect(f.enabled.get("depthOfField")).toBe(false);
  });

  it("reduced motion keeps blur, aberration and DOF off; reduced flash drops only the aberration", () => {
    const f = fakePost();
    const d = createCinePostDriver(f.app as never);
    const rm = { reducedMotion: true };
    d.step(input(run({ speed: 120 }), rm));
    d.step(input(run({ speed: 120, surge: "on" }), rm));
    d.step(input(run({ speed: 120, surge: "on", phase: "fall" }), rm));
    expect(d.state).toEqual({ motionBlur: 0, aberration: 0, depthOfField: false });
    const g = fakePost();
    const dg = createCinePostDriver(g.app as never);
    dg.step(input(run({ speed: 120 }), { reducedFlash: true }));
    dg.step(input(run({ speed: 120, surge: "on" }), { reducedFlash: true }));
    expect(dg.state.aberration).toBe(0);
    expect(dg.state.motionBlur).toBe(1);
  });
});

describe("serpentine-sky-run tier gating (SSR-19)", () => {
  it("keeps the second sun cascade on High / Ultra only and mirrors the engine's auto tier rule", async () => {
    const { sunCascades, autoTier } = await import("../../../examples/saiyan-snake-way-port/world");
    expect(sunCascades("high")).toBe(2);
    expect(sunCascades("ultra")).toBe(2);
    expect(sunCascades("medium")).toBe(1);
    expect(sunCascades("low")).toBe(1);
    expect(autoTier(true)).toBe("medium");
    expect(autoTier(false)).toBe("high");
  });
});
