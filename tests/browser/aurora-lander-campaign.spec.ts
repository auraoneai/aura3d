import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/aurora-lander-campaign");

interface PredictionEvidence {
  readonly x?: number;
  readonly z?: number;
  readonly seconds?: number;
  readonly bounded?: boolean;
  readonly horizonSeconds?: number;
  readonly reachedSurface?: boolean;
}

interface AuroraEvidence {
  readonly mounted?: boolean;
  readonly status?: string;
  readonly site?: number;
  readonly siteName?: string;
  readonly state?: string;
  readonly lastGrade?: string | null;
  readonly fuel?: number;
  readonly hull?: number;
  readonly altitude?: number;
  readonly vspeed?: number;
  readonly hspeed?: number;
  readonly attitudeDeg?: number;
  readonly campaignScore?: number;
  readonly completedSites?: number;
  readonly whiteoutDensity?: number;
  readonly whiteoutVisibleNodes?: number;
  readonly gustForce?: number;
  readonly gustTelegraph?: boolean;
  readonly reducedMotion?: boolean;
  readonly extractionTableau?: boolean;
  readonly prediction?: PredictionEvidence | null;
  readonly audioCues?: readonly string[];
  readonly audio?: {
    readonly unlocked?: boolean;
    readonly gestureUnlocked?: boolean;
    readonly playedCueCount?: number;
    readonly suppressedCueCount?: number;
    readonly cueCount?: number;
    readonly typedAssetCount?: number;
    readonly audioErrors?: readonly string[];
  };
  readonly primaryAssets?: readonly string[];
  readonly renderer?: { readonly drawCalls?: number; readonly renderSize?: readonly number[] };
  readonly sites?: readonly { readonly id?: number; readonly name?: string }[];
}

const evidenceOf = (page: Page): Promise<AuroraEvidence> => page.evaluate(() =>
  (window as unknown as { __AURORA_LANDER_EVIDENCE__?: AuroraEvidence }).__AURORA_LANDER_EVIDENCE__ ?? {}
);

async function waitMounted(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    (window as unknown as { __AURORA_LANDER_EVIDENCE__?: AuroraEvidence }).__AURORA_LANDER_EVIDENCE__?.mounted === true,
  undefined, { timeout: 45_000 });
}

async function writeArtifact(page: Page, name: string): Promise<void> {
  const png = await page.screenshot();
  const evidence = await evidenceOf(page);
  const pngPath = resolve(REPORT_DIR, `${name}.png`);
  writeFileSync(pngPath, png);
  writeFileSync(resolve(REPORT_DIR, `${name}.json`), `${JSON.stringify({
    schema: "aura3d-aurora-lander-campaign-artifact/1.0",
    route: page.url(),
    viewport: page.viewportSize(),
    screenshotPath: `tests/reports/aurora-lander-campaign/${name}.png`,
    screenshotSha256: `sha256-${createHash("sha256").update(png).digest("hex")}`,
    evidence
  }, null, 2)}\n`);
}

