import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const ORIGIN = process.env.A3D_PUBLIC_DEMO_URL ?? "https://aura3d.auraone.ai";
const ROUTE = "/apps/wow-robot-expressive-rig/";
const SCRATCH = "/var/folders/3s/trh_q1fd5yn1mdhbvwbf0qrw0000gn/T/grok-goal-d625ec9e6e37/implementer";

test("production wow-robot-expressive-rig has no console, page, or asset errors", async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const failedAssets: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) failedAssets.push(`${response.status()} ${response.url()}`);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await page.goto(`${ORIGIN}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    return canvas instanceof HTMLCanvasElement && canvas.width >= 1280 && canvas.height >= 720;
  }, undefined, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const runtime = (window as unknown as { __a3dWowRuntime?: { status?: string; frameCount?: number } }).__a3dWowRuntime;
    return runtime?.status === "ready" || runtime?.status === "running" || (runtime?.frameCount ?? 0) >= 2;
  }, undefined, { timeout: 90_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  mkdirSync(SCRATCH, { recursive: true });
  await page.screenshot({ path: join(SCRATCH, "wow-robot-expressive-rig-production.png") });
  const report = {
    origin: ORIGIN,
    url: `${ORIGIN}${ROUTE}`,
    httpStatus: response?.status() ?? null,
    consoleErrors,
    failedAssets
  };
  writeFileSync(join(SCRATCH, "wow-robot-production-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  expect(response === null || response.ok(), `HTTP ${response?.status()}`).toBe(true);
  expect(failedAssets, failedAssets.join("\n")).toEqual([]);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});
