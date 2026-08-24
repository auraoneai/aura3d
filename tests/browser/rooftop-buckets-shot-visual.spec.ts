import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_DIR = "tests/reports/rooftop-buckets";
const PRODUCER = "tests/browser/rooftop-buckets-shot-visual.spec.ts";

interface Evidence {
  readonly mounted: boolean;
  readonly heat: number;
  readonly state: string;
  readonly score: number;
  readonly lastShotResult: string | null;
  readonly onFire: boolean;
  readonly fireAchieved: boolean;
  readonly goldMade: boolean;
  readonly hoopMode: string;
  readonly defenderTelegraph: string;
  readonly contestAimOffset: number;
  readonly charging: boolean;
  readonly ballInFlight: boolean;
  readonly reducedMotion: boolean;
  readonly predictionPointCount: number;
  readonly primaryAssets: readonly string[];
  readonly renderer: { readonly drawCalls: number; readonly renderSize: readonly number[]; readonly backend: string };
  readonly audioCues: readonly string[];
}

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
  const appDir = resolve("apps/showcase-rooftop-buckets");
  const files = sourceFiles(join(appDir, "src"));
  const hash = createHash("sha256");
  for (const path of files) hash.update(relative(appDir, path)).update("\0").update(readFileSync(path)).update("\0");
  return { files: files.map((path) => relative(resolve(), path)), sha256: hash.digest("hex") };
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __ROOFTOP_BUCKETS_EVIDENCE__?: Evidence }).__ROOFTOP_BUCKETS_EVIDENCE__?.mounted),
    undefined,
    { timeout: 180_000 }
  );
  await page.waitForTimeout(1200);
}

async function evidence(page: Page): Promise<Evidence> {
  return page.evaluate(() => (window as unknown as { __ROOFTOP_BUCKETS_EVIDENCE__: Evidence }).__ROOFTOP_BUCKETS_EVIDENCE__);
}

async function pump(page: Page, frames: number): Promise<void> {
  await page.evaluate((count) => (window as unknown as { __RB_PUMP__?: (frames: number) => number }).__RB_PUMP__?.(count), frames);
}

async function scenario(page: Page, name: string): Promise<Evidence> {
  await page.evaluate((scenarioName) => {
    (window as unknown as { __RB_SCENARIO__?: (scenario: string) => string }).__RB_SCENARIO__?.(scenarioName);
  }, name);
  await page.waitForTimeout(200);
  return evidence(page);
}

async function capture(page: Page, file: string): Promise<void> {
  await page.screenshot({ path: join(REPORT_DIR, file), animations: "disabled" });
}

async function canvasData(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector("canvas")?.toDataURL("image/png") ?? "");
}

