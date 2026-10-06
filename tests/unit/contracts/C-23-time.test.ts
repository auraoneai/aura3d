import { describe, expect, it } from "vitest";
import { StubTimeController, StubFeelBus } from "@aura3d/engine/contracts";

describe("C-23 time controller", () => {
  it("advance returns scaled dt and accumulates simTime", () => {
    const t = new StubTimeController();
    t.scale = 0.5;
    expect(t.advance(0.016)).toBeCloseTo(0.008, 5);
    expect(t.simTime).toBeCloseTo(0.008, 5);
    expect(t.realTime).toBeCloseTo(0.016, 5);
  });
  it("hitStop freezes sim time while real time advances", () => {
    const t = new StubTimeController();
    t.hitStop(0.05);
    expect(t.advance(0.016)).toBe(0);
    expect(t.simTime).toBe(0);
    expect(t.realTime).toBeCloseTo(0.016, 5);
  });
  it("slowMo scales then eases back", () => {
    const t = new StubTimeController();
    t.slowMo(0.25, 0.03, { easeOut: 0 });
    expect(t.advance(0.01)).toBeCloseTo(0.0025, 6);
    t.advance(0.03);
    expect(t.scale).toBe(1);
  });
  it("feel bus counts emitted events", () => {
    const bus = new StubFeelBus();
    bus.define("impact", { hitStop: { seconds: 0.05 } });
    bus.emit("impact");
    expect(bus.evidence().emitted).toBe(1);
    expect(bus.evidence().executed.hitStop).toBe(1);
  });
});
