import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

const REPORT_ROOT = resolve("tests/reports/context-recovery-lab");

test("public recovery lab visibly survives a real WebGL2 context loss and explicit remount", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const server = await startExampleDevServer();
  try {
    mkdirSync(REPORT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/examples/context-recovery-lab/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_CONTEXT_RECOVERY_LAB__?.status === "ready", undefined, { timeout: 90_000 });
    const ready = await evidence(page);
    expect(ready).toMatchObject({
      status: "ready",
      claim: "root-app-driven-webgl2-context-recovery-example",
      lostCount: 0,
      restoredCount: 0,
      recoveryCount: 0,
      deviceLost: false,
      runtimeBackend: "production-runtime",
      rendererMode: "production",
      errors: []
    });
    assertPublicSourceBoundary();
    const readyCapture = await captureState(page, "ready", true);
    expect(readyCapture.canvasBytes).toBeGreaterThan(20_000);

    await page.getByRole("button", { name: "Lose WebGL context" }).click();
    await page.waitForFunction(() => window.__AURA3D_CONTEXT_RECOVERY_LAB__?.status === "lost");
    const lost = await evidence(page);
    expect(lost.extensionAvailable).toBe(true);
    expect(lost.lostCount).toBe(1);
    expect(lost.deviceLost).toBe(true);
    expect(lost.pausedOnLoss).toBe(true);
    expect(lost.beforeLoss.litPixels).toBeGreaterThan(10_000);
    expect(lost.beforeLoss.pixelHash).not.toBe("00000000");
    const lostCapture = await captureState(page, "lost", false);
    await expect(page.getByTestId("recovery-overlay")).toBeVisible();
    await expect(page.getByTestId("restore-context")).toBeEnabled();

    await page.getByRole("button", { name: "Restore + remount" }).click();
    await page.waitForFunction(() => window.__AURA3D_CONTEXT_RECOVERY_LAB__?.status === "restored", undefined, { timeout: 60_000 });
    const restored = await evidence(page);
    expect(restored.lostCount).toBe(1);
    expect(restored.restoredCount).toBe(1);
    expect(restored.recoveryCount).toBe(1);
    expect(restored.deviceLost).toBe(false);
    expect(restored.resourcesRecreated).toBe(true);
    expect(restored.afterRestore.runtimeMounted).toBe(true);
    expect(restored.runtimeBackend).toBe("production-runtime");
    expect(restored.errors).toEqual([]);
    await expect(page.getByTestId("recovery-overlay")).toBeHidden();
    const restoredCapture = await captureState(page, "restored", true);
    expect(restoredCapture.canvasSha256).toBe(readyCapture.canvasSha256);
    expect(errors).toEqual([]);

    const report = {
      schema: "aura3d.context-recovery-gallery-browser/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      ready,
      lost,
      restored,
      rawCanvasIdentity: { before: readyCapture.canvasSha256, after: restoredCapture.canvasSha256, exactMatch: restoredCapture.canvasSha256 === readyCapture.canvasSha256 },
      artifacts: [readyCapture, lostCapture, restoredCapture],
      comparisonBoundary: "This proves app-driven WebGL2 recovery through the root public lifecycle API and explicit scene remount. It does not claim transparent recreation of arbitrary caller-owned GPU resources or WebGPU device-loss recovery."
    };
    writeFileSync(resolve(REPORT_ROOT, "browser.json"), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await server.close();
  }
});

async function evidence(page: import("@playwright/test").Page): Promise<any> {
  return page.evaluate(() => structuredClone(window.__AURA3D_CONTEXT_RECOVERY_LAB__));
}

async function captureState(page: import("@playwright/test").Page, state: string, includeCanvas: boolean): Promise<{ state: string; pagePath: string; pageBytes: number; canvasPath?: string; canvasBytes?: number; canvasSha256?: string }> {
  const pagePath = resolve(REPORT_ROOT, `public-${state}-page.png`);
  await page.screenshot({ path: pagePath, fullPage: true });
  const result: { state: string; pagePath: string; pageBytes: number; canvasPath?: string; canvasBytes?: number; canvasSha256?: string } = {
    state,
    pagePath: pagePath.replace(`${process.cwd()}/`, ""),
    pageBytes: statSync(pagePath).size
  };
  if (includeCanvas) {
    const canvasPath = resolve(REPORT_ROOT, `public-${state}-canvas.png`);
    const dataUrl = await page.locator("canvas").evaluate((element) => (element as HTMLCanvasElement).toDataURL("image/png"));
    const bytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
    writeFileSync(canvasPath, bytes);
    result.canvasPath = canvasPath.replace(`${process.cwd()}/`, "");
    result.canvasBytes = bytes.byteLength;
    result.canvasSha256 = createHash("sha256").update(bytes).digest("hex");
  }
  return result;
}

function assertPublicSourceBoundary(): void {
  const source = readFileSync(resolve("examples/context-recovery-lab/main.ts"), "utf8");
  expect(source).toContain('from "@aura3d/engine"');
  expect(source).toContain("app.onDeviceLost");
  expect(source).toContain("app.onDeviceRestored");
  expect(source).toContain("app.setScene(built)");
  expect(source).toContain('getExtension("WEBGL_lose_context")');
  expect(source).not.toMatch(/from\s+["']three|@aura3d\/(?:rendering|scene)|packages\//);
}

export {};
