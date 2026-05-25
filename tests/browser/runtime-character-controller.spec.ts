import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const assetScreenshotPath = resolve(process.cwd(), "examples/game-slice/test-artifacts/foundation-game-slice-assets.png");

test.describe("runtime character controller", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("game slice drives player movement and jump through the physics CharacterController", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.status === "ready", undefined, { timeout: 45_000 });

    await page.locator("[data-testid='game-slice-canvas']").focus();
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.metrics.characterControllerGrounded === true, undefined, { timeout: 10_000 });
    const before = await metrics(page);

    await page.evaluate(() => {
      window.__GALILEO3D_TEST_GAMEPADS__ = [{
        id: "character-controller-test-gamepad",
        index: 0,
        connected: true,
        axes: [0.8, 0],
        buttons: [{ pressed: false, value: 0 }],
      }];
    });
    await page.waitForFunction(
      (startX) => Number(window.__GALILEO3D_GAME_DEMO__?.metrics.playerX ?? -999) > Number(startX) + 0.25,
      before.playerX,
      { timeout: 10_000 }
    );
    await page.evaluate(() => {
      window.__GALILEO3D_TEST_GAMEPADS__ = [{
        id: "character-controller-test-gamepad",
        index: 0,
        connected: true,
        axes: [0, 0],
        buttons: [{ pressed: false, value: 0 }],
      }];
    });
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.metrics.characterControllerGrounded === true, undefined, { timeout: 10_000 });

    await page.evaluate(() => {
      window.__GALILEO3D_TEST_GAMEPADS__ = [{
        id: "character-controller-test-gamepad",
        index: 0,
        connected: true,
        axes: [0, 0],
        buttons: [{ pressed: true, value: 1 }],
      }];
    });
    await page.waitForFunction(() => Number(window.__GALILEO3D_GAME_DEMO__?.metrics.characterControllerJumpCount ?? 0) >= 1, undefined, { timeout: 10_000 });
    await page.evaluate(() => {
      window.__GALILEO3D_TEST_GAMEPADS__ = [{
        id: "character-controller-test-gamepad",
        index: 0,
        connected: true,
        axes: [0, 0],
        buttons: [{ pressed: false, value: 0 }],
      }];
    });
    const after = await metrics(page);

    expect(errors).toEqual([]);
    expect(after.characterController).toBe(true);
    expect(after.characterControllerColliderKind).toBe("capsule");
    expect(Number(after.characterControllerRadius)).toBeCloseTo(0.22);
    expect(Number(after.characterControllerHalfHeight)).toBeCloseTo(0.24);
    expect(Number(after.characterControllerMaxSpeed)).toBeCloseTo(3.2);
    expect(Number(after.characterControllerBodyId)).toBeGreaterThan(0);
    expect(Number(after.characterControllerColliderId)).toBeGreaterThan(0);
    expect(Number(after.characterControllerGroundNormalY)).toBeGreaterThan(0.5);
    expect(Number(after.characterControllerSpeed)).toBeGreaterThanOrEqual(0);
    expect(Number(after.characterControllerDesiredX)).toBeGreaterThanOrEqual(0);
    expect(Number(after.characterControllerJumpCount)).toBeGreaterThanOrEqual(1);
    expect(Number(after.playerX)).toBeGreaterThan(Number(before.playerX));
    await expect(page.locator("[data-testid='game-slice-canvas']")).toBeVisible();
  });

  test("game slice follows the player with a third-person camera path", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.status === "ready", undefined, { timeout: 45_000 });

    await page.locator("[data-testid='game-slice-canvas']").focus();
    const before = await metrics(page);
    await setTestGamepad(page, 0.85, false);
    await page.waitForFunction(
      (startX) => {
        const metrics = window.__GALILEO3D_GAME_DEMO__?.metrics;
        return Number(metrics?.playerX ?? -999) > Number(startX) + 0.25
          && Number(metrics?.cameraFollowPathLength ?? 0) > 0.04
          && Number(metrics?.cameraFollowUpdates ?? 0) > 10;
      },
      before.playerX,
      { timeout: 12_000 }
    );
    await setTestGamepad(page, 0, false);
    const after = await metrics(page);

    expect(errors).toEqual([]);
    expect(after.cameraMode).toBe("third-person-follow");
    expect(after.cameraFollowEnabled).toBe(true);
    expect(Number(after.cameraFollowUpdates)).toBeGreaterThan(10);
    expect(Number(after.cameraFollowPathLength)).toBeGreaterThan(0.04);
    expect(Number(after.cameraActualX)).not.toBeCloseTo(Number(before.cameraActualX));
    expect(Number(after.cameraTargetX)).toBeGreaterThan(Number(before.cameraTargetX));
    expect(Number(after.cameraDistance)).toBeGreaterThan(2.5);
    expect(Number(after.cameraTargetPlayerDeltaX)).toBe(0);
    await expect(page.locator("[data-testid='game-slice-canvas']")).toBeVisible();
  });

  test("game slice renders generated glTF player and arena assets with contact shadow evidence", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.status === "ready", undefined, { timeout: 45_000 });
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.metrics.visualAssetsLoaded === true, undefined, { timeout: 15_000 });

    await page.locator("[data-testid='game-slice-canvas']").focus();
    await page.waitForFunction(() => Number(window.__GALILEO3D_GAME_DEMO__?.metrics.visualAssetRenderItems ?? 0) >= 16, undefined, { timeout: 10_000 });

    await mkdir(dirname(assetScreenshotPath), { recursive: true });
    await page.screenshot({ path: assetScreenshotPath, fullPage: true });
    const state = await metrics(page);
    const pixelStats = await canvasPixelStats(page);

    expect(errors).toEqual([]);
    expect(state.visualAssetsLoaded).toBe(true);
    expect(state.productionLikePlayerModel).toBe(true);
    expect(state.productionLikeArenaAsset).toBe(true);
    expect(state.primitivePlayerFallback).toBe(false);
    expect(String(state.visualAssetPlayerUrl)).toContain("/fixtures/assets/v3/character/game-hero-runner/game-hero-runner.gltf");
    expect(String(state.visualAssetArenaUrl)).toContain("/fixtures/assets/v3/environment/game-arena-outpost/game-arena-outpost.gltf");
    expect(Number(state.visualAssetPlayerMeshes)).toBeGreaterThanOrEqual(5);
    expect(Number(state.visualAssetArenaMeshes)).toBeGreaterThanOrEqual(6);
    expect(Number(state.visualAssetPlayerRenderables)).toBeGreaterThanOrEqual(8);
    expect(Number(state.visualAssetArenaRenderables)).toBeGreaterThanOrEqual(8);
    expect(Number(state.visualAssetRenderItems)).toBeGreaterThanOrEqual(16);
    expect(state.contactShadowProxy).toBe(true);
    expect(state.shadowMode).toBe("contact-shadow-proxy");
    expect(pixelStats.nonBlankPixels).toBeGreaterThan(300);
    expect(pixelStats.colorBuckets).toBeGreaterThanOrEqual(1);
    await expect(page.locator("[data-testid='game-slice-canvas']")).toBeVisible();
  });

  test("game slice resolves win and fail objective states from gameplay movement", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.status === "ready", undefined, { timeout: 45_000 });

    await page.locator("[data-testid='game-slice-canvas']").focus();
    await setTestGamepad(page, 0.9, false);
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.metrics.objectivePhase === "won", undefined, { timeout: 45_000 });
    await setTestGamepad(page, 0, false);
    const won = await metrics(page);

    expect(won.objectivePhase).toBe("won");
    expect(won.objectiveStep).toBe("complete");
    expect(won.objectiveCollectedPickup).toBe(true);
    expect(won.objectiveExitReached).toBe(true);
    expect(won.objectiveWinReason).toBe("exit-gate");
    expect(Number(won.objectiveWinCount)).toBe(1);
    expect(Number(won.pickups)).toBeGreaterThanOrEqual(1);
    expect(Number(won.triggerEvents)).toBeGreaterThanOrEqual(1);
    await expect(page.locator("[data-testid='objective-status']")).toHaveAttribute("data-phase", "won");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.status === "ready", undefined, { timeout: 45_000 });
    await page.locator("[data-testid='game-slice-canvas']").focus();
    await setTestGamepad(page, -0.9, false);
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.metrics.objectivePhase === "failed", undefined, { timeout: 45_000 });
    await setTestGamepad(page, 0, false);
    const failed = await metrics(page);

    expect(errors).toEqual([]);
    expect(failed.objectivePhase).toBe("failed");
    expect(failed.objectiveStep).toBe("failed");
    expect(failed.objectiveFailReason).toBe("hazard-zone");
    expect(Number(failed.objectiveFailCount)).toBe(1);
    expect(failed.objectiveCollectedPickup).toBe(false);
    await expect(page.locator("[data-testid='objective-status']")).toHaveAttribute("data-phase", "failed");
  });
});

