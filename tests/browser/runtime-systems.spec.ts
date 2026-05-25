import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = resolve(process.cwd(), "tests/reports/foundation-runtime-browser.json");

type RuntimeReport = {
  readonly generatedAt: string;
  readonly gameSlice?: unknown;
  readonly physicsSandbox?: unknown;
};

const report: RuntimeReport = {
  generatedAt: new Date().toISOString(),
};

test.describe("v3 runtime systems", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  test("game slice wires physics, animation, input bindings, particles, audio, and scripting", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.status === "ready", undefined, { timeout: 45_000 });

    await page.locator("[data-testid='unlock-audio']").click();
    await setControlValue(page, "[data-testid='binding-select']", "pointer", "change");
    await setControlValue(page, "[data-testid='mixer-volume']", "0.55", "input");
    await setControlValue(page, "[data-testid='mixer-mute']", true, "change");
    await setControlValue(page, "[data-testid='particle-sort']", "front-to-back", "change");
    await page.locator("[data-testid='pointer-lock']").dispatchEvent("click");
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("touchstart");
    await page.evaluate(() => {
      window.__GALILEO3D_TEST_GAMEPADS__ = [{
        id: "playwright-standard-gamepad",
        index: 0,
        connected: true,
        axes: [0.72, 0],
        buttons: [{ pressed: true, value: 1 }],
      }];
    });
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("pointerdown", { clientX: 120, clientY: 120, button: 0, pointerId: 1 });
    await page.locator("[data-testid='game-slice-canvas']").dispatchEvent("pointerup", { clientX: 120, clientY: 120, button: 0, pointerId: 1 });
    await page.locator("[data-testid='inject-script-error']").dispatchEvent("click");
    await page.locator("[data-testid='inject-asset-error']").dispatchEvent("click");
    await page.locator("[data-testid='inject-render-error']").dispatchEvent("click");
    await page.locator("[data-testid='inject-physics-error']").dispatchEvent("click");
    await page.locator("[data-testid='reload-behavior']").dispatchEvent("click");
    await page.locator("[data-testid='restart-objective']").dispatchEvent("click");
    await page.waitForFunction(() => window.__GALILEO3D_GAME_DEMO__?.metrics.objectivePhase === "playing", undefined, { timeout: 8_000 });
    await page.locator("[data-testid='game-slice-canvas']").focus();
    try {
      await page.keyboard.down("ArrowRight");
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true })));
      await page.waitForFunction(() => Number(window.__GALILEO3D_GAME_DEMO__?.metrics.triggerEvents ?? 0) >= 1, undefined, { timeout: 12_000 });
    } finally {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }))).catch(() => undefined);
      await page.keyboard.up("ArrowRight").catch(() => undefined);
    }
    await page.waitForFunction(() => Number(window.__GALILEO3D_GAME_DEMO__?.metrics.scriptErrors ?? 0) >= 1, undefined, { timeout: 8_000 });

    const state = await page.evaluate(() => window.__GALILEO3D_GAME_DEMO__);
    (report as { gameSlice?: unknown }).gameSlice = state;

    expect(errors).toEqual([]);
    expect(state?.status, state?.error).toBe("ready");
    expect(state?.renderer).toBe("webgl2");
    expect(Number(state?.diagnostics?.drawCalls ?? 0)).toBeGreaterThanOrEqual(5);
    expect(Number(state?.metrics.physicsBodies ?? 0)).toBeGreaterThanOrEqual(4);
    expect(Number(state?.metrics.triggerEvents ?? 0)).toBeGreaterThanOrEqual(1);
    expect(state?.metrics.raycastHit).toBe(true);
    expect(state?.metrics.shapeCastHit).toBe(true);
    expect(state?.metrics.animationPlayback).toBe(true);
    expect(state?.metrics.animationClipName).toBe("pickup-pulse");
    expect(Number(state?.metrics.pickupScale ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.liveParticles ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.particleUploadBytes ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.particleUpdateMs ?? 0)).toBeGreaterThanOrEqual(0);
    expect(state?.metrics.particleSortMode).toBe("front-to-back");
    expect(state?.metrics.particleBoundsAvailable).toBe(true);
    expect(Number(state?.metrics.particleBatchBoundsMaxX ?? 0)).toBeGreaterThan(Number(state?.metrics.particleBatchBoundsMinX ?? 0));
    expect(Number(state?.metrics.particleVisibleAfterCulling ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.particleCulledByView ?? 0)).toBeGreaterThanOrEqual(0);
    expect(state?.metrics.particleBlending).toBe(true);
    expect(state?.metrics.audioUnlocked).toBe(true);
    expect(state?.metrics.audioClipName).toBe("procedural-pickup-tone");
    expect(String(state?.metrics.audioClipSource ?? "")).toContain("data-uri-wav");
    expect(Number(state?.metrics.audioClipDuration ?? 0)).toBeGreaterThan(0.1);
    expect(Number(state?.metrics.audioMixerVolume ?? 0)).toBeCloseTo(0.55);
    expect(state?.metrics.audioMixerMuted).toBe(true);
    expect(Number(state?.metrics.audioPlays ?? 0)).toBeGreaterThanOrEqual(1);
    expect(state?.metrics.bindingPreset).toBe("pointer");
    expect(state?.metrics.spatialAudio).toBe(true);
    expect(state?.metrics.spatialAudioDebug).toBe(true);
    expect(Number(state?.metrics.spatialDistance ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.spatialSourceX ?? 0)).toBeCloseTo(0.9);
    expect(Number(state?.metrics.mobileUnlockAttempts ?? 0)).toBeGreaterThanOrEqual(1);
    expect(state?.metrics.mobileUnlockHandling).toBe(true);
    expect(String(state?.metrics.spatialAudioDebugText ?? "")).toContain("listener");
    expect(state?.metrics.pointerLockSupported).toBe(true);
    expect(Number(state?.metrics.pointerLockRequested ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.pointerLockChanges ?? 0) + Number(state?.metrics.pointerLockErrors ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number(state?.metrics.gamepadCount ?? 0)).toBe(1);
    expect(Number(state?.metrics.gamepadAxis0 ?? 0)).toBeGreaterThan(0.6);
    expect(state?.metrics.gamepadButton0Down).toBe(true);
    expect(Number(state?.metrics.pointerTouches ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number(state?.metrics.scriptStarted ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.scriptUpdates ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.scriptErrors ?? 0)).toBeGreaterThanOrEqual(1);
    expect(state?.metrics.scriptOverlayVisible).toBe(true);
    expect(Number(state?.metrics.runtimeErrorCount ?? 0)).toBeGreaterThanOrEqual(4);
    expect(state?.metrics.runtimeOverlayVisible).toBe(true);
    expect(String(state?.metrics.runtimeErrorPhases ?? "")).toContain("script");
    expect(String(state?.metrics.runtimeErrorPhases ?? "")).toContain("asset");
    expect(String(state?.metrics.runtimeErrorPhases ?? "")).toContain("render");
    expect(String(state?.metrics.runtimeErrorPhases ?? "")).toContain("physics");
    expect(Number(state?.metrics.assetErrors ?? 0)).toBe(1);
    expect(Number(state?.metrics.renderErrors ?? 0)).toBe(1);
    expect(Number(state?.metrics.physicsErrors ?? 0)).toBe(1);
    expect(state?.metrics.behaviorSceneObjectAttached).toBe(true);
    expect(Number(state?.metrics.behaviorMovementUpdates ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.behaviorInteractionEvents ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.behaviorTriggerEvents ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics.behaviorUiUpdates ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics.behaviorReloads ?? 0)).toBeGreaterThanOrEqual(1);
    expect(state?.metrics.behaviorReloadFlow).toBe(true);
    expect(state?.visualClaim).toContain("Interactive runtime slice");
    await expect(page.locator("[data-testid='game-slice-canvas']")).toBeVisible();
  });

  test("physics sandbox exposes v3 scene coverage and stability metrics", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(`${server.origin}/examples/physics-sandbox/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__GALILEO3D_PHYSICS_SANDBOX__?.status === "ready", undefined, { timeout: 20_000 });

    for (const scene of ["constraints", "triggers", "raycasts", "shape-casts", "sleeping", "stress"]) {
      await page.locator("[data-testid='physics-scene-select']").selectOption(scene);
    }
    await page.waitForFunction(() => window.__GALILEO3D_PHYSICS_SANDBOX__?.metrics?.activeScene === "stress", undefined, { timeout: 10_000 });

    const state = await page.evaluate(() => window.__GALILEO3D_PHYSICS_SANDBOX__);
    (report as { physicsSandbox?: unknown }).physicsSandbox = state;

    expect(errors).toEqual([]);
    expect(state?.status, state?.error).toBe("ready");
    expect(state?.rendererBacked).toBe(true);
    expect(String(state?.metrics?.availableScenes ?? "")).toContain("stack,constraints,triggers,raycasts,shape-casts,sleeping,stress");
    expect(state?.metrics?.activeScene).toBe("stress");
    expect(Number(state?.metrics?.bodies ?? 0)).toBeGreaterThanOrEqual(30);
    expect(Number(state?.metrics?.constraints ?? 0)).toBeGreaterThanOrEqual(2);
    expect(Number(state?.metrics?.sensors ?? 0)).toBe(1);
    expect(state?.metrics?.raycastHit).toBe(true);
    expect(state?.metrics?.shapeCastHit).toBe(true);
    expect(Number(state?.metrics?.sleepingBodies ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(state?.metrics?.broadphaseCandidateTests ?? 0)).toBeGreaterThan(0);
    expect(Number(state?.metrics?.kineticEnergy ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Number(state?.metrics?.stressBodies ?? 0)).toBe(18);
    expect(Number(state?.metrics?.movingPlatformX ?? 0)).not.toBe(0);
    expect(Number(state?.diagnostics?.drawCalls ?? 0)).toBeGreaterThan(1);
    await expect(page.locator("[data-testid='physics-sandbox-canvas']")).toBeVisible();
  });
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function setControlValue(page: Page, selector: string, value: string | boolean, eventType: "change" | "input"): Promise<void> {
  await page.locator(selector).evaluate(({ tagName }, payload) => {
    const element = document.querySelector(payload.selector);
    if (element instanceof HTMLInputElement && typeof payload.value === "boolean") {
      element.checked = payload.value;
      element.dispatchEvent(new Event(payload.eventType, { bubbles: true }));
      return;
    }
    if ((element instanceof HTMLInputElement || element instanceof HTMLSelectElement) && typeof payload.value === "string") {
      element.value = payload.value;
      element.dispatchEvent(new Event(payload.eventType, { bubbles: true }));
      return;
    }
    throw new Error(`Unsupported control for ${payload.selector}: ${tagName}`);
  }, { selector, value, eventType });
}

declare global {
  interface Window {
    __GALILEO3D_GAME_DEMO__?: {
      readonly id: string;
      readonly status: "ready" | "error";
      readonly renderer?: string;
      readonly interactions?: number;
      readonly metrics: Record<string, number | string | boolean>;
      readonly diagnostics?: { readonly drawCalls?: number };
      readonly visualClaim?: string;
      readonly error?: string;
    };
    __GALILEO3D_PHYSICS_SANDBOX__?: {
      readonly status: "ready" | "error";
      readonly rendererBacked?: boolean;
      readonly diagnostics?: { readonly drawCalls?: number };
      readonly metrics?: Record<string, string | number | boolean>;
      readonly error?: string;
    };
  }
}
