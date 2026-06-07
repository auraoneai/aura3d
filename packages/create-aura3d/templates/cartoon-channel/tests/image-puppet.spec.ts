import { expect, test } from "@playwright/test";

test("image-puppet query is kept as rejected evidence and does not mount a cutout route", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=image-puppet&sampleTime=24");

  await expect(page.locator("#sample-episode-visual")).toBeVisible();
  await expect(page.locator("#image-puppet-episode")).toHaveCount(0);
  await expect(page.locator("[data-source-cutout]")).toHaveCount(0);

  const quarantine = await page.evaluate(() => ({
    imagePuppetProof: (window as unknown as { __AURA3D_CARTOON_IMAGE_PUPPET_PROOF__?: unknown }).__AURA3D_CARTOON_IMAGE_PUPPET_PROOF__,
    sampleProof: (window as unknown as { __AURA3D_CARTOON_SAMPLE_EPISODE__?: { visualLayer?: { renderedBy?: string } } })
      .__AURA3D_CARTOON_SAMPLE_EPISODE__,
    template: (window as unknown as {
      __AURA3D_CARTOON_TEMPLATE__?: {
        readonly releaseFacingViews?: readonly string[];
        readonly rejectedViews?: readonly string[];
        readonly rejectedViewReason?: string;
      };
    }).__AURA3D_CARTOON_TEMPLATE__
  }));

  expect(quarantine.imagePuppetProof).toBeUndefined();
  expect(quarantine.sampleProof?.visualLayer?.renderedBy).toBe("aura3d-scene");
  expect(quarantine.template?.releaseFacingViews).toEqual(["sample-episode-visual"]);
  expect(quarantine.template?.rejectedViews).toContain("image-puppet");
  expect(quarantine.template?.rejectedViewReason).toMatch(/still-image|flat cutout|notTrue3D/i);
});
