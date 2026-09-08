/**
 * PART F2/F3 route adoption proof (muse3jsparity-PRD).
 *
 * Turbo Drift Circuit and Skyline Runner adopt the root game-feel kit on top
 * of their existing follow rigs: `camera.shake` (trauma) displaces the lens,
 * `camera.punchIn` reframes fov/distance on impacts, and `gameFeel` spawns
 * node-backed feel effects with budget telemetry. Each route exposes a
 * deterministic `?juiceProbe=1` hook that fires the full juice chain once
 * through the same code path as gameplay events, so this spec can prove the
 * juice is live: camera state changes, shake displaces, punch-in changes
 * framing, then everything decays/settles, with screenshots for human review.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/route-gamefeel-adoption");
const TURBO_ROUTE = "/apps/showcase-turbo-drift-circuit/?juiceProbe=1";
const TURBO_GLOBAL = "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__";
const SKYLINE_ROUTE = "/apps/showcase-skyline-runner/?juiceProbe=1";
const SKYLINE_GLOBAL = "__AURA3D_SHOWCASE_SKYLINE_RUNNER__";
// A production route can hold the next frame for several minutes under the
// disclosed remote SwiftShader adapter. These waits still require the same
// real input and gameplay transitions; they only stop scheduler throughput
// from becoming a false behavioral failure.
const SOFTWARE_GPU_FRAME_TIMEOUT_MS = 300_000;

interface TurboJuice {
  readonly trauma: number;
  readonly shakeEnergy: number;
  readonly shakeOffset: readonly number[];
  readonly punchActive: boolean;
  readonly punchFovOffset: number;
  readonly cameraFov: number;
  readonly effectsSpawned: number;
  readonly overBudget: boolean;
  readonly maxTrauma: number;
  readonly maxShakeOffset: number;
  readonly punchSeen: boolean;
  readonly probeFired: boolean;
}

interface SkylineJuice {
  readonly trauma: number;
  readonly shakeEnergy: number;
  readonly punchActive: boolean;
  readonly punchFovOffset: number;
  readonly maxTrauma: number;
  readonly maxShakeMagnitude: number;
  readonly shakeSeen: boolean;
  readonly punchSeen: boolean;
  readonly effectsSpawned: number;
  readonly overBudget: boolean;
  readonly probeFired: boolean;
}

function collectErrors(page: Page, errors: string[]): void {
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon/i.test(message.text())) {
      errors.push(`console: ${message.text()}`);
    }
  });
}

async function readTurbo(page: Page): Promise<{ status?: string; gameFeel?: TurboJuice; camera?: { mode?: string; targetNode?: string; fov?: number } }> {
  return page.evaluate((name) => {
    const value = (window as unknown as Record<string, any>)[name] ?? {};
    return { status: value.status, gameFeel: value.gameFeel, camera: value.camera };
  }, TURBO_GLOBAL);
}

async function readSkyline(page: Page): Promise<{
  status?: string;
  feel?: { landDipApplied?: boolean; dashPunchApplied?: boolean; rootJuice?: SkylineJuice };
  cameraReadability?: { mode?: string; targetNode?: string };
  motionPreferences?: { camera?: Record<string, unknown> };
}> {
  return page.evaluate((name) => {
    const value = (window as unknown as Record<string, any>)[name] ?? {};
    return {
      status: value.status,
      feel: value.feel,
      cameraReadability: value.cameraReadability,
      motionPreferences: value.motionPreferences
    };
  }, SKYLINE_GLOBAL);
}

test.describe("F2/F3 root-kit adoption in game routes", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(REPORT_DIR, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("Aura Clash confirmed combat drives shared camera rigs and settles", async ({ page }, testInfo) => {
    // Production root rendering under remote SwiftShader can spend several
    // minutes in a single submitted frame. Keep the full behavioral oracle and
    // allow its measured wall clock; this does not alter any workload or gate.
    testInfo.setTimeout(900_000);
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto(`${server.origin}/apps/aura-clash-showcase/?auraTestDriver=1`);
    await page.waitForFunction(() => {
      const w = window as any;
      return Boolean(w.__AURA_CLASH_ARENA_TEST_DRIVER__) || w.__AURA_CLASH_ARENA_PROOF__?.status === "error";
    }, undefined, { timeout: 300_000 });
    const bootError = await page.evaluate(() => (window as any).__AURA_CLASH_ARENA_PROOF__?.error ?? null);
    expect(bootError, "Aura Clash must finish production-route boot without a published error").toBeNull();
    await page.evaluate(() => {
      const driver = (window as any).__AURA_CLASH_ARENA_TEST_DRIVER__;
      driver.setPositions(-0.86, 0.44);
      driver.setRivalHealth(300);
      driver.setRivalGuardSuppressed(true);
      driver.pauseOnNextHit();
      driver.queuePlayerAttack("heavy");
      driver.advanceFrame();
    });
    await page.waitForFunction(() => {
      const proof = (window as any).__AURA_CLASH_ARENA_PROOF__;
      return proof?.status === "paused" && proof.totalHits > 0;
    }, undefined, { timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS });
    const impact = await page.evaluate(() => (window as any).__AURA_CLASH_ARENA_PROOF__.camera);
    expect(impact.sharedRig.follow.kind).toBe("aura-game-follow-rig");
    expect(impact.sharedRig.shake.energy).toBeGreaterThan(0);
    expect(impact.sharedRig.punch.active).toBe(true);
    expect(impact.respondingToCombat).toBe(true);
    expect(impact.fovYRadians).toBeLessThan(Math.PI / 3);
    expect(impact.fighterFraming.playerFullBodyInFrame).toBe(true);
    expect(impact.fighterFraming.rivalFullBodyInFrame).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("clash-shared-camera-impact.png") });
    // Exercise the route's real reset path. A full page reload can block inside
    // a synchronous SwiftShader frame and never reach Playwright's timeout;
    // resetForCapture clears the same gameplay/camera state as the public R
    // control, releases the evidence pause, and lets the next production frame
    // publish the settled endpoint.
    const impactFrame = await page.evaluate(() => (window as any).__AURA_CLASH_ARENA_PROOF__.frame);
    await page.evaluate(() => (window as any).__AURA_CLASH_ARENA_TEST_DRIVER__.resetForCapture());
    await page.waitForFunction((previousFrame) => {
      const proof = (window as any).__AURA_CLASH_ARENA_PROOF__;
      return proof?.status === "running" && proof.frame > previousFrame && proof.controls.resetCount > 0;
    }, impactFrame, { timeout: 300_000 });
    const settledProof = await page.evaluate(() => (window as any).__AURA_CLASH_ARENA_PROOF__);
    expect(settledProof.error).toBeNull();
    expect(settledProof.status).toBe("running");
    const settled = settledProof.camera;
    expect(settled.sharedRig.shake.trauma).toBe(0);
    expect(settled.sharedRig.punch.active).toBe(false);
    expect(settled.fovYRadians).toBeCloseTo(Math.PI / 3, 5);
    expect(settled.sharedRig.shake.trauma).toBe(0);
    expect(settled.fighterFraming.playerFullBodyInFrame).toBe(true);
    expect(settled.fighterFraming.rivalFullBodyInFrame).toBe(true);
    await testInfo.attach("clash-shared-camera-impact", { body: JSON.stringify({ impact, settled }), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath("clash-shared-camera-settled.png") });
  });

  test("Aura Clash mobile reduced-motion preserves controls without camera impulses", async ({ page }, testInfo) => {
    testInfo.setTimeout(900_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${server.origin}/apps/aura-clash-showcase/?auraTestDriver=1`);
    await page.waitForFunction(() => {
      const w = window as any;
      return Boolean(w.__AURA_CLASH_ARENA_TEST_DRIVER__) || w.__AURA_CLASH_ARENA_PROOF__?.status === "error";
    }, undefined, { timeout: 300_000 });
    const bootError = await page.evaluate(() => (window as any).__AURA_CLASH_ARENA_PROOF__?.error ?? null);
    expect(bootError, "Aura Clash mobile must finish production-route boot without a published error").toBeNull();
    await page.evaluate(() => {
      const driver = (window as any).__AURA_CLASH_ARENA_TEST_DRIVER__;
      driver.setPositions(-0.86, 0.44);
      driver.setRivalHealth(300);
      driver.setRivalGuardSuppressed(true);
    });
    await page.locator('[data-press="heavy"]').click();
    await page.evaluate(() => (window as any).__AURA_CLASH_ARENA_TEST_DRIVER__.advanceFrame());
    await expect.poll(() => page.evaluate(() => (window as any).__AURA_CLASH_ARENA_PROOF__?.player?.attacking ?? null), { timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS }).toBe("heavy");
    await page.evaluate(() => {
      const driver = (window as any).__AURA_CLASH_ARENA_TEST_DRIVER__;
      driver.setPositions(-0.86, 0.44);
      driver.setRivalGuardSuppressed(true);
      driver.queuePlayerAttack("heavy");
      driver.advanceFrame();
    });
    await expect.poll(() => page.evaluate(() => (window as any).__AURA_CLASH_ARENA_PROOF__?.totalHits ?? 0), { timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS }).toBeGreaterThan(0);
    const cameraProof = await page.evaluate(() => (window as any).__AURA_CLASH_ARENA_PROOF__.camera);
    expect(cameraProof.sharedRig.shake.trauma).toBe(0);
    expect(cameraProof.sharedRig.punch.active).toBe(false);
    expect(cameraProof.fighterFraming.playerFullBodyInFrame).toBe(true);
    expect(cameraProof.fighterFraming.rivalFullBodyInFrame).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("clash-mobile-reduced-motion.png") });
  });

  test("turbo chase follow carries shake displacement, punch-in reframing, and feel nodes", async ({ page }, testInfo) => {
    testInfo.setTimeout(1_200_000);
    const errors: string[] = [];
    collectErrors(page, errors);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}${TURBO_ROUTE}`, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      (name) => (window as unknown as Record<string, any>)[name]?.gameFeel !== undefined,
      TURBO_GLOBAL,
      { timeout: 120_000 }
    );
    // Follow leg: the chase rig still owns the follow on the player car.
    const mounted = await readTurbo(page);
    expect(mounted.status).toBe("ready");
    expect(mounted.camera?.mode).toBe("chase");
    expect(mounted.camera?.targetNode).toBe("racing-player-car");

    // The probe fires the full juice chain once through the gameplay path.
    await page.waitForFunction(
      (name) => (window as unknown as Record<string, any>)[name]?.gameFeel?.probeFired === true,
      TURBO_GLOBAL,
      { timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS }
    );
    await page.waitForFunction(
      (name) => {
        const juice = (window as unknown as Record<string, any>)[name]?.gameFeel;
        return juice?.punchSeen === true && juice?.maxTrauma > 0.3;
      },
      TURBO_GLOBAL,
      { timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS }
    );
    // Mid-juice frame: the punch is active, so framing is mid-kick.
    await page.screenshot({ path: `${REPORT_DIR}/turbo-punch.png` });

    const juiced = (await readTurbo(page)).gameFeel!;
    expect(juiced.maxShakeOffset, "shake displaced the chase lens").toBeGreaterThan(0);
    expect(juiced.effectsSpawned, "feel spawned node-backed effects").toBeGreaterThanOrEqual(3);
    expect(juiced.overBudget, "feel stayed inside its frame budget").toBe(false);

    // Settle leg: trauma decays, shake returns to zero, punch releases fov.
    await page.waitForFunction(
      (name) => {
        const juice = (window as unknown as Record<string, any>)[name]?.gameFeel;
        return juice?.punchActive === false && juice?.trauma < 0.05 && juice?.punchFovOffset === 0;
      },
      TURBO_GLOBAL,
      { timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS }
    );
    const settled = (await readTurbo(page)).gameFeel!;
    expect(settled.shakeEnergy).toBeLessThan(0.05);
    expect(settled.shakeOffset).toEqual([0, 0, 0]);
    expect(settled.cameraFov, "fov returns to the authored chase framing").toBeCloseTo(62, 5);
    await page.screenshot({ path: `${REPORT_DIR}/turbo-settled.png` });

    expect(errors, `runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("skyline platformer follow carries shake displacement, punch-in reframing, and feel nodes", async ({ page }, testInfo) => {
    testInfo.setTimeout(1_200_000);
    const errors: string[] = [];
    collectErrors(page, errors);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}${SKYLINE_ROUTE}`, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      (name) => (window as unknown as Record<string, any>)[name]?.feel?.rootJuice !== undefined,
      SKYLINE_GLOBAL,
      { timeout: 120_000 }
    );
    // Follow leg: the platformer follow rig still owns the follow.
    const mounted = await readSkyline(page);
    expect(mounted.status).toBe("ready");
    expect(mounted.cameraReadability?.mode).toBe("follow");
    expect(mounted.cameraReadability?.targetNode).toBe("platformer-player");

    await page.waitForFunction(
      (name) => (window as unknown as Record<string, any>)[name]?.feel?.rootJuice?.probeFired === true,
      SKYLINE_GLOBAL,
      { timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS }
    );
    await page.waitForFunction(
      (name) => {
        const juice = (window as unknown as Record<string, any>)[name]?.feel?.rootJuice;
        return juice?.punchSeen === true && juice?.maxTrauma > 0.3;
      },
      SKYLINE_GLOBAL,
      { timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS }
    );
    await page.screenshot({ path: `${REPORT_DIR}/skyline-punch.png` });

    const juiced = (await readSkyline(page)).feel!.rootJuice!;
    expect(juiced.maxShakeMagnitude, "shake displaced the follow lens").toBeGreaterThan(0);
    expect(juiced.effectsSpawned, "feel spawned node-backed effects").toBeGreaterThanOrEqual(3);
    expect(juiced.overBudget, "feel stayed inside its frame budget").toBe(false);
    // Gameplay ceremony still flows with the root kit wired: a real jump input
    // raises the jump feedback count through the normal kit event path. (A
    // spawn-drop landing is genuine gameplay, so landDipApplied is not
    // asserted here; the probe itself only touches root-kit state.)
    const jumpsBefore = await page.evaluate(
      (name) => (window as unknown as Record<string, any>)[name]?.eventFeedback?.events?.jump?.observedCount ?? 0,
      SKYLINE_GLOBAL
    );
    await page.keyboard.down("Space");
    await page.waitForTimeout(400);
    await page.keyboard.up("Space");
    await expect.poll(async () => page.evaluate(
      (name) => (window as unknown as Record<string, any>)[name]?.eventFeedback?.events?.jump?.observedCount ?? 0,
      SKYLINE_GLOBAL
    ), { timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS }).toBeGreaterThan(jumpsBefore);

    await page.waitForFunction(
      (name) => {
        const juice = (window as unknown as Record<string, any>)[name]?.feel?.rootJuice;
        return juice?.punchActive === false && juice?.trauma < 0.05 && juice?.punchFovOffset === 0;
      },
      SKYLINE_GLOBAL,
      { timeout: SOFTWARE_GPU_FRAME_TIMEOUT_MS }
    );
    const settled = (await readSkyline(page)).feel!.rootJuice!;
    expect(settled.shakeEnergy).toBeLessThan(0.05);
    await page.screenshot({ path: `${REPORT_DIR}/skyline-settled.png` });

    expect(errors, `runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });
});
