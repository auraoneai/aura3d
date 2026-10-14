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
  camera?: {
    roundOverFraming?: boolean;
    settled?: boolean;
  };
  /** AC-A4 additive: in-scene ceremony + set-dressing telemetry. */
  presentation?: {
    ceremonyText?: string | null;
    crowdInstanceCount?: number;
    crowdInstancedDrawItems?: 1;
    signsSwinging?: boolean;
    clipEventsFired?: Readonly<Record<string, number>>;
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

test("playable route renders ROUND and K.O. text3D ceremonies in stills", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/playable/?auraTestDriver=1", { waitUntil: "networkidle" });
  await expect.poll(
    async () => (await readAuraClashArenaEvidence(page))?.status,
    { timeout: 30_000, message: "playable route should mount" }
  ).toBe("running");

  // Round-intro ceremony: a reset starts the round with an in-scene "ROUND 1" glyph mesh.
  await page.locator(".aca").focus();
  await page.keyboard.press("KeyR");
  await expect.poll(
    async () => (await readAuraClashArenaEvidence(page))?.presentation?.ceremonyText ?? null,
    { timeout: 5_000, message: "the round intro should show the ROUND 1 ceremony"
    }
  ).toBe("ROUND 1");
  const roundIntro = await readAuraClashArenaEvidence(page);
  // AC-A3 telemetry rides along: the crowd is one instanced draw item regardless of fan count.
  expect(roundIntro?.presentation?.crowdInstanceCount ?? 0).toBeGreaterThan(0);
  expect(roundIntro?.presentation?.crowdInstancedDrawItems).toBe(1);
  await testInfo.attach("aura-clash-round-intro-ceremony", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  // KO ceremony: ending the round shows the in-scene K.O. glyphs over the widened round-over frame.
  await page.evaluate(() => {
    const driver = (window as Window & {
      __AURA_CLASH_ARENA_TEST_DRIVER__?: { setPlayerHealth(health: number): void };
    }).__AURA_CLASH_ARENA_TEST_DRIVER__;
    if (!driver) throw new Error("Aura Clash ceremony test driver was not installed.");
    driver.setPlayerHealth(0);
  });
  await expect.poll(
    async () => (await readAuraClashArenaEvidence(page))?.presentation?.ceremonyText ?? null,
    { timeout: 5_000, message: "the KO should show the K.O. ceremony"
    }
  ).toBe("K.O.");
  const ko = await readAuraClashArenaEvidence(page);
  expect(ko?.camera?.roundOverFraming, "KO ceremony lands on the widened round-over framing").toBe(true);
  await testInfo.attach("aura-clash-ko-ceremony", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});
