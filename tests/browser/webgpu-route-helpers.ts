import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";

export const WEBGPU_ROOT_ROUTES = [
  "/apps/wow-webgpu-triangle/",
  "/apps/wow-webgpu-render-target/",
  "/apps/wow-webgpu-pbr-asset/",
  "/apps/wow-webgpu-product-viewer/",
  "/apps/wow-webgpu-instancing/",
  "/apps/wow-webgpu-compute-particles/"
] as const;

export async function expectWebGPURouteSettles(page: Page, origin: string, path: string, testInfo: TestInfo): Promise<void> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  const runtime = await page.waitForFunction(() => {
    const value = (window as unknown as { __a3dWowRuntime?: { status: string } }).__a3dWowRuntime;
    if (!value) return undefined;
    if (["ready", "running", "unsupported", "error"].includes(value.status)) return value;
    return undefined;
  }, undefined, { timeout: 90_000 }).then((handle) => handle.jsonValue() as Promise<{
    status: string;
    backend: string;
    selectedBackend: string;
    adapterName: string;
    drawCalls: number;
    frameCount: number;
    unsupportedReason?: string;
    capabilities?: readonly string[];
    fields?: Record<string, string | number | boolean>;
  }>);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(runtime.status).not.toBe("error");

  if (runtime.status === "unsupported") {
    expect(runtime.unsupportedReason ?? "").toMatch(/webgpu|navigator\.gpu|adapter|device|unsupported/i);
    return;
  }

  expect(runtime.backend).toBe("a3d-webgpu");
  expect(runtime.selectedBackend).toBe("webgpu");
  expect(runtime.adapterName).toBeTruthy();
  expect(runtime.drawCalls).toBeGreaterThan(0);
  expect(runtime.frameCount).toBeGreaterThan(0);

  const canvas = page.locator("canvas#viewport");
  await expect(canvas).toBeVisible();
  const screenshotDir = resolve("tests/reports/webgpu-route-screenshots");
  mkdirSync(screenshotDir, { recursive: true });
  await canvas.screenshot({ path: resolve(screenshotDir, `${path.replaceAll("/", "-").replace(/^-|-$/g, "")}-${testInfo.project.name}.png`) });
}
