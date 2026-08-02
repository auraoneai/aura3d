import { expect, test, type Page } from "@playwright/test";

type AuraClashArenaEvidence = {
  status?: string;
  frame?: number;
  totalHits?: number;
  controls?: {
    lastInput?: string;
  };
  runtime?: {
    frameLoop?: boolean;
    input?: boolean;
    hitWindows?: boolean;
    evidence?: boolean;
  };
  fighterController?: {
    combatSource?: string;
    routeMayQueueMoves?: boolean;
    routeMayCalculateHits?: boolean;
    routeMayCalculateDamage?: boolean;
  };
};

test("poster route exposes capture-ready layout", async ({ page }) => {
  await page.goto("/poster/");
  await expect(page.getByRole("heading", { name: "Aura Clash — Hero versus", exact: true })).toBeVisible();
  await expect(page.getByText(/Downtown City MegaKit arena/i)).toBeVisible();
});

test("evidence route exposes debug overlay capture source hooks", async ({ page }, testInfo) => {
  await page.goto("/evidence/");
  await page.keyboard.press("KeyJ");
  await expect(page.getByText(/Runtime evidence/i)).toBeVisible();
  await expect(page.getByText(/Hitbox route source/i)).toBeVisible();
  await expect(page.getByText(/Physics body source/i)).toBeVisible();

  await expect.poll(
    async () => (await readAuraClashArenaEvidence(page))?.status,
    { timeout: 30_000, message: "evidence route should publish mounted Aura Clash runtime status" }
  ).toBe("running");
  await expect.poll(
    async () => (await readAuraClashArenaEvidence(page))?.frame ?? 0,
    { timeout: 30_000, message: "evidence route should publish an advancing mounted frame" }
  ).toBeGreaterThan(0);
  const evidence = await readAuraClashArenaEvidence(page);
  expect(evidence?.status).toBe("running");
  expect(evidence?.frame ?? 0).toBeGreaterThan(0);
  expect(evidence?.runtime).toMatchObject({
    frameLoop: true,
    input: true,
    hitWindows: true,
    evidence: true,
  });
  expect(evidence?.fighterController).toMatchObject({
    combatSource: "engine.combatWorld",
    routeMayQueueMoves: true,
    routeMayCalculateHits: false,
    routeMayCalculateDamage: false,
  });

  await testInfo.attach("aura-clash-debug-overlay-source-hook", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

async function readAuraClashArenaEvidence(page: Page): Promise<AuraClashArenaEvidence | undefined> {
  return page.evaluate(() => {
    return (window as Window & { __AURA_CLASH_ARENA_PROOF__?: AuraClashArenaEvidence }).__AURA_CLASH_ARENA_PROOF__;
  });
}
