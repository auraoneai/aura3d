/**
 * Aurora Lander terrain proof: real contact against the static heightfield,
 * BVH surface-query reads during descent, pad sensor firing, and a graded
 * landing — driven through the route's ?drop=1 deterministic evidence approach.
 *
 * Telemetry comes from the mounted runtime (window.__AURORA_LANDER_EVIDENCE__),
 * not the DOM. Pixel deltas prove visible motion between descent frames.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/aurora-lander-terrain");
const ROUTE = "/apps/showcase-aurora-lander/?drop=1";

interface Evidence {
  mounted?: boolean;
  altitude?: number;
  state?: string;
  lastGrade?: string | null;
  ghostActive?: boolean;
  terrainQueryFps?: number;
  audioCues?: readonly string[];
  terrain?: { rows?: number; columns?: number; minHeight?: number; maxHeight?: number; surfaceQueryStats?: { samples?: number } };
  touchdown?: { contactEventSeen?: boolean; contactQueryAgreement?: boolean | null };
}

const evidenceOf = async (page: Page): Promise<Evidence> =>
  page.evaluate(() => (window as unknown as { __AURORA_LANDER_EVIDENCE__?: Evidence }).__AURORA_LANDER_EVIDENCE__ ?? {});

test.describe("aurora lander terrain contact", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("descent reads the heightfield, contacts it, and grades a landing", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (window as unknown as { __AURORA_LANDER_EVIDENCE__?: Evidence }).__AURORA_LANDER_EVIDENCE__?.mounted === true,
      undefined,
      { timeout: 45_000 }
    );

    // Unlock the audio graph with a real keydown (autoplay policy), then park the
    // ghost toggle back so the overlay state is unchanged.
    await page.keyboard.press("KeyG");
    await page.waitForTimeout(150);
    await page.keyboard.press("KeyG");

    // Mid-descent pixel delta: two frames ~700 ms apart must differ in pixels —
    // the world is actually moving, not a static poster.
    await page.waitForTimeout(900);
    const frameOne = await page.screenshot();
    writeFileSync(resolve(REPORT_DIR, "01-descent-a.png"), frameOne);
    await page.waitForTimeout(700);
    const frameTwo = await page.screenshot();
    writeFileSync(resolve(REPORT_DIR, "02-descent-b.png"), frameTwo);
    expect(Buffer.compare(frameOne, frameTwo)).not.toBe(0);

    // Surface queries run at frame rate during the whole descent.
    await page.waitForFunction(() => {
      const evidence = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: Evidence }).__AURORA_LANDER_EVIDENCE__;
      return (evidence?.terrainQueryFps ?? 0) >= 30;
    }, undefined, { timeout: 20_000 });
    const descending = await evidenceOf(page);
    expect(descending.terrain?.rows).toBe(65);
    expect(descending.terrain?.columns).toBe(65);
    expect((descending.terrain?.maxHeight ?? -99)).toBeGreaterThan(descending.terrain?.minHeight ?? -98);

    // The scripted approach lands ON the pad: graded soft or hard — never crash.
    await page.waitForFunction(() => {
      const evidence = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: Evidence }).__AURORA_LANDER_EVIDENCE__;
      return evidence?.state === "landed";
    }, undefined, { timeout: 60_000 });

    const landed = await evidenceOf(page);
    console.log("LANDED:", JSON.stringify({
      grade: landed.lastGrade,
      agreement: landed.touchdown?.contactQueryAgreement,
      cues: landed.audioCues?.slice(0, 6),
      queries: landed.terrainQueryFps
    }));
    expect(["soft", "hard"]).toContain(landed.lastGrade ?? "");
    // A REAL solver contact happened against the static heightfield...
    expect(landed.touchdown?.contactEventSeen).toBe(true);
    // ...and the BVH query cross-check agrees with the solver normal.
    expect(landed.touchdown?.contactQueryAgreement).toBe(true);
    // The pad sensor fired before touchdown (audible lock cue).
    expect(landed.audioCues ?? []).toContain("pad-lock");
    // Touchdown/clear cues registered.
    const cues = landed.audioCues ?? [];
    expect(cues.some((cue) => cue === "touch-soft" || cue === "touch-hard")).toBe(true);

    // Site-clear card is on screen after the graded landing.
    await page.waitForTimeout(300);
    const bannerText = await page.getByTestId("hud-banner").textContent();
    expect(bannerText ?? "").toMatch(/LANDING/i);
    const touchdownPng = await page.screenshot();
    const touchdownPath = resolve(REPORT_DIR, "03-touchdown-card.png");
    writeFileSync(touchdownPath, touchdownPng);
    writeFileSync(resolve(REPORT_DIR, "contact-evidence.json"), `${JSON.stringify({
      schema: "aura3d-aurora-lander-contact-evidence/1.0",
      generatedAt: new Date().toISOString(),
      route: page.url(),
      screenshotPath: "tests/reports/aurora-lander-terrain/03-touchdown-card.png",
      screenshotSha256: `sha256-${createHash("sha256").update(touchdownPng).digest("hex")}`,
      observed: landed
    }, null, 2)}\n`);

    expect(errors.filter((entry) => !entry.includes("favicon"))).toHaveLength(0);

  });
});
