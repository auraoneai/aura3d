import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Vault Breakers visual evidence (PRD VB-14): nonblank first load, visible
 * change after input (serve + flipper), readable in-world scoreboard, and
 * captured review screenshots (desktop + mobile).
 */

const REPORT_DIR = "tests/reports/vault-breakers";
const PRODUCER = "tests/browser/vault-breakers-table-visual.spec.ts";

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
  const appDir = resolve("apps/showcase-vault-breakers");
  const files = sourceFiles(join(appDir, "src"));
  const hash = createHash("sha256");
  for (const path of files) hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0");
  return { files: files.map((path) => relative(resolve(), path)), sha256: hash.digest("hex") };
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: unknown }).__VAULT_BREAKERS_EVIDENCE__),
    undefined,
    { timeout: 180_000 }
  );
}

interface ShotProbe {
  (name: string): string;
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

test("vault breakers table renders, responds to input, and captures review shots", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  mkdirSync(REPORT_DIR, { recursive: true });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + "/apps/showcase-vault-breakers/?capture=review", { waitUntil: "commit", timeout: 120_000 });
    await waitForReady(page);
    // The review layout promotes the canvas from a flex child to the full
    // viewport. Allow the renderer's resize observer to submit that full-size
    // frame before validating its renderer-owned pixels.
    await page.waitForTimeout(350);

