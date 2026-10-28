import { describe, expect, it } from "vitest";
import { QualityGovernor, GOVERNOR_FEATURE_ORDER, type GovernorStep } from "../../../packages/rendering/src/quality/QualityGovernor";
import { createRenderScaleController } from "../../../packages/rendering/src/quality/RenderScaleController";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";

/**
 * WP-P1.3: the quality governor lowers quality when frame time stays over budget, and restores it after sustained headroom.
 *
 * It is NOT wired on by default: the app-level controller sits behind the dev-state A3D_QR_TIERS flag, and the
 * benchmark scenes run at tens to hundreds of milliseconds per frame on the software rasteriser, so a default-on
 * governor would immediately lower their render scale and change the frames the bench compares. This test pins the
 * behaviour so turning it on is a deliberate, visible decision.
 */
function makeGovernor(tier: "high" | "medium" = "high") {
  const target = QUALITY_TIERS[tier].targetFrameMs;
  const scaleSource = createRenderScaleController({ targetFrameMs: target, minScale: QUALITY_TIERS[tier].minRenderScale });
  const governor = new QualityGovernor({ tier, scaleSource });
  const steps: GovernorStep[] = [];
  governor.onStep((step) => steps.push(step));
  return { governor, steps, target, scaleSource };
}

describe("QualityGovernor engagement", () => {
  it("does nothing while frames stay within budget", () => {
    const { governor, steps, target } = makeGovernor();
    for (let i = 0; i < 1000; i += 1) governor.tick(target * 0.9, null);
    expect(governor.scale).toBe(1);
    expect(steps).toEqual([]);
    expect(governor.appliedSteps).toEqual([]);
  });

  it("lowers render scale first when frames exceed the budget", () => {
    const { governor, steps, target } = makeGovernor();
    for (let i = 0; i < 90; i += 1) governor.tick(target * 3, null);
    expect(governor.scale).toBeLessThan(1);
    expect(steps).toEqual([]); // render scale absorbs the first over-budget frames; no feature is touched yet
  });

  it("steps one feature down, in ladder order, once render scale is pinned at its floor and frames are still over budget", () => {
    const { governor, steps, target } = makeGovernor();
    for (let i = 0; i < 3000; i += 1) governor.tick(target * 4, null);
    expect(governor.scale).toBeLessThanOrEqual(governor.effectiveFloor + 1e-6);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((step) => step.direction === "down")).toBe(true);
    const order = steps.map((step) => GOVERNOR_FEATURE_ORDER.indexOf(step.feature));
    expect(order).toEqual([...order].sort((a, b) => a - b)); // ladder order, never skipping backwards
    expect(new Set(steps.map((step) => step.feature)).size).toBe(steps.length); // one step per feature
  });

  it("recovers the last step after sustained headroom", () => {
    const { governor, steps, target } = makeGovernor();
    for (let i = 0; i < 3000; i += 1) governor.tick(target * 4, null);
    const downSteps = steps.length;
    expect(downSteps).toBeGreaterThan(0);
    for (let i = 0; i < 2400; i += 1) governor.tick(target * 0.3, null);
    expect(steps.some((step) => step.direction === "up")).toBe(true);
    expect(governor.scale).toBe(1);
  });

  it("never steps while locked", () => {
    const { governor, steps, target } = makeGovernor();
    governor.setLocked(true);
    for (let i = 0; i < 3000; i += 1) governor.tick(target * 4, null);
    expect(steps).toEqual([]);
  });
});
