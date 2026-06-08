import { expect, test } from "@playwright/test";

test("2.5D animation recording lane is disabled for release-facing proof", async ({ page }) => {
  await page.goto("/?view=concept-2-5d&sampleTime=24&animateParallax=1");

  await expect(page.locator("#sample-episode-visual")).toBeVisible();
  await expect(page.locator("#concept-episode-2-5d")).toHaveCount(0);

  const proof = await page.evaluate(() => ({
    rejectedViews: (window as unknown as {
      __AURA3D_ANIMATION_TEMPLATE__?: { readonly rejectedViews?: readonly string[]; readonly rejectedViewReason?: string };
    }).__AURA3D_ANIMATION_TEMPLATE__?.rejectedViews ?? [],
    conceptProof: (window as unknown as { __AURA3D_ANIMATION_2_5D_PROOF__?: unknown }).__AURA3D_ANIMATION_2_5D_PROOF__
  }));

  expect(proof.conceptProof).toBeUndefined();
  expect(proof.rejectedViews).toContain("concept-2-5d");
});