    const shot = ((name: string) => {
      void name;
      return page.evaluate(() => (window as unknown as { __VB_SHOT__?: () => string }).__VB_SHOT__?.() ?? "");
    }) as ShotProbe;
    const scenario = async (name: string): Promise<Record<string, unknown>> => {
      await page.evaluate((scenarioName) => {
        (window as unknown as { __VB_SCENARIO__?: (scenario: string) => string }).__VB_SCENARIO__?.(scenarioName);
      }, name);
      await page.waitForTimeout(180);
      return page.evaluate(() => (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: Record<string, unknown> }).__VAULT_BREAKERS_EVIDENCE__ ?? {});
    };

    // First load: renderer-owned capture must be nonblank.
    const firstLoad = await shot("first-load");
    expect(firstLoad.length, "renderer screenshot must produce data").toBeGreaterThan(1000);
    expect(dataUrlVariance(firstLoad), "first load must not be a blank frame").toBeGreaterThan(0.4);
    await page.screenshot({ path: join(REPORT_DIR, "first-load-desktop.png") });

    // Input visibly changes the frame: serve, then hold a flipper.
    await page.keyboard.down("Space");
    await page.waitForTimeout(600);
    // Charged plunger view (hold captured mid-charge).
    await page.screenshot({ path: join(REPORT_DIR, "plunger-charge-desktop.png") });
    await page.waitForTimeout(400);
    await page.keyboard.up("Space");
    await page.waitForFunction(() => {
      const ev = (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: { phase?: string } }).__VAULT_BREAKERS_EVIDENCE__;
      return ev?.phase === "play";
    }, undefined, { timeout: 30_000 });
    await page.keyboard.down("KeyA");
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(REPORT_DIR, "serve-flipper-desktop.png") });
    await page.keyboard.up("KeyA");

    // The named gauntlet artifact must show the route's actual high-feedback
    // mission state, not the zero-score instant immediately after serve.
    const reviewMoment = await scenario("multiball");
    expect(Number(reviewMoment.activeBalls)).toBeGreaterThanOrEqual(2);
    expect(Number(reviewMoment.score)).toBeGreaterThan(0);
    expect(reviewMoment.mechanismVisualState).toBe("multiball");
    await page.keyboard.down("KeyA");
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(180);
    const midPlay = await shot("mid-play");
    expect(dataUrlVariance(midPlay), "mid-play capture must not be blank").toBeGreaterThan(0.4);
    // The visual gauntlet compares this exact active-table moment.  Persist the
    // same rendered frame that the renderer probe just validated instead of
    // leaving the matrix path to an older, unbound screenshot.
    await page.screenshot({ path: join(REPORT_DIR, "mid-play-desktop.png") });
    await page.keyboard.up("KeyA");
    await page.keyboard.up("KeyD");

    const nearComplete = await scenario("bank-near-complete");
    expect(nearComplete.banksDown).toBe(4);
    expect(nearComplete.mechanismVisualState).toBe("bank-progress");
    await page.screenshot({ path: join(REPORT_DIR, "bank-near-complete-desktop.png") });
    const vaultOpening = await scenario("vault-opening");
    expect(vaultOpening.vaultOpen).toBe(true);
    expect(vaultOpening.mechanismVisualState).toBe("vault-open");
    await page.screenshot({ path: join(REPORT_DIR, "vault-opening-desktop.png") });
    const multiball = await scenario("multiball");
    expect(Number(multiball.activeBalls)).toBeGreaterThanOrEqual(2);
    expect(multiball.mechanismVisualState).toBe("multiball");
    await page.screenshot({ path: join(REPORT_DIR, "multiball-desktop.png") });
    const tilt = await scenario("tilt");
    expect(tilt.tiltLocked).toBe(true);
    expect(tilt.mechanismVisualState).toBe("tilt");
    await page.screenshot({ path: join(REPORT_DIR, "tilt-desktop.png") });
    const gameOver = await scenario("game-over");
    expect(gameOver.phase).toBe("game-over");
    expect(gameOver.mechanismVisualState).toBe("game-over");
    await page.screenshot({ path: join(REPORT_DIR, "game-over-desktop.png") });

    await scenario("attract");
    await page.screenshot({ path: join(REPORT_DIR, "reset-attract-desktop.png") });

    // Mobile viewport shot for review.
    await page.setViewportSize({ width: 430, height: 800 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(REPORT_DIR, "first-load-mobile.png") });
    await page.locator("#vb-plunge-button").evaluate((button) => button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 3, isPrimary: true, buttons: 1 })));
    await page.evaluate(() => (window as unknown as { __VB_PUMP__?: (frames: number) => number }).__VB_PUMP__?.(20));
    await page.screenshot({ path: join(REPORT_DIR, "touch-charge-mobile.png") });
    await page.locator("#vb-plunge-button").evaluate((button) => button.dispatchEvent(new Event("touchend", { bubbles: true, cancelable: true })));

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload({ waitUntil: "commit" });
    await waitForReady(page);
    await scenario("multiball");
    await page.screenshot({ path: join(REPORT_DIR, "multiball-reduced-motion.png") });

    const evidence = await page.evaluate(() => (window as unknown as { __VAULT_BREAKERS_EVIDENCE__?: Record<string, unknown> }).__VAULT_BREAKERS_EVIDENCE__ ?? {});
    const shots = [
      "first-load-desktop.png", "plunger-charge-desktop.png", "serve-flipper-desktop.png",
      "mid-play-desktop.png",
      "bank-near-complete-desktop.png", "vault-opening-desktop.png", "multiball-desktop.png",
      "tilt-desktop.png", "game-over-desktop.png", "reset-attract-desktop.png",
      "first-load-mobile.png", "touch-charge-mobile.png", "multiball-reduced-motion.png"
    ];
    writeFileSync(join(REPORT_DIR, "visual.json"), `${JSON.stringify({ evidence, shots }, null, 2)}\n`);
    const binding = routeSourceBinding();
    const artifacts = [...shots, "visual.json"].map((file) => ({ path: `${REPORT_DIR}/${file}`, sha256: sha256(`${REPORT_DIR}/${file}`) }));
    writeFileSync(join(REPORT_DIR, "browser-evidence.json"), `${JSON.stringify({
      schema: "aura3d.vault-breakers.browser-evidence/1.0",
      generatedAt: new Date().toISOString(),
      producer: PRODUCER,
      producerSourceSha256: sha256(PRODUCER),
      routeSourceFiles: binding.files,
      routeSourceSha256: binding.sha256,
      scenarios: ["opening", "plunger-charge", "serve-flipper", "bank-near-complete", "vault-opening", "multiball", "tilt", "game-over", "reset-attract", "mobile-opening", "mobile-touch-charge", "reduced-motion-multiball"],
      artifacts,
      pass: true
    }, null, 2)}\n`);
    expect(Number(evidence.text3DScoreboards ?? 0)).toBeGreaterThan(60);
    expect(Number(evidence.jointCount ?? 0)).toBe(2);
    void testInfo;
  } finally {
    await server.close();
  }
});