test.describe("aurora lander three-site campaign", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(REPORT_DIR, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("completes all three physical contacts and reaches the extraction tableau", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-aurora-lander/?drop=1&capture=review`, { waitUntil: "domcontentloaded" });
    await waitMounted(page);
    // A real key gesture unlocks the AudioContext. Toggle the ghost back off so
    // campaign presentation remains unchanged while event-driven cues are proven.
    await page.keyboard.press("KeyG");
    await page.waitForTimeout(150);
    await page.keyboard.press("KeyG");
    await page.waitForFunction(() => Boolean(
      (window as unknown as { __AURORA_LANDER_EVIDENCE__?: AuroraEvidence }).__AURORA_LANDER_EVIDENCE__?.prediction
    ));

    const opening = await evidenceOf(page);
    expect(opening.sites).toHaveLength(3);
    expect(opening.primaryAssets).toEqual(["auroraLanderProbe", "auroraPadBeacon"]);
    expect(opening.prediction).toMatchObject({ bounded: true, horizonSeconds: 8 });
    await writeArtifact(page, "01-approach");

    await page.waitForFunction(() => {
      const ev = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: AuroraEvidence }).__AURORA_LANDER_EVIDENCE__;
      return ev?.site === 2 && ev.state === "flying" && Math.abs(ev.gustForce ?? 0) > 0.01;
    }, undefined, { timeout: 70_000 });
    const siteTwo = await evidenceOf(page);
    expect(siteTwo.whiteoutDensity).toBeGreaterThan(opening.whiteoutDensity ?? 0);
    expect(siteTwo.audioCues ?? []).toContain("gust-warn");
    expect(siteTwo.audio).toMatchObject({
      unlocked: true,
      gestureUnlocked: true,
      cueCount: 10,
      typedAssetCount: 10,
      audioErrors: []
    });
    expect(siteTwo.audio?.playedCueCount ?? 0).toBeGreaterThan(0);
    await writeArtifact(page, "02-gust-correction");

    await page.waitForFunction(() => {
      const ev = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: AuroraEvidence }).__AURORA_LANDER_EVIDENCE__;
      return ev?.site === 3 && ev.state === "flying" && (ev.whiteoutVisibleNodes ?? 0) >= 40
        && (ev.altitude ?? 99) <= 12;
    }, undefined, { timeout: 70_000 });
    const siteThree = await evidenceOf(page);
    expect(siteThree.whiteoutDensity).toBeGreaterThan(siteTwo.whiteoutDensity ?? 0);
    expect(siteThree.renderer?.drawCalls ?? 0).toBeGreaterThan(0);
    await writeArtifact(page, "03-strongest-whiteout");

    await page.waitForFunction(() => {
      const ev = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: AuroraEvidence }).__AURORA_LANDER_EVIDENCE__;
      return ev?.state === "campaign-clear" && ev.extractionTableau === true;
    }, undefined, { timeout: 80_000 });
    const complete = await evidenceOf(page);
    expect(complete.completedSites).toBe(3);
    expect(complete.campaignScore ?? 0).toBeGreaterThan(0);
    expect(complete.hull).toBe(1);
    await writeArtifact(page, "04-final-extraction");
    expect(errors).toEqual([]);
  });

  test("hard contact visibly damages hull while preserving a graded landing", async ({ page }) => {
    await page.goto(`${server.origin}/apps/showcase-aurora-lander/?drop=hard`, { waitUntil: "domcontentloaded" });
    await waitMounted(page);
    await page.keyboard.press("KeyG");
    await page.waitForTimeout(150);
    await page.keyboard.press("KeyG");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: AuroraEvidence }).__AURORA_LANDER_EVIDENCE__;
      return ev?.state === "landed";
    }, undefined, { timeout: 60_000 });
    const hard = await evidenceOf(page);
    expect(hard.lastGrade).toBe("hard");
    expect(hard.hull).toBe(0.7);
    expect(hard.audioCues ?? []).toEqual(expect.arrayContaining(["touch-hard", "site-clear", "pad-lock"]));
    expect(hard.audio?.playedCueCount ?? 0).toBeGreaterThan(0);
    expect(hard.audio?.audioErrors ?? []).toEqual([]);
    await writeArtifact(page, "05-hard-contact");
  });

  test("site three remains completable under its strongest gust and whiteout", async ({ page }) => {
    await page.goto(`${server.origin}/apps/showcase-aurora-lander/?site=3&drop=1`, { waitUntil: "domcontentloaded" });
    await waitMounted(page);
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: AuroraEvidence }).__AURORA_LANDER_EVIDENCE__;
      return ev?.state !== "flying";
    }, undefined, { timeout: 60_000 });
    const outcome = await evidenceOf(page);
    console.log("SITE3_OUTCOME:", JSON.stringify(outcome));
    expect(outcome.state).toBe("campaign-clear");
    expect(["soft", "hard"]).toContain(outcome.lastGrade);
  });

  test("touch controls change thrust/attitude and reduced motion retains whiteout truth", async ({ page, browser }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}/apps/showcase-aurora-lander/?approach=1`, { waitUntil: "domcontentloaded" });
    await waitMounted(page);
    const start = await evidenceOf(page);
    const startPrediction = start.prediction;

    const thrust = page.locator("#touch-thrust");
    await thrust.fill("0.8");
    await page.waitForTimeout(900);
    await thrust.fill("0");
    expect((await evidenceOf(page)).fuel ?? 1).toBeLessThan(start.fuel ?? 0);

    const rcs = page.locator("#touch-right");
    const rcsBox = await rcs.boundingBox();
    expect(rcsBox).not.toBeNull();
    // Dispatch a touch-typed pointer hold directly on the control. A mouse can
    // emit pointerleave when the responsive control dock settles, which rightly
    // releases a hold but does not model a finger remaining on the button.
    await rcs.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 1, isPrimary: true });
    await page.waitForTimeout(700);
    await rcs.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 1, isPrimary: true });
    const active = await evidenceOf(page);
    expect(active.attitudeDeg ?? 0).toBeGreaterThan(3);
    expect(active.prediction).toMatchObject({ bounded: true, horizonSeconds: 8 });
    expect([
      active.prediction?.x,
      active.prediction?.z,
      active.prediction?.seconds
    ]).not.toEqual([
      startPrediction?.x,
      startPrediction?.z,
      startPrediction?.seconds
    ]);

    // Capture active play near the objective so the narrow mobile frame proves
    // the lander, landing zone, telemetry, and actual touch controls together.
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: AuroraEvidence }).__AURORA_LANDER_EVIDENCE__;
      return ev?.state === "flying" && (ev.altitude ?? 99) <= 12;
    }, undefined, { timeout: 30_000 });
    await thrust.fill("1");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: AuroraEvidence }).__AURORA_LANDER_EVIDENCE__;
      return ev?.state === "flying" && (ev.altitude ?? 99) <= 7 && (ev.vspeed ?? -99) > -3.5;
    }, undefined, { timeout: 8_000 });
    await rcs.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 2, isPrimary: true });
    await page.waitForTimeout(260);
    await writeArtifact(page, "06-mobile-active-play");
    await rcs.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 2, isPrimary: true });
    await thrust.fill("0");

    const reducedContext = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 390, height: 844 }
    });
    const reducedPage = await reducedContext.newPage();
    await reducedPage.goto(`${server.origin}/apps/showcase-aurora-lander/?site=3&drop=1`, { waitUntil: "domcontentloaded" });
    await waitMounted(reducedPage);
    await reducedPage.waitForFunction(() => {
      const ev = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: AuroraEvidence }).__AURORA_LANDER_EVIDENCE__;
      return ev?.state === "flying" && (ev.altitude ?? 99) <= 4;
    }, undefined, { timeout: 50_000 });
    const reduced = await evidenceOf(reducedPage);
    expect(reduced.reducedMotion).toBe(true);
    expect(reduced.whiteoutVisibleNodes ?? 0).toBeGreaterThanOrEqual(40);
    expect(reduced.prediction).toMatchObject({ bounded: true });
    await writeArtifact(reducedPage, "07-reduced-motion-whiteout");
    await reducedPage.close();
    await reducedContext.close();
  });
});
