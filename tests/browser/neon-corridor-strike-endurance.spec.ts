import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

test.use({ video: { mode: "on", size: { width: 1280, height: 800 } } });
test.setTimeout(120_000);

interface EnduranceEvidence {
  readonly status: "playing" | "won" | "lost";
  readonly x: number;
  readonly z: number;
  readonly ammo: number;
  readonly shotsFired: number;
  readonly hits: number;
  readonly resets: number;
  readonly paused: boolean;
  readonly pointerLockRequested: number;
}

test("neon-corridor-strike sustains a recorded 60-second player-driven session", async ({ page }) => {
  const reportDir = resolve(process.cwd(), "tests/reports/neon-corridor-strike-endurance");
  mkdirSync(reportDir, { recursive: true });
  const server = await startExampleDevServer();

  try {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${server.origin}/examples/neon-corridor-strike/`);
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 30_000 }).toBe("true");
  await page.locator("canvas").click();
  await page.mouse.move(640, 400);
  await page.mouse.move(700, 360);

  const read = (): Promise<EnduranceEvidence | undefined> => page.evaluate(() => window.__AURA3D_FPS_EVIDENCE__);
  const started = performance.now();
  const durationMs = 65_000;
  const samples: Array<EnduranceEvidence & { readonly elapsedMs: number }> = [];
  let direction: "KeyA" | "KeyD" = "KeyD";
  let directionChangedAt = 0;
  let pauseProved = false;
  let lostResets = 0;
  let reloadInputs = 0;

  await page.keyboard.down(direction);
  while (performance.now() - started < durationMs) {
    const elapsedMs = performance.now() - started;
    const evidence = await read();
    if (!evidence) throw new Error("FPS evidence disappeared during the endurance session");
    samples.push({ ...evidence, elapsedMs: Math.round(elapsedMs) });

    if (!pauseProved && elapsedMs > 15_000) {
      await page.keyboard.press("KeyP");
      await expect.poll(async () => (await read())?.paused).toBe(true);
      await page.waitForTimeout(550);
      await page.keyboard.press("KeyP");
      await expect.poll(async () => (await read())?.paused).toBe(false);
      pauseProved = true;
    }

    if (evidence.status !== "playing") {
      if (evidence.status === "lost") lostResets += 1;
      await page.keyboard.press("KeyT");
      await expect.poll(async () => (await read())?.status).toBe("playing");
    } else if (evidence.ammo <= 1) {
      await page.keyboard.press("KeyR");
      reloadInputs += 1;
    } else {
      await page.keyboard.press("KeyJ");
    }

    if (elapsedMs - directionChangedAt >= 1_500) {
      await page.keyboard.up(direction);
      direction = direction === "KeyD" ? "KeyA" : "KeyD";
      await page.keyboard.down(direction);
      directionChangedAt = elapsedMs;
    }
    await page.waitForTimeout(350);
  }
  await page.keyboard.up(direction);

  const final = await read();
  expect(final).toBeTruthy();
  const elapsedMs = performance.now() - started;
  const xValues = samples.map((sample) => sample.x);
  expect(elapsedMs).toBeGreaterThanOrEqual(60_000);
  expect(Math.max(...xValues) - Math.min(...xValues)).toBeGreaterThan(1);
  expect(Math.max(...samples.map((sample) => sample.shotsFired))).toBeGreaterThan(5);
  expect(samples.some((sample) => sample.hits > 0)).toBe(true);
  expect(pauseProved).toBe(true);
  expect(reloadInputs).toBeGreaterThan(0);
  expect(lostResets).toBeGreaterThan(0);
  expect(final?.pointerLockRequested ?? 0).toBeGreaterThanOrEqual(1);

  writeFileSync(resolve(reportDir, "endurance-after.png"), await page.screenshot({ fullPage: false }));
  const video = page.video();
  expect(video, "recorded interaction evidence must be enabled").toBeTruthy();
  await page.context().close();
  const temporaryVideo = await video!.path();
  const videoPath = resolve(reportDir, "ui-composition-before-after.webm");
  copyFileSync(temporaryVideo, videoPath);
  const videoSha256 = createHash("sha256").update(readFileSync(videoPath)).digest("hex");

  writeFileSync(resolve(reportDir, "endurance.json"), `${JSON.stringify({
    schema: "aura3d-neon-corridor-endurance/1.0",
    pass: true,
    playerDriven: true,
    autoplay: false,
    elapsedMs: Math.round(elapsedMs),
    sampleCount: samples.length,
    movementSpanX: Math.max(...xValues) - Math.min(...xValues),
    maxShotsFired: Math.max(...samples.map((sample) => sample.shotsFired)),
    maxHits: Math.max(...samples.map((sample) => sample.hits)),
    pauseProved,
    reloadInputs,
    lostResets,
    final,
    artifacts: {
      video: "tests/reports/neon-corridor-strike-endurance/ui-composition-before-after.webm",
      videoSha256,
      screenshot: "tests/reports/neon-corridor-strike-endurance/endurance-after.png"
    }
  }, null, 2)}\n`);
  } finally {
    await server.close();
  }
});
