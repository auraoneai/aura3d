import { describe, expect, it, vi } from "vitest";
import { createJuice, type JuiceCamera, type JuiceSession } from "../../../packages/game/src/juice/Juice";
import { createTweenEngine } from "../../../packages/game/src/juice/tween";

function fakeCamera(energy: number): JuiceCamera & { trauma: number[]; punches: Record<string, number | undefined>[] } {
  const trauma: number[] = [];
  const punches: Record<string, number | undefined>[] = [];
  return {
    trauma,
    punches,
    shake: { add: (n) => trauma.push(n) },
    punch: { trigger: (o) => punches.push({ fov: o.fov, dolly: o.dolly }) },
    evidence: () => ({ layers: [{ id: "shake", energy }] })
  };
}

function fakeSession(opts: Partial<JuiceSession> = {}): JuiceSession & { stops: number[]; slows: [number, number][] } {
  const stops: number[] = [];
  const slows: [number, number][] = [];
  return {
    reducedMotion: false,
    reducedFlash: false,
    hitStop: (s) => stops.push(s),
    slowMo: (scale, ms) => slows.push([scale, ms]),
    ...opts,
    stops,
    slows
  };
}

function fakeOverlay() {
  const flashes: [string, number, number][] = [];
  const vignettes: [number, number, string | undefined][] = [];
  const fades: [number, number, string | undefined][] = [];
  return {
    flashes, vignettes, fades,
    backend: "dom" as const,
    flash: (c: string, p: number, ms: number) => void flashes.push([c, p, ms]),
    vignette: (a: number, ms: number, c?: string) => void vignettes.push([a, ms, c]),
    fade: async (v: number, ms: number, c?: string) => void fades.push([v, ms, c])
  };
}

const PRESETS = {
  hit: {
    fx: { kind: "spark", count: 8, color: "#fff" },
    cue: "impact",
    shake: 0.4,
    punch: { fovDeg: 6, dolly: 0.1, ms: 90 },
    hitStop: 0.05,
    flash: { color: "#ff0", peak: 0.4, ms: 80 },
    rumble: { ms: 80, strong: 1 }
  },
  collect: { cue: "pickup", vignette: { amount: 0.3, ms: 120 } }
} as const;

function makeDeps(o: { motion?: boolean; flash?: boolean; cameraEnergy?: number; cues?: string[]; now?: () => number }) {
  const cues = o.cues ?? [];
  const fxBursts: [string, number][] = [];
  return {
    deps: {
      events: PRESETS,
      camera: fakeCamera(o.cameraEnergy ?? 0.5),
      session: fakeSession({ reducedMotion: o.motion ?? false, reducedFlash: o.flash ?? false }),
      fx: { liveCount: 0, backend: "primitive-pool", burst: (k: string, _p: unknown, o2?: { count?: number }) => void fxBursts.push([k, o2?.count ?? 0]) } as never,
      overlay: fakeOverlay(),
      tweens: createTweenEngine(),
      sound: { cue: (c: string) => void cues.push(c) } as never,
      rumble: (o2: { ms: number }) => ({ via: "gamepad" }),
      now: o.now
    } satisfies Parameters<typeof createJuice>[0],
    fxBursts,
    cues
  };
}

describe("juice/Juice §7.6 (PRD-09 1746)", () => {
  it("fire() composes the preset: fx + cue + shake + punch + hitStop + flash + rumble", () => {
    const { deps, fxBursts, cues } = makeDeps({ cues: [] });
    const juice = createJuice(deps);
    juice.fire("hit", { position: [1, 2, 3], strength: 1 });
    expect(fxBursts).toEqual([["spark", 8]]);
    expect(cues).toEqual(["impact"]);
    expect((deps.camera as ReturnType<typeof fakeCamera>).trauma).toEqual([0.4]);
    expect((deps.camera as ReturnType<typeof fakeCamera>).punches[0]).toEqual({ fov: 6, dolly: 0.1 });
    expect(deps.session.stops).toEqual([0.05]);
    expect((deps.overlay as ReturnType<typeof fakeOverlay>).flashes).toEqual([["#ff0", 0.4, 80]]);
    expect(juice.snapshot().shake).toBe("applied");
    expect(juice.snapshot().rumbleVia).toBe("gamepad");
    expect(juice.snapshot().events.hit?.fired).toBe(1);
  });

  it("reduced motion: trauma ×0.25, punch ×0.5, hit-stop kept", () => {
    const { deps } = makeDeps({ motion: true });
    const juice = createJuice(deps);
    juice.fire("hit", { strength: 1 });
    expect((deps.camera as ReturnType<typeof fakeCamera>).trauma).toEqual([0.1]);
    expect((deps.camera as ReturnType<typeof fakeCamera>).punches[0]).toEqual({ fov: 3, dolly: 0.05 });
    expect(deps.session.stops).toEqual([0.05]);
  });

  it("records shake \"not-applied\" when camera layer energy stays 0", () => {
    const { deps } = makeDeps({ cameraEnergy: 0 });
    const juice = createJuice(deps);
    juice.shake(0.5);
    expect(juice.snapshot().shake).toBe("not-applied");
  });

  it("reduced flash: peak capped at 0.15 via edge vignette, ≤3 flashes/s", () => {
    let t = 0;
    const { deps } = makeDeps({ flash: true, now: () => t });
    const juice = createJuice(deps);
    for (let i = 0; i < 5; i++) juice.flash("#fff", { peak: 0.8, ms: 60 });
    const ov = deps.overlay as ReturnType<typeof fakeOverlay>;
    expect(ov.flashes).toHaveLength(0);
    expect(ov.vignettes).toHaveLength(3);
    expect(ov.vignettes[0][0]).toBeLessThanOrEqual(0.15);
    expect(juice.snapshot().droppedFlashes).toBe(2);
    t = 1.2; // >1s later: allowed again
    juice.flash("#fff", { peak: 0.8, ms: 60 });
    expect(ov.vignettes).toHaveLength(4);
  });

  it("unknown event warns, nothing fires", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, fxBursts } = makeDeps({});
    createJuice(deps).fire("nope" as never);
    expect(fxBursts).toHaveLength(0);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
