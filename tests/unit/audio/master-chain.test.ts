import { describe, expect, it } from "vitest";
import { createMasterChain, safetyClipCurve } from "../../../packages/audio/src/game-sound/MasterChain";
import { FakeCompressor, FakeContext, FakeShaper } from "./fake-context";

describe("MasterChain (PRD-09 §6.8)", () => {
  it("wires gain → glue → limiter → shaper → destination in order", () => {
    const ctx = new FakeContext();
    const chain = createMasterChain(ctx, ctx.destination);
    expect(chain.stages).toEqual(["masterGain", "glue(-18dB)", "limiter(-1dB)", "safetyClip(±0.966)"]);
    const [glue, limiter] = ctx.ofKind<FakeCompressor>("compressor");
    expect(glue.threshold.value).toBe(-18);
    expect(glue.ratio.value).toBe(3);
    expect(limiter.threshold.value).toBe(-1);
    expect(limiter.ratio.value).toBe(20);
    const [shaper] = ctx.ofKind<FakeShaper>("shaper");
    expect(shaper.curve).not.toBeNull();
    // input → glue: the master gain's first connection is the glue stage.
    const gains = ctx.ofKind<{ kind: string; connectedTo: unknown[] }>("gain");
    expect(gains[0].connectedTo[0]).toBe(glue);
    expect(glue.connectedTo[0]).toBe(limiter);
    expect(limiter.connectedTo[0]).toBe(shaper);
    expect(shaper.connectedTo[0]).toBe(ctx.destination);
  });

  it("safety clip curve: endpoints ±0.966, linear below −6 dBFS", () => {
    const curve = safetyClipCurve();
    expect(curve[0]).toBeCloseTo(-0.966, 3);
    expect(curve[curve.length - 1]).toBeCloseTo(0.966, 3);
    // Even length → center straddles x=0: symmetric ±1/1023 samples.
    const mid = curve.length / 2;
    expect(curve[mid]).toBeCloseTo(-curve[mid - 1], 6);
    expect(Math.abs(curve[mid])).toBeLessThan(0.002);
    // x = 0.25 (< knee 0.5) → linear.
    const i = Math.round(((0.25 + 1) / 2) * (curve.length - 1));
    expect(curve[i]).toBeCloseTo(0.25, 2);
    // Monotone non-decreasing.
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
  });

  it("master.glue:false drops the glue stage but keeps limiter+clipper", () => {
    const ctx = new FakeContext();
    const chain = createMasterChain(ctx, ctx.destination, { glue: false });
    expect(chain.stages).toEqual(["masterGain", "limiter(-1dB)", "safetyClip(±0.966)"]);
    expect(ctx.ofKind("compressor").length).toBe(1);
  });

  it("setMasterGain clamps 0..1", () => {
    const ctx = new FakeContext();
    const chain = createMasterChain(ctx, ctx.destination);
    chain.setMasterGain(2);
    const [master] = ctx.ofKind<{ gain: { value: number } }>("gain");
    expect(master.gain.value).toBe(1);
    chain.setMasterGain(-1);
    expect(master.gain.value).toBe(0);
  });

  it("limiterEngaged reads live reduction only", () => {
    const ctx = new FakeContext();
    const chain = createMasterChain(ctx, ctx.destination);
    expect(chain.limiterEngaged).toBe(false);
    const [, limiter] = ctx.ofKind<FakeCompressor>("compressor");
    limiter.reduction = -4;
    expect(chain.limiterEngaged).toBe(true);
  });
});
