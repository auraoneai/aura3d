import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe.configure({ mode: "serial" });

const REPORT_DIR = "tests/reports/rooftop-buckets/playable";
const PRODUCER = "tests/browser/rooftop-buckets-playable.spec.ts";
let server: ExampleDevServer;

interface RooftopBucketsEvidence {
  readonly status: string;
  readonly mounted: boolean;
  readonly heat: number;
  readonly state: string;
  readonly currentSpotId: number;
  readonly score: number;
  readonly target: number;
  readonly streak: number;
  readonly onFire: boolean;
  readonly fireAchieved: boolean;
  readonly madeSpotIds: readonly number[];
  readonly makes: number;
  readonly misses: number;
  readonly shotClockMs: number;
  readonly heatTimerMs: number;
  readonly lastShotResult: string | null;
  readonly goldBall: boolean;
  readonly goldAttempted: boolean;
  readonly goldMade: boolean;
  readonly hoopMode: string;
  readonly defenderTelegraph: string;
  readonly contestAimOffset: number;
  readonly sensorEventCount: number;
  readonly physicsBodyCount: number;
  readonly simulationOwner: string;
  readonly predictionPointCount: number;
  readonly primaryAssets: readonly string[];
  readonly systems: Readonly<Record<string, string>>;
  readonly controls: readonly string[];
  readonly claimBoundary: string;
  readonly audioCues: readonly string[];
  readonly renderer: { readonly drawCalls: number; readonly renderSize: readonly number[] };
  readonly aimPitch: number;
  readonly chargePower: number;
  readonly charging: boolean;
  readonly ballInFlight: boolean;
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

async function evidence(page: Page): Promise<RooftopBucketsEvidence> {
  return page.evaluate(() => (window as unknown as { __ROOFTOP_BUCKETS_EVIDENCE__: RooftopBucketsEvidence }).__ROOFTOP_BUCKETS_EVIDENCE__);
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const evidence = (window as unknown as { __ROOFTOP_BUCKETS_EVIDENCE__?: RooftopBucketsEvidence }).__ROOFTOP_BUCKETS_EVIDENCE__;
      return Boolean(
        evidence?.mounted
        && evidence.renderer.drawCalls > 0
        && evidence.renderer.renderSize[0] > 0
        && evidence.renderer.renderSize[1] > 0
      );
    },
    undefined,
    { timeout: 180_000 }
  );
}

async function pump(page: Page, frames: number): Promise<void> {
  await page.evaluate((count) => (window as unknown as { __RB_PUMP__?: (frames: number) => number }).__RB_PUMP__?.(count), frames);
}

async function scenario(page: Page, name: string): Promise<RooftopBucketsEvidence> {
  await page.evaluate((scenarioName) => {
    (window as unknown as { __RB_SCENARIO__?: (scenario: string) => string }).__RB_SCENARIO__?.(scenarioName);
  }, name);
  return evidence(page);
}

test.beforeAll(async () => {
  mkdirSync(REPORT_DIR, { recursive: true });
  server = await startExampleDevServer();
});

test.afterAll(async () => {
  if (server) await server.close();
});

