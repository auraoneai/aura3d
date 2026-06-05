import { expect, test, type Page } from "@playwright/test";

type AuraClashDebugEvidence = {
  camera?: { active: boolean; position: readonly number[]; target: readonly number[] };
  collisionHitbox?: {
    hitboxEventCount: number;
    producedFromGameplayInput: boolean;
  };
  runtimeMutation?: {
    noSceneReconstructionProof?: {
      automatedSourceHook: boolean;
      proofStatus: string;
      sceneRebuildsDuringFrameUpdates: number;
    };
  };
};

test("poster route exposes capture-ready layout", async ({ page }) => {
  await page.goto("/poster/");
  await expect(page.getByRole("heading", { name: /Aura Clash/i })).toBeVisible();
  await expect(page.getByText(/Downtown City MegaKit arena/i)).toBeVisible();
});

test("evidence route exposes debug overlay capture source hooks", async ({ page }, testInfo) => {
  await page.goto("/evidence/");
  await page.keyboard.press("KeyJ");
  await expect(page.getByText(/Runtime evidence/i)).toBeVisible();
  await expect(page.getByText(/Hitbox route source/i)).toBeVisible();
  await expect(page.getByText(/Physics body source/i)).toBeVisible();

  const evidence = await readAuraClashDebugEvidence(page);
  expect(evidence?.camera?.active).toBe(true);
  expect(evidence?.collisionHitbox?.hitboxEventCount ?? 0).toBeGreaterThan(0);
  expect(evidence?.runtimeMutation?.noSceneReconstructionProof?.automatedSourceHook).toBe(true);
  expect(evidence?.runtimeMutation?.noSceneReconstructionProof?.sceneRebuildsDuringFrameUpdates).toBe(0);

  await testInfo.attach("aura-clash-debug-overlay-source-hook", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

async function readAuraClashDebugEvidence(page: Page): Promise<AuraClashDebugEvidence | undefined> {
  return page.evaluate(() => {
    return (window as Window & { __AURA_CLASH_RUNTIME_EVIDENCE__?: AuraClashDebugEvidence }).__AURA_CLASH_RUNTIME_EVIDENCE__;
  });
}
