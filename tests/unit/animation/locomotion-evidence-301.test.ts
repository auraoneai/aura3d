import { describe, expect, it } from "vitest";
import { measureLocomotionStances, type LocomotionContactSample } from "@aura3d/animation";
const frame = (time: number, x: number, stance = true, supportId = "floor"): LocomotionContactSample => ({
  time, side: "left", stance, supportId, supportLocalPosition: [x, 0, 0], contactError: 0.002
});
describe("E01 measured stance intervals", () => {
  it("rejects cumulative drift that individually small frame deltas would hide", () => {
    const report = measureLocomotionStances(Array.from({ length: 21 }, (_, i) => frame(i / 60, i * 0.002)), 2);
    expect(report.maxSlip).toBeCloseTo(0.04); expect(report.slipLimit).toBe(0.02); expect(report.passed).toBe(false);
  });
  it("starts a fresh anchor after swing and after changing moving support", () => {
    const report = measureLocomotionStances([frame(0, 0), frame(1, 0), frame(2, 2, false), frame(3, 3), frame(4, 3), frame(5, 10, true, "platform"), frame(6, 10, true, "platform")], 2);
    expect(report.intervals).toHaveLength(3); expect(report.maxSlip).toBe(0); expect(report.passed).toBe(true);
    expect(report.worstContactError).toBe(0.002);
  });
  it("does not pass empty or single-frame evidence", () => {
    expect(measureLocomotionStances([], 2).passed).toBe(false);
    expect(measureLocomotionStances([frame(0, 0)], 2).passed).toBe(false);
  });
  it("rejects invalid samples and nonmonotonic time", () => {
    expect(() => measureLocomotionStances([frame(0, 0), frame(0, 1)], 2)).toThrow();
    expect(() => measureLocomotionStances([frame(0, NaN)], 2)).toThrow();
    expect(() => measureLocomotionStances([], 0)).toThrow();
  });
});
