import { test, expect } from "@playwright/test";
import { BVHThreeCompat, estimateThreeCompatAcceleratedRaycast } from "../../packages/rendering/src";

test("ThreeCompat BVH raycast acceleration reports large-geometry speedup", async ({ page }) => {
  const bvh = new BVHThreeCompat(250000);
  const raycast = estimateThreeCompatAcceleratedRaycast(bvh, 128);
  await page.setContent(`<html><body><script>window.__a3dRaycast=${JSON.stringify(raycast)}</script></body></html>`);
  await expect.poll(async () => page.evaluate(() => window.__a3dRaycast.speedup)).toBeGreaterThan(100);
});
