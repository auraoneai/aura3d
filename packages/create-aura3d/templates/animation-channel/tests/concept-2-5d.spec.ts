import { expect, test } from "@playwright/test";

test("2.5D concept query is quarantined from the release-facing animation route", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=concept-2-5d&sampleTime=24&parallax=0.78&animateParallax=1");

  await expect(page.locator("#sample-episode-visual")).toBeVisible();
  await expect(page.locator("#concept-episode-2-5d")).toHaveCount(0);
  await expect(page.locator("[data-sample-caption]")).toContainText(/tiny circle|stones|cleanup/i);

  const quarantine = await page.evaluate(() => ({
    releaseFacingView: document.body.dataset.animationReleaseFacingView,
    rejectedViews: document.body.dataset.animationRejectedViews,
    conceptProof: (window as unknown as { __AURA3D_ANIMATION_2_5D_PROOF__?: unknown }).__AURA3D_ANIMATION_2_5D_PROOF__,
    template: (window as unknown as {
      __AURA3D_ANIMATION_TEMPLATE__?: {
        readonly releaseFacingViews?: readonly string[];
        readonly rejectedViews?: readonly string[];
        readonly rejectedViewReason?: string;
      };
    }).__AURA3D_ANIMATION_TEMPLATE__
  }));

  expect(quarantine.releaseFacingView).toBe("sample-episode-visual");
  expect(quarantine.rejectedViews).toContain("concept-2-5d");
  expect(quarantine.conceptProof).toBeUndefined();
  expect(quarantine.template?.releaseFacingViews).toEqual(["sample-episode-visual"]);
  expect(quarantine.template?.rejectedViews).toContain("concept-2-5d");
  expect(quarantine.template?.rejectedViewReason).toMatch(/notTrue3D|still-image|cutout/i);
});