test("opening, trajectory, contact outcomes, heat states, mobile, and reduced mode have exact review artifacts", async ({ page }) => {
  test.setTimeout(420_000);
  mkdirSync(REPORT_DIR, { recursive: true });
  const server = await startExampleDevServer();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-rooftop-buckets/`, { waitUntil: "commit", timeout: 120_000 });
    await ready(page);

    const opening = await evidence(page);
    expect(opening.state).toBe("playing");
    expect(opening.predictionPointCount).toBe(25);
    expect(opening.primaryAssets).toHaveLength(5);
    expect(opening.renderer.drawCalls).toBeGreaterThan(0);
    const initialCanvas = await canvasData(page);
    expect(initialCanvas.length).toBeGreaterThan(4_000);
    await capture(page, "opening-desktop.png");

    await page.keyboard.down("Space");
    await pump(page, 20);
    const charge = await evidence(page);
    expect(charge.charging).toBe(true);
    await capture(page, "charge-arc-desktop.png");
    await page.keyboard.up("Space");
    await pump(page, 3);
    await page.waitForTimeout(100);
    const release = await evidence(page);
    expect(release.ballInFlight).toBe(true);
    await capture(page, "release-desktop.png");
    expect(await canvasData(page)).not.toBe(initialCanvas);

    const swish = await scenario(page, "open-clear");
    expect(swish.state).toBe("heat-cleared");
    expect(swish.lastShotResult).toBe("swish");
    expect(swish.audioCues).toContain("swish");
    await capture(page, "swish-desktop.png");

    const miss = await scenario(page, "miss");
    expect(miss.lastShotResult).toBe("brick");
    expect(miss.audioCues).toContain("brickMiss");
    await capture(page, "rim-miss-desktop.png");

    const contest = await scenario(page, "pressure");
    expect(contest.hoopMode).toBe("pressure");
    expect(contest.defenderTelegraph).toBe("contest");
    expect(Math.abs(contest.contestAimOffset)).toBeGreaterThan(0);
    await capture(page, "defender-contest-desktop.png");

    const fire = await scenario(page, "fire");
    expect(fire.onFire).toBe(true);
    expect(fire.fireAchieved).toBe(true);
    await capture(page, "fire-desktop.png");

    const buzzer = await scenario(page, "buzzer");
    expect(buzzer.state).toBe("game-over");
    expect(buzzer.lastShotResult).toBe("violation");
    await capture(page, "buzzer-desktop.png");

    const goldWin = await scenario(page, "gold-win");
    expect(goldWin.state).toBe("victory");
    expect(goldWin.goldMade).toBe(true);
    await capture(page, "gold-win-desktop.png");

    await page.setViewportSize({ width: 430, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-rooftop-buckets/`, { waitUntil: "commit", timeout: 120_000 });
    await ready(page);
    const mobile = await evidence(page);
    expect(mobile.state).toBe("playing");
    await expect(page.locator("#rb-touch-shoot")).toBeVisible();
    await capture(page, "opening-mobile.png");
    await page.locator("#rb-touch-aim-up").dispatchEvent("pointerdown");
    await pump(page, 8);
    await page.locator("#rb-touch-aim-up").dispatchEvent("pointerup");
    await page.locator("#rb-touch-shoot").dispatchEvent("pointerdown");
    await pump(page, 24);
    await page.locator("#rb-touch-shoot").dispatchEvent("pointerup");
    await pump(page, 3);
    const mobileActive = await evidence(page);
    expect(mobileActive.ballInFlight).toBe(true);
    await capture(page, "mobile-touch-active.png");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/apps/showcase-rooftop-buckets/`, { waitUntil: "commit", timeout: 120_000 });
    await ready(page);
    await page.keyboard.down("KeyW");
    await pump(page, 10);
    await page.keyboard.up("KeyW");
    const reduced = await evidence(page);
    expect(reduced.reducedMotion).toBe(true);
    expect(reduced.predictionPointCount).toBe(25);
    await capture(page, "reduced-motion-arc.png");

    const shotFiles = [
      "opening-desktop.png", "charge-arc-desktop.png", "release-desktop.png", "swish-desktop.png", "rim-miss-desktop.png",
      "defender-contest-desktop.png", "fire-desktop.png", "buzzer-desktop.png", "gold-win-desktop.png",
      "opening-mobile.png", "mobile-touch-active.png", "reduced-motion-arc.png"
    ];
    const visual = { opening, charge, release, swish, miss, contest, fire, buzzer, goldWin, mobile, mobileActive, reduced, shots: shotFiles };
    writeFileSync(join(REPORT_DIR, "visual.json"), `${JSON.stringify(visual, null, 2)}\n`);
    const binding = routeSourceBinding();
    const artifacts = [...shotFiles, "visual.json"].map((file) => ({ path: `${REPORT_DIR}/${file}`, sha256: sha256(`${REPORT_DIR}/${file}`) }));
    writeFileSync(join(REPORT_DIR, "browser-evidence.json"), `${JSON.stringify({
      schema: "aura3d.rooftop-buckets.browser-evidence/1.0",
      generatedAt: new Date().toISOString(),
      producer: PRODUCER,
      producerSourceSha256: sha256(PRODUCER),
      routeSourceFiles: binding.files,
      routeSourceSha256: binding.sha256,
      scenarios: ["opening", "charge-arc", "release", "swish", "miss", "defender-contest", "fire", "buzzer", "gold-win", "mobile-opening", "mobile-touch-active", "reduced-motion-arc"],
      artifacts,
      pass: true
    }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});
