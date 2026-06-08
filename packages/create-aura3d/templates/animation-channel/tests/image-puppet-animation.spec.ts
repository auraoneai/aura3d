import { expect, test } from "@playwright/test";

test("image-puppet animation recording lane cannot produce release-facing proof", async ({ page }) => {
  await page.goto("/?view=image-puppet&sampleTime=24");

  await expect(page.locator("#sample-episode-visual")).toBeVisible();
  await expect(page.locator("#image-puppet-episode")).toHaveCount(0);

  const proof = await page.evaluate(() => ({
    rejectedViews: (window as unknown as {
      __AURA3D_ANIMATION_TEMPLATE__?: { readonly rejectedViews?: readonly string[]; readonly rejectedViewReason?: string };
    }).__AURA3D_ANIMATION_TEMPLATE__?.rejectedViews ?? [],
    imagePuppetProof: (window as unknown as { __AURA3D_ANIMATION_IMAGE_PUPPET_PROOF__?: unknown }).__AURA3D_ANIMATION_IMAGE_PUPPET_PROOF__
  }));

  expect(proof.imagePuppetProof).toBeUndefined();
  expect(proof.rejectedViews).toContain("image-puppet");
});
