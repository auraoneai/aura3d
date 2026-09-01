import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Bank Shot visual evidence (PRD BS-14): nonblank first load through the
 * renderer-owned capture, pixel-visible change after a strike (the break
 * scatters the rack), evidence-field assertions, and captured review
 * screenshots (desktop + mobile) under tests/reports/bank-shot/.
 */

const REPORT_DIR = "tests/reports/bank-shot";
const PRODUCER = "tests/browser/bank-shot-shot-visual.spec.ts";

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(?:ts|css)$/.test(path) ? [path] : [];
  });
}

function routeSourceBinding(): { readonly files: readonly string[]; readonly sha256: string } {
  const appDir = resolve("apps/showcase-bank-shot");
  const files = sourceFiles(join(appDir, "src"));
  const hash = createHash("sha256");
  for (const path of files) hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0");
  return { files: files.map((path) => relative(resolve(), path)), sha256: hash.digest("hex") };
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __BANK_SHOT_EVIDENCE__?: unknown }).__BANK_SHOT_EVIDENCE__),
    undefined,
    { timeout: 180_000 }
  );
}

async function shot(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __BS_SHOT__?: () => string }).__BS_SHOT__?.() ?? "");
}

async function pump(page: Page, frames: number): Promise<void> {
  await page.evaluate((count) => {
    (window as unknown as { __BS_PUMP__?: (frames: number) => number }).__BS_PUMP__?.(count);
  }, frames);
}

/**
 * Let the compositor present once after pumped renders: the canvas readback
 * reflects the last PRESENTED frame, and a paused+stepped loop does not present
 * until the next (possibly throttled) rAF. This wait is presentation-only -
 * physics time is only ever advanced through the pump.
 */
async function presented(page: Page): Promise<void> {
  await page.waitForTimeout(1300);
}

function dataUrlVariance(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  let sum = 0;
  let distinct = 0;
  const counts = new Map<string, number>();
  for (let index = 0; index < base64.length; index += 997) {
    const char = base64[index]!;
    counts.set(char, (counts.get(char) ?? 0) + 1);
    sum += 1;
  }
  distinct = counts.size;
  // A blank capture collapses to a handful of repeated base64 chars.
  return distinct / Math.max(1, Math.min(64, sum));
}

