/**
 * SR-11 compact and reduced-motion acceptance.
 *
 * Desktop story-state artifacts are produced by showcase-gameplay-proof and the
 * ghost pair by skyline-ceremony-evidence. This suite owns the two acceptance
 * states those broader runs do not: real compact touch play and a reduced-motion
 * interaction whose gameplay truth advances while camera/secondary impulses do not.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const ROUTE = "/apps/showcase-skyline-runner/";
const GLOBAL = "__AURA3D_SHOWCASE_SKYLINE_RUNNER__";
const REPORT_DIR = resolve("tests/reports/skyline-accessibility-modes");

interface SkylineModeEvidence {
  readonly status: string;
  readonly platformerStateStatus: string;
  readonly player: {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly grounded: boolean;
  };
  readonly score: number;
  readonly coins: number;
  readonly deaths: number;
  readonly checkpointId: string;
  readonly eventFeedback: {
    readonly events: {
      readonly dash: { readonly observedCount: number };
    };
  };
  readonly cameraReadability: {
    readonly viewport: "desktop" | "compact";
    readonly viewportWidth: number;
    readonly viewportHeight: number;
    readonly activeFrame: {
      readonly leadMatchesFacing: boolean;
      readonly offset: readonly [number, number, number];
      readonly targetOffset: readonly [number, number, number];
    };
  };
  readonly motionPreferences: {
    readonly reducedMotion: boolean;
    readonly gameplayTruthPreserved: boolean;
    readonly essentialMotionRetained: readonly string[];
    readonly camera: {
      readonly impactRequests: number;
      readonly impactsSuppressed: number;
      readonly currentShakeOffset: readonly [number, number, number];
      readonly maximumShakeMagnitude: number;
      readonly impulsesRemoved: boolean;
    };
    readonly secondaryMotion: {
      readonly collectiblePulseAmplitude: number;
      readonly eventScalePulseAmplitude: number;
      readonly runtimeEffectsReduced: boolean;
      readonly excessiveMotionRemoved: boolean;
    };
  };
}

interface Artifact {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

function artifact(path: string, bytes: Buffer): Artifact {
  return {
    path: path.replace(`${process.cwd()}/`, ""),
    sha256: `sha256-${createHash("sha256").update(bytes).digest("hex")}`,
    bytes: bytes.byteLength
  };
}

async function waitForEvidence(page: Page): Promise<SkylineModeEvidence> {
  await page.waitForFunction((name) => {
    const value = (window as unknown as Record<string, SkylineModeEvidence | undefined>)[name];
    return value?.status === "running" && value.motionPreferences !== undefined;
  }, GLOBAL, { timeout: 45_000 });
  return readEvidence(page);
}

async function readEvidence(page: Page): Promise<SkylineModeEvidence> {
  return page.evaluate((name) =>
    (window as unknown as Record<string, SkylineModeEvidence>)[name]!, GLOBAL);
}

function gameplayTruth(evidence: SkylineModeEvidence) {
  return {
    status: evidence.platformerStateStatus,
    player: { ...evidence.player },
    score: evidence.score,
    coins: evidence.coins,
    deaths: evidence.deaths,
    checkpointId: evidence.checkpointId
  };
}

test.describe("Skyline compact and reduced-motion acceptance", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(REPORT_DIR, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("compact touch play remains composed and advances authoritative truth", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) browserErrors.push(message.text());
    });

    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    const before = await waitForEvidence(page);
    expect(before.cameraReadability.viewport).toBe("compact");
    expect(before.cameraReadability.viewportWidth).toBe(390);
    expect(before.cameraReadability.viewportHeight).toBe(844);

    const right = page.locator("#right-control");
    const jump = page.locator("#jump-control");
    await expect(right).toBeVisible();
    await expect(jump).toBeVisible();
    await right.dispatchEvent("pointerdown");
    await page.waitForTimeout(260);
    await jump.dispatchEvent("pointerdown");
    await page.waitForTimeout(80);
    await jump.dispatchEvent("pointerup");
    await page.waitForTimeout(180);
    await right.dispatchEvent("pointerup");

    const after = await readEvidence(page);
    expect(after.player.x).toBeGreaterThan(before.player.x + 0.1);
    expect(after.cameraReadability.activeFrame.leadMatchesFacing).toBe(true);
    expect(after.platformerStateStatus).toBe("playing");
    const path = join(REPORT_DIR, "compact-active-play.png");
    const image = await page.screenshot({ path });
    const result = {
      schema: "aura3d-skyline-compact-acceptance/1.0",
      pass: true,
      viewport: { width: 390, height: 844 },
      input: "real pointer hold on right-control plus jump-control",
      truthBefore: gameplayTruth(before),
      truthAfter: gameplayTruth(after),
      camera: after.cameraReadability,
      artifact: artifact(path, image),
      browserErrors
    };
    writeFileSync(join(REPORT_DIR, "compact.json"), `${JSON.stringify(result, null, 2)}\n`);
    expect(browserErrors).toEqual([]);
  });

  test("reduced motion preserves dash truth while removing camera and secondary impulses", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) browserErrors.push(message.text());
    });

    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    const before = await waitForEvidence(page);
    expect(before.motionPreferences.reducedMotion).toBe(true);

    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(120);
    await page.keyboard.press("ShiftLeft");
    await expect.poll(async () => (await readEvidence(page)).eventFeedback.events.dash.observedCount, {
      timeout: 5_000
    }).toBeGreaterThan(0);
    await page.waitForTimeout(80);
    await page.keyboard.up("ArrowRight");
    const after = await readEvidence(page);

    expect(after.player.x).toBeGreaterThan(before.player.x);
    expect(after.platformerStateStatus).toBe("playing");
    expect(after.motionPreferences.gameplayTruthPreserved).toBe(true);
    expect(after.motionPreferences.essentialMotionRetained).toContain("player locomotion");
    expect(after.motionPreferences.camera.impactRequests).toBeGreaterThan(0);
    expect(after.motionPreferences.camera.impactsSuppressed)
      .toBe(after.motionPreferences.camera.impactRequests);
    expect(after.motionPreferences.camera.maximumShakeMagnitude).toBe(0);
    expect(after.motionPreferences.camera.currentShakeOffset).toEqual([0, 0, 0]);
    expect(after.motionPreferences.camera.impulsesRemoved).toBe(true);
    expect(after.motionPreferences.secondaryMotion).toEqual({
      collectiblePulseAmplitude: 0,
      eventScalePulseAmplitude: 0,
      runtimeEffectsReduced: true,
      excessiveMotionRemoved: true
    });

    const path = join(REPORT_DIR, "reduced-motion-dash.png");
    const image = await page.screenshot({ path });
    const result = {
      schema: "aura3d-skyline-reduced-motion-acceptance/1.0",
      pass: true,
      media: "prefers-reduced-motion: reduce",
      interaction: "actual ArrowRight movement plus ShiftLeft dash",
      truthBefore: gameplayTruth(before),
      truthAfter: gameplayTruth(after),
      motionPreferences: after.motionPreferences,
      artifact: artifact(path, image),
      browserErrors
    };
    writeFileSync(join(REPORT_DIR, "reduced-motion.json"), `${JSON.stringify(result, null, 2)}\n`);
    expect(browserErrors).toEqual([]);
  });
});