async function metrics(page: Page): Promise<Record<string, number | string | boolean>> {
  return page.evaluate(() => window.__GALILEO3D_GAME_DEMO__?.metrics ?? {});
}

async function setTestGamepad(page: Page, axisX: number, jump: boolean): Promise<void> {
  await page.evaluate(({ axisX, jump }) => {
    window.__GALILEO3D_TEST_GAMEPADS__ = [{
      id: "character-controller-test-gamepad",
      index: 0,
      connected: true,
      axes: [axisX, 0],
      buttons: [{ pressed: jump, value: jump ? 1 : 0 }],
    }];
  }, { axisX, jump });
}

async function canvasPixelStats(page: Page): Promise<{ readonly nonBlankPixels: number; readonly colorBuckets: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='game-slice-canvas']");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!canvas || !gl) return { nonBlankPixels: 0, colorBuckets: 0 };
    const width = Math.min(320, canvas.width);
    const height = Math.min(180, canvas.height);
    const x = Math.max(0, Math.floor(canvas.width / 2 - width / 2));
    const y = Math.max(0, Math.floor(canvas.height / 2 - height / 2));
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const buckets = new Set<string>();
    let nonBlankPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const a = pixels[index + 3] ?? 0;
      if (r > 8 || g > 8 || b > 8 || a > 8) {
        nonBlankPixels += 1;
        buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
      }
    }
    return { nonBlankPixels, colorBuckets: buckets.size };
  });
}

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

declare global {
  interface Window {
    __GALILEO3D_GAME_DEMO__?: {
      readonly status: "ready" | "error";
      readonly metrics: Record<string, number | string | boolean>;
    };
    __GALILEO3D_TEST_GAMEPADS__?: readonly {
      readonly id: string;
      readonly index: number;
      readonly connected: boolean;
      readonly axes: readonly number[];
      readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
    }[];
  }
}