test("real keyboard aim, charge, release, authored flight, score, pause, and reset share live state", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${server.origin}/apps/showcase-rooftop-buckets/`, { waitUntil: "commit", timeout: 120_000 });
  await ready(page);

  const boot = await evidence(page);
  expect(boot.status).toBe("ready");
  expect(boot.heat).toBe(1);
  expect(boot.state).toBe("playing");
  expect(boot.target).toBe(6);
  expect(boot.physicsBodyCount).toBe(0);
  expect(boot.simulationOwner).toContain("authored deterministic ballistic integrator");
  expect(boot.primaryAssets).toEqual([
    "assets.rooftopCourt", "assets.rooftopBackboard", "assets.rooftopRim", "assets.rooftopBall", "assets.rooftopAthleteShooter", "assets.rooftopAthleteDefender"
  ]);
  expect(Object.keys(boot.systems).sort()).toEqual(["audio", "contest", "flight", "presentation", "scoring"]);
  expect(boot.predictionPointCount).toBe(25);

  const initialSpot = boot.currentSpotId;
  await page.keyboard.down("KeyD");
  await pump(page, 3);
  await page.keyboard.up("KeyD");
  const moved = await evidence(page);
  expect(moved.currentSpotId).not.toBe(initialSpot);
  await expect(page.locator("#rb-spot-desc")).toContainText("Free Throw");

  const pitchBefore = moved.aimPitch;
  await page.keyboard.down("KeyW");
  await pump(page, 8);
  await page.keyboard.up("KeyW");
  expect((await evidence(page)).aimPitch).toBeGreaterThan(pitchBefore);

  await page.keyboard.down("Space");
  await pump(page, 26);
  const charging = await evidence(page);
  expect(charging.charging).toBe(true);
  expect(charging.chargePower).toBeGreaterThan(0.55);
  expect(charging.chargePower).toBeLessThan(0.7);
  await page.keyboard.up("Space");
  await pump(page, 2);
  expect((await evidence(page)).ballInFlight).toBe(true);
  await pump(page, 180);
  const resolved = await evidence(page);
  expect(resolved.ballInFlight).toBe(false);
  expect(resolved.makes + resolved.misses).toBe(1);
  expect(resolved.sensorEventCount).toBeGreaterThan(0);
  expect(resolved.lastShotResult).not.toBeNull();

  await page.keyboard.press("KeyP");
  const pausedStart = await evidence(page);
  await pump(page, 120);
  const paused = await evidence(page);
  expect(paused.state).toBe("paused");
  expect(paused.heatTimerMs).toBe(pausedStart.heatTimerMs);
  await page.keyboard.press("KeyP");
  await pump(page, 2);
  expect((await evidence(page)).state).toBe("playing");

  await page.keyboard.press("KeyR");
  await pump(page, 2);
  const reset = await evidence(page);
  expect(reset.heat).toBe(1);
  expect(reset.score).toBe(0);
  expect(reset.makes).toBe(0);
  expect(reset.misses).toBe(0);
  expect(reset.streak).toBe(0);
  expect(reset.onFire).toBe(false);
  writeFileSync(join(REPORT_DIR, "keyboard-flight-pause-reset.json"), `${JSON.stringify({ boot, moved, charging, resolved, pausedStart, paused, reset }, null, 2)}\n`);
});

test("five heat arc, defender, fire, gold outcomes, buzzer, and promised touch are browser-proven", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${server.origin}/apps/showcase-rooftop-buckets/`, { waitUntil: "commit", timeout: 120_000 });
  await ready(page);

  const open = await scenario(page, "open-clear");
  expect(open.heat).toBe(1);
  expect(open.state).toBe("heat-cleared");
  await expect(page.locator("#rb-modal-title")).toContainText("Heat 1 Cleared");
  await page.locator("#rb-modal-btn").click();
  await pump(page, 1);
  expect((await evidence(page)).heat).toBe(2);

  const spots = await scenario(page, "spot-clear");
  expect(spots.state).toBe("heat-cleared");
  expect(spots.madeSpotIds).toEqual([1, 2, 3]);
  await page.locator("#rb-modal-btn").click();
  await pump(page, 1);
  expect((await evidence(page)).heat).toBe(3);

  const pressure = await scenario(page, "pressure");
  expect(pressure.hoopMode).toBe("pressure");
  expect(pressure.defenderTelegraph).toBe("contest");
  expect(Math.abs(pressure.contestAimOffset)).toBeGreaterThan(0);
  const pressureClear = await scenario(page, "pressure-clear");
  expect(pressureClear.state).toBe("heat-cleared");
  await page.locator("#rb-modal-btn").click();
  await pump(page, 1);
  expect((await evidence(page)).heat).toBe(4);

  const fire = await scenario(page, "fire");
  expect(fire.state).toBe("heat-cleared");
  expect(fire.streak).toBe(3);
  expect(fire.onFire).toBe(true);
  expect(fire.fireAchieved).toBe(true);
  expect(fire.audioCues).toContain("fireIgnite");
  await page.locator("#rb-modal-btn").click();
  await pump(page, 1);
  expect((await evidence(page)).heat).toBe(5);

  const goldMiss = await scenario(page, "gold-miss");
  expect(goldMiss.state).toBe("game-over");
  expect(goldMiss.goldAttempted).toBe(true);
  expect(goldMiss.goldMade).toBe(false);
  const buzzer = await scenario(page, "buzzer");
  expect(buzzer.state).toBe("game-over");
  expect(buzzer.lastShotResult).toBe("violation");
  const goldWin = await scenario(page, "gold-win");
  expect(goldWin.state).toBe("victory");
  expect(goldWin.goldAttempted).toBe(true);
  expect(goldWin.goldMade).toBe(true);
  await expect(page.locator("#rb-modal-title")).toContainText("Victory");

  await page.setViewportSize({ width: 430, height: 800 });
  await page.goto(`${server.origin}/apps/showcase-rooftop-buckets/`, { waitUntil: "commit", timeout: 120_000 });
  await ready(page);
  const touchBoot = await evidence(page);
  await expect(page.getByRole("heading", { level: 1, name: /Rooftop Buckets/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /summer-night rooftop basketball court/i })).toBeVisible();
  const touchButtons = page.locator(".touch-controls button");
  await expect(touchButtons).toHaveCount(7);
  const touchTargets = await touchButtons.evaluateAll((buttons) => buttons.map((button) => {
    const bounds = button.getBoundingClientRect();
    return { id: button.id, name: button.textContent?.trim() ?? "", width: bounds.width, height: bounds.height };
  }));
  expect(new Set(touchTargets.map((target) => target.name)).size).toBe(7);
  for (const target of touchTargets) {
    expect(target.width, `${target.id} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.id} height`).toBeGreaterThanOrEqual(44);
  }
  await page.locator("#rb-touch-spot-left").focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("rb-touch-spot-right");
  await page.locator("#rb-touch-spot-right").click();
  expect((await evidence(page)).currentSpotId).not.toBe(touchBoot.currentSpotId);
  await page.locator("#rb-touch-aim-up").dispatchEvent("pointerdown");
  await pump(page, 8);
  await page.locator("#rb-touch-aim-up").dispatchEvent("pointerup");
  expect((await evidence(page)).aimPitch).toBeGreaterThan(touchBoot.aimPitch);
  await page.locator("#rb-touch-pause").click();
  const touchPaused = await evidence(page);
  expect(touchPaused.state).toBe("paused");
  await page.locator("#rb-touch-pause").click();
  expect((await evidence(page)).state).toBe("playing");
  await page.locator("#rb-touch-shoot").dispatchEvent("pointerdown");
  await pump(page, 26);
  expect((await evidence(page)).charging).toBe(true);
  await page.locator("#rb-touch-shoot").dispatchEvent("pointerup");
  await pump(page, 2);
  const touchFlight = await evidence(page);
  expect(touchFlight.ballInFlight).toBe(true);
  expect(touchFlight.audioCues).toContain("chargeTick");
  await page.locator("#rb-touch-reset").click();
  const touchReset = await evidence(page);
  expect(touchReset.state).toBe("playing");
  expect(touchReset.ballInFlight).toBe(false);
  expect(touchReset.score).toBe(0);

  writeFileSync(join(REPORT_DIR, "five-heats-touch.json"), `${JSON.stringify({ open, spots, pressure, pressureClear, fire, goldMiss, buzzer, goldWin, touchBoot, touchTargets, touchPaused, touchFlight, touchReset }, null, 2)}\n`);
  const binding = routeSourceBinding();
  const artifacts = ["keyboard-flight-pause-reset.json", "five-heats-touch.json"].map((file) => ({
    path: `${REPORT_DIR}/${file}`,
    sha256: sha256(`${REPORT_DIR}/${file}`)
  }));
  writeFileSync(join(REPORT_DIR, "browser-evidence.json"), `${JSON.stringify({
    schema: "aura3d.rooftop-buckets.playable-evidence/1.0",
    generatedAt: new Date().toISOString(),
    producer: PRODUCER,
    producerSourceSha256: sha256(PRODUCER),
    routeSourceFiles: binding.files,
    routeSourceSha256: binding.sha256,
    scenarios: [
      "keyboard-spot", "keyboard-aim", "keyboard-charge-release", "authored-flight-settle", "pause-freeze-resume", "full-reset",
      "open-clear", "three-unique-spots", "pressure-telegraph-offset", "pressure-clear", "fire-three-streak", "gold-miss",
      "gold-win", "buzzer", "touch-spot", "touch-aim", "touch-charge-release", "touch-pause-reset", "mobile-accessibility"
    ],
    artifacts,
    pass: true
  }, null, 2)}\n`);
});
