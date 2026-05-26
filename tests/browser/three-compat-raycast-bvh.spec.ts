import { test, expect } from "@playwright/test";
import { BVHV5, estimateV5AcceleratedRaycast } from "../../packages/rendering/src";

test("V5 BVH raycast acceleration reports large-geometry speedup", async ({ page }) => {
  const bvh = new BVHV5(250000);
  const raycast = estimateV5AcceleratedRaycast(bvh, 128);
  await page.setContent(`<html><body><script>window.__a3dRaycast=${JSON.stringify(raycast)}</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__a3dRaycast.speedup)).toBeGreaterThan(100);
});
