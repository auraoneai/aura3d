/**
 * S19 headless mirror (tier-budgets.spec.ts): the same `?scene=tier` harness
 * pipeline + scenarios-tier.ts on a canvas-less app. Pins what needs no GPU or
 * heap profiler — tier forced through `app.quality.set`, handle population,
 * per-frame sphere-cast cap under over-demand, fade + screen-feel tier gating,
 * listener glue — with the browser spec's checks.ts assertions. The GPU
 * scenario must fail closed headless (no WebGL2 context), never skip.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createAuraApp, type AuraApp } from "@aura3d/engine";
import { CAMERA_PROBE_TIER_BUDGETS } from "@aura3d/engine/lanes";
import { mountHarnessPipeline, type HarnessPipeline } from "../harness/pipeline";
import { buildHarnessScene, loadHarnessScene } from "../harness/scenes";
import { runScenario } from "../harness/scenarios";
import { tierUnmount } from "../harness/scenarios-tier";
import { PRD08_TIERS, PRD08_TIER_BUDGETS, checkTierGating, type Expect, type TierCpuResult } from "../checks";

const mounted: { app: AuraApp; p: HarnessPipeline }[] = [];
afterEach(() => {
  tierUnmount();
  for (const m of mounted.splice(0)) {
    m.p.driver.dispose();
    m.app.dispose();
  }
});

async function open(query: string) {
  const params = new URLSearchParams(query);
  const def = await loadHarnessScene(params.get("scene"), params);
  const app = createAuraApp(null, {
    scene: buildHarnessScene(def),
    qualityRebuild: { flags: ["camera", "camera.loop", "camera.interpolation"] }
  } as never);
  let clock = 0;
  const m = { app, p: mountHarnessPipeline(app, def, params, () => (clock += 1)) };
  mounted.push(m);
  return m;
}

describe("S19 tier budgets — headless mirror", () => {
  it("lane probe budget table matches the PRD-08 §17 table in checks.ts", () => {
    for (const tier of PRD08_TIERS) {
      const lane = CAMERA_PROBE_TIER_BUDGETS[tier];
      const prd = PRD08_TIER_BUDGETS[tier];
      expect(lane.sphereCasts, tier).toBe(prd.sphereCasts);
      expect(lane.occluderQueries, tier).toBe(prd.occluderQueries);
      expect(lane.fade, tier).toBe(prd.fade);
    }
  });

  for (const tier of PRD08_TIERS) {
    it(`${tier}: cast cap, handle count, fade + screen-feel gating`, async () => {
      const { app, p } = await open("?scripted=1&scene=tier&maxSubSteps=4");
      const ctx = { app, pipeline: p };
      const mount = (await runScenario(ctx, "tier-mount", { tier, handles: PRD08_TIER_BUDGETS[tier].handles, warmup: 30 })) as {
        storeSize: number;
      };
      expect(mount.storeSize).toBe(PRD08_TIER_BUDGETS[tier].handles);
      const r = runScenario(ctx, "tier-cpu", { frames: 60 }) as TierCpuResult;
      checkTierGating(expect as unknown as Expect, tier, r);
      expect(r.cpuMs.every((ms) => Number.isFinite(ms) && ms >= 0)).toBe(true);
    });
  }

  it("tier-gpu fails closed without a WebGL2 context (never skips)", async () => {
    const { app, p } = await open("?scripted=1&scene=tier");
    await expect(runScenario({ app, pipeline: p }, "tier-gpu", { tier: "high", frames: 4, lane: false }) as Promise<unknown>).rejects.toThrow(
      /S19 GPU: the harness canvas has no WebGL2 context/
    );
  });

  it("tier-cpu before tier-mount is an error", async () => {
    const { app, p } = await open("?scripted=1&scene=tier");
    expect(() => runScenario({ app, pipeline: p }, "tier-cpu", { frames: 1 })).toThrow(/before tier-mount/);
  });
});
