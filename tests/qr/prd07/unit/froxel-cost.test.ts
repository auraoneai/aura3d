// PRD-07 C-31 / FIX-froxel-cost — the volumetric contributor falls back to
// the analytic fog path while the measured GPU-ms EWMA exceeds the tier
// budget (hysteresis: back on below 75%). The 8-frame warmup ignores
// single-frame spikes, matching LowResAutoBudget's policy.

import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import {
  notePrd07VolumetricGpuMs,
  prd07VolumetricCostFallback,
  froxelBudgetMs
} from "../../../../packages/rendering/src/vfx/contributors";

const feed = (device: MockRenderDevice, ms: number, n: number) => {
  for (let i = 0; i < n; i += 1) notePrd07VolumetricGpuMs(device, ms);
};

describe("froxel cost gate (C-31)", () => {
  it("stays off during the 8-frame warmup even when over budget", () => {
    const device = new MockRenderDevice();
    feed(device, 99, 7);
    expect(prd07VolumetricCostFallback(device, 1.2)).toBe(false);
  });

  it("flips to the analytic fallback once the EWMA clears the budget", () => {
    const device = new MockRenderDevice();
    feed(device, 5, 10);
    expect(prd07VolumetricCostFallback(device, 1.2)).toBe(true);
  });

  it("releases the fallback below 75% of the budget", () => {
    const device = new MockRenderDevice();
    feed(device, 5, 10);
    expect(prd07VolumetricCostFallback(device, 1.2)).toBe(true);
    feed(device, 0.1, 40);
    expect(prd07VolumetricCostFallback(device, 1.2)).toBe(false);
  });

  it("budget table: high froxel gets the 2.0ms cap, medium 1.2ms", () => {
    expect(froxelBudgetMs({ volumetricFog: "froxel-high" })).toBe(2.0);
    expect(froxelBudgetMs({ volumetricFog: "froxel-medium" })).toBe(1.2);
    expect(froxelBudgetMs({})).toBe(1.2);
  });
});
