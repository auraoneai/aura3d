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

  test("turbo chase follow carries shake displacement, punch-in reframing, and feel nodes", async ({ page }, testInfo) => {
    testInfo.setTimeout(240_000);
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
      { timeout: 30_000 }
    );
    await page.waitForFunction(
      (name) => {
        const juice = (window as unknown as Record<string, any>)[name]?.gameFeel;
        return juice?.punchSeen === true && juice?.maxTrauma > 0.3;
      },
      TURBO_GLOBAL,
      { timeout: 30_000 }
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
      { timeout: 30_000 }
    );
    const settled = (await readTurbo(page)).gameFeel!;
    expect(settled.shakeEnergy).toBeLessThan(0.05);
    expect(settled.shakeOffset).toEqual([0, 0, 0]);
    expect(settled.cameraFov, "fov returns to the authored chase framing").toBeCloseTo(62, 5);
    await page.screenshot({ path: `${REPORT_DIR}/turbo-settled.png` });

    expect(errors, `runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("skyline platformer follow carries shake displacement, punch-in reframing, and feel nodes", async ({ page }, testInfo) => {
    testInfo.setTimeout(240_000);
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
      { timeout: 30_000 }
    );
    await page.waitForFunction(
      (name) => {
        const juice = (window as unknown as Record<string, any>)[name]?.feel?.rootJuice;
        return juice?.punchSeen === true && juice?.maxTrauma > 0.3;
      },
      SKYLINE_GLOBAL,
      { timeout: 30_000 }
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
    ), { timeout: 30_000 }).toBeGreaterThan(jumpsBefore);

    await page.waitForFunction(
      (name) => {
        const juice = (window as unknown as Record<string, any>)[name]?.feel?.rootJuice;
        return juice?.punchActive === false && juice?.trauma < 0.05 && juice?.punchFovOffset === 0;
      },
      SKYLINE_GLOBAL,
      { timeout: 30_000 }
    );
    const settled = (await readSkyline(page)).feel!.rootJuice!;
    expect(settled.shakeEnergy).toBeLessThan(0.05);
    await page.screenshot({ path: `${REPORT_DIR}/skyline-settled.png` });

    expect(errors, `runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });
});