test("bank shot renders, scatters visibly on the strike, and captures review shots", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  mkdirSync(REPORT_DIR, { recursive: true });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    // The desktop comparison frame uses an evidence-only full-table lens. The
    // panel remains mounted for the same keyboard/rule assertions; its pixels
    // are hidden only in this named review capture.
    await page.goto(server.origin + "/apps/showcase-bank-shot/?capture=review", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);

    // Evidence publication can precede completion of the independent typed-GLB
    // uploads.  Bind the retained first-load artifact to the first presented
    // frame where the complete table, rack, and cue are actually visible.
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __BANK_SHOT_EVIDENCE__?: { liveBallCount?: number; resolvedNodeHandles?: number } }).__BANK_SHOT_EVIDENCE__;
      return ev?.liveBallCount === 16 && (ev.resolvedNodeHandles ?? 0) >= 18;
    }, undefined, { timeout: 120_000 });
    await presented(page);

    // First load: renderer-owned capture must be nonblank.
    const firstLoad = await shot(page);
    expect(firstLoad.length, "renderer screenshot must produce data").toBeGreaterThan(1000);
    expect(dataUrlVariance(firstLoad), "first load must not be a blank frame").toBeGreaterThan(0.4);
    await page.screenshot({ path: join(REPORT_DIR, "first-load-desktop.png") });

    // Aim + charge view (meter mid-charge with the cue stick pulled back).
    // The charge grows per simulated frame, so the hold is pumped.
    // Default aim is the real head-on break line. Preserve it for the review
    // sequence so the retained action frame shows the rack exploding instead
    // of a visually unhelpful glancing miss.
    await page.keyboard.down("Space");
    await pump(page, 82);
    await page.screenshot({ path: join(REPORT_DIR, "aim-charge-desktop.png") });
    const chargeState = await page.evaluate(() => (window as unknown as { __BANK_SHOT_EVIDENCE__?: { charge?: number; charging?: boolean } }).__BANK_SHOT_EVIDENCE__);
    expect(chargeState?.charging).toBe(true);
    expect(chargeState?.charge ?? 0).toBeGreaterThan(0.2);
    await page.keyboard.up("Space");

    // The strike visibly changes the frame: pump the break, let the compositor
    // present, and compare renderer-owned captures.
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __BANK_SHOT_EVIDENCE__?: { state?: string } }).__BANK_SHOT_EVIDENCE__;
      return ev?.state === "shooting";
    }, undefined, { timeout: 30_000 });
    await page.screenshot({ path: join(REPORT_DIR, "cue-contact-desktop.png") });
    const beforeShot = await shot(page);
    // Capture while the real Rapier break is still visibly expanding. Pumping
    // through the entire shot previously retained an almost static rack.
    await pump(page, 92);
    await presented(page);
    const breakShot = await page.screenshot({ path: join(REPORT_DIR, "break-desktop.png") });
    // Bind the showcase matrix to the exact current live-break bytes produced
    // above.  Keeping an independently captured opening-rack probe at this
    // stable path made downstream visual review stale and non-comparable even
    // while every named Bank Shot artifact had been regenerated.
    writeFileSync(
      resolve("tests/reports/showcase-route-primary-probes/showcase-bank-shot.png"),
      breakShot
    );
    const afterShot = await shot(page);
    expect(dataUrlVariance(afterShot), "mid-break capture must not be blank").toBeGreaterThan(0.4);
    expect(afterShot, "the break must visibly change the rendered frame").not.toBe(beforeShot);

    // Mid-rack view: pump until the break resolves, then capture the leave.
    for (let batch = 0; batch < 40; batch += 1) {
      const done = await page.evaluate(() => {
        (window as unknown as { __BS_PUMP__?: (frames: number) => number }).__BS_PUMP__?.(120);
        const ev = (window as unknown as { __BANK_SHOT_EVIDENCE__?: { state?: string } }).__BANK_SHOT_EVIDENCE__;
        return ev?.state === "aiming" || ev?.state === "ball-in-hand";
      });
      if (done) break;
    }
    await presented(page);
    await page.screenshot({ path: join(REPORT_DIR, "mid-rack-desktop.png") });

    const evidence = await page.evaluate(() => (window as unknown as { __BANK_SHOT_EVIDENCE__?: Record<string, unknown> }).__BANK_SHOT_EVIDENCE__ ?? {});
    // Evidence contract fields (PRD 8) must all be present and live.
    expect(Number(evidence.physicsBodyCount ?? 0)).toBeGreaterThanOrEqual(34);
    expect(evidence.backend).toBe("rapier");
    expect(typeof evidence.shotHash).toBe("string");
    expect(typeof evidence.resetHashMatch).toBe("boolean");
    expect(typeof evidence.clockMs).toBe("number");
    expect(Array.isArray(evidence.audioCues)).toBe(true);
    expect((evidence.audioCues as readonly string[]).join(",")).toContain("cue-strike");
    expect(Array.isArray(evidence.potted)).toBe(true);

    // Source-controlled outcome fixtures exercise the live rules -> HUD/audio ->
    // typed scene synchronization path while unit/public-Rapier evidence owns
    // the underlying contact and pocket mechanics.
    await page.evaluate(() => (window as unknown as { __BS_SCENARIO__?: (name: "pocket") => string }).__BS_SCENARIO__?.("pocket"));
    await page.screenshot({ path: join(REPORT_DIR, "pocket-desktop.png") });
    const pocketEvidence = await page.evaluate(() => (window as unknown as { __BANK_SHOT_EVIDENCE__?: Record<string, unknown> }).__BANK_SHOT_EVIDENCE__ ?? {});
    expect(String(pocketEvidence.lastShot)).toBe("potted:1");
    expect(Number(pocketEvidence.score)).toBeGreaterThan(0);

    await page.evaluate(() => (window as unknown as { __BS_SCENARIO__?: (name: "foul") => string }).__BS_SCENARIO__?.("foul"));
    await page.screenshot({ path: join(REPORT_DIR, "foul-desktop.png") });
    const foulEvidence = await page.evaluate(() => (window as unknown as { __BANK_SHOT_EVIDENCE__?: Record<string, unknown> }).__BANK_SHOT_EVIDENCE__ ?? {});
    expect(foulEvidence.state).toBe("ball-in-hand");
    expect(String(foulEvidence.lastShot)).toContain("foul:scratch");

    await page.evaluate(() => (window as unknown as { __BS_SCENARIO__?: (name: "rack-fail") => string }).__BS_SCENARIO__?.("rack-fail"));
    await page.screenshot({ path: join(REPORT_DIR, "rack-fail-desktop.png") });
    const failEvidence = await page.evaluate(() => (window as unknown as { __BANK_SHOT_EVIDENCE__?: Record<string, unknown> }).__BANK_SHOT_EVIDENCE__ ?? {});
    expect(failEvidence.state).toBe("rack-lost");
    expect(String(failEvidence.lastShot)).toContain("8-ball potted early");

    await page.evaluate(() => (window as unknown as { __BS_SCENARIO__?: (name: "eight-finish") => string }).__BS_SCENARIO__?.("eight-finish"));
    await page.screenshot({ path: join(REPORT_DIR, "eight-ball-finish-desktop.png") });
    const finishEvidence = await page.evaluate(() => (window as unknown as { __BANK_SHOT_EVIDENCE__?: Record<string, unknown> }).__BANK_SHOT_EVIDENCE__ ?? {});
    expect(finishEvidence.rack).toBe(3);
    expect(finishEvidence.state).toBe("rack-won");
    expect(finishEvidence.sessionComplete).toBe(true);
    await expect(page.locator("#bs-result-title")).toHaveText("Session clear");

    // Mobile is a separately composed route load, not a desktop camera merely
    // resized after mount. Reloading after the viewport change selects the
    // portrait table camera and proves the initial touch-safe composition.
    await page.setViewportSize({ width: 430, height: 800 });
    await page.goto(server.origin + "/apps/showcase-bank-shot/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    // Handles resolve before every independent typed GLB upload has necessarily
    // reached a presented frame. Wait for the asset-backed rack to settle into
    // the renderer; simulated gameplay time is not advanced by this wait.
    await page.waitForTimeout(1500);
    const mobileEvidence = await page.evaluate(() => (window as unknown as { __BANK_SHOT_EVIDENCE__?: Record<string, unknown> }).__BANK_SHOT_EVIDENCE__ ?? {});
    expect(mobileEvidence.state).toBe("aiming");
    expect(mobileEvidence.liveBallCount).toBe(16);
    await page.screenshot({ path: join(REPORT_DIR, "first-load-mobile.png") });

    // Promised touch controls must change the same live aim/strike state.
    const mobileAimBefore = Number(mobileEvidence.aimAngle ?? 0);
    await page.locator("#bs-aim-right-button").dispatchEvent("pointerdown");
    await pump(page, 18);
    await page.locator("#bs-aim-right-button").dispatchEvent("pointerup");
    const mobileAimAfter = await page.evaluate(() => Number((window as unknown as { __BANK_SHOT_EVIDENCE__?: { aimAngle?: number } }).__BANK_SHOT_EVIDENCE__?.aimAngle ?? 0));
    expect(Math.abs(mobileAimAfter - mobileAimBefore)).toBeGreaterThan(0.1);
    await page.locator("#bs-charge-button").dispatchEvent("pointerdown");
    await pump(page, 42);
    await page.locator("#bs-charge-button").dispatchEvent("pointerup");
    await page.waitForFunction(() => (window as unknown as { __BANK_SHOT_EVIDENCE__?: { state?: string } }).__BANK_SHOT_EVIDENCE__?.state === "shooting");
    await pump(page, 120);
    await page.screenshot({ path: join(REPORT_DIR, "mobile-active.png") });
    const mobileActiveEvidence = await page.evaluate(() => (window as unknown as { __BANK_SHOT_EVIDENCE__?: Record<string, unknown> }).__BANK_SHOT_EVIDENCE__ ?? {});
    expect(mobileActiveEvidence.state).toBe("shooting");
    expect(mobileActiveEvidence.lastShot).toBe("strike");
    expect((mobileActiveEvidence.audioCues as readonly string[]).join(",")).toContain("cue-strike");

    // Reduced motion is a separately mounted state; trajectory/contact truth and
    // controls remain present while the optional bloom intensity is reduced.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-bank-shot/", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    await page.keyboard.down("KeyD");
    await pump(page, 14);
    await page.keyboard.up("KeyD");
    await page.screenshot({ path: join(REPORT_DIR, "reduced-motion-aim.png") });
    const reducedEvidence = await page.evaluate(() => (window as unknown as { __BANK_SHOT_EVIDENCE__?: Record<string, unknown> }).__BANK_SHOT_EVIDENCE__ ?? {});
    expect(reducedEvidence.state).toBe("aiming");
    expect(Number(reducedEvidence.aimAngle ?? 0)).not.toBe(0);

    const shotFiles = [
      "first-load-desktop.png", "aim-charge-desktop.png", "cue-contact-desktop.png", "break-desktop.png", "mid-rack-desktop.png",
      "pocket-desktop.png", "foul-desktop.png", "rack-fail-desktop.png", "eight-ball-finish-desktop.png",
      "first-load-mobile.png", "mobile-active.png", "reduced-motion-aim.png"
    ];
    writeFileSync(join(REPORT_DIR, "visual.json"), JSON.stringify({
      evidence,
      scenarios: { pocketEvidence, foulEvidence, failEvidence, finishEvidence, mobileEvidence, mobileActiveEvidence, reducedEvidence },
      shots: shotFiles
    }, null, 2));
    const binding = routeSourceBinding();
    const retained = [...shotFiles, "visual.json"].map((file) => ({
      path: `${REPORT_DIR}/${file}`,
      sha256: sha256(`${REPORT_DIR}/${file}`)
    }));
    writeFileSync(join(REPORT_DIR, "browser-evidence.json"), `${JSON.stringify({
      schema: "aura3d.bank-shot.browser-evidence/1.0",
      generatedAt: new Date().toISOString(),
      producer: PRODUCER,
      producerSourceSha256: sha256(PRODUCER),
      routeSourceFiles: binding.files,
      routeSourceSha256: binding.sha256,
      scenarios: ["attract", "aim", "cue-contact", "motion", "pocket", "foul", "rack-fail", "eight-finish", "mobile-attract", "mobile-touch-active", "reduced-motion-aim"],
      artifacts: retained,
      pass: true
    }, null, 2)}\n`);
    void testInfo;
  } finally {
    await server.close();
  }
});
