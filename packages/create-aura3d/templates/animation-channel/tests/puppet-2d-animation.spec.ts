import { expect, test } from "@playwright/test";

test("2D puppet recording lane remains negative evidence only", async ({ page }) => {
  await page.goto("/?view=puppet-2d&sampleTime=24");

  await expect(page.locator("#sample-episode-visual")).toBeVisible();
  await expect(page.locator("#puppet-episode-2d")).toHaveCount(0);

  const proof = await page.evaluate(() => ({
    rejectedViews: (window as unknown as {
      __AURA3D_ANIMATION_TEMPLATE__?: { readonly rejectedViews?: readonly string[]; readonly rejectedViewReason?: string };
    }).__AURA3D_ANIMATION_TEMPLATE__?.rejectedViews ?? [],
    puppetProof: (window as unknown as { __AURA3D_ANIMATION_2D_PUPPET_PROOF__?: unknown }).__AURA3D_ANIMATION_2D_PUPPET_PROOF__
  }));

  expect(proof.puppetProof).toBeUndefined();
  expect(proof.rejectedViews).toContain("puppet-2d");
});
