import { expect, test } from "@playwright/test";

test("2D puppet query is quarantined from release-facing cartoon-channel proof", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=puppet-2d&sampleTime=24");

  await expect(page.locator("#sample-episode-visual")).toBeVisible();
  await expect(page.locator("#puppet-episode-2d")).toHaveCount(0);
  await expect(page.locator(".puppet-robot")).toHaveCount(0);

  const quarantine = await page.evaluate(() => ({
    puppetProof: (window as unknown as { __AURA3D_CARTOON_2D_PUPPET_PROOF__?: unknown }).__AURA3D_CARTOON_2D_PUPPET_PROOF__,
    template: (window as unknown as {
      __AURA3D_CARTOON_TEMPLATE__?: {
        readonly releaseFacingViews?: readonly string[];
        readonly rejectedViews?: readonly string[];
        readonly rejectedViewReason?: string;
      };
    }).__AURA3D_CARTOON_TEMPLATE__
  }));

  expect(quarantine.puppetProof).toBeUndefined();
  expect(quarantine.template?.releaseFacingViews).toEqual(["sample-episode-visual"]);
  expect(quarantine.template?.rejectedViews).toContain("puppet-2d");
  expect(quarantine.template?.rejectedViewReason).toMatch(/still-image|cutout|animation readiness/i);
});
