import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * A custom shader with a deliberate duplicate-variable error must not blank the frame: the valid mesh still renders,
 * the failure is reported with code, material, stage and the offending source line, and console.error fires once.
 * Remote only (tools/remote-acr/run.sh); never local Playwright.
 */
const LAB = "/examples/shader-failure-lab/";
type Lab = {
  ready: boolean; stepError: string; left: { lit: number; magenta: number }; right: { lit: number; magenta: number };
  errors: string[]; shaderFailures: Array<{ code: string; material: string; stage: string; mode: string; locations: Array<{ line: number; authoredLine?: number; message: string; window: Array<{ text: string; error: boolean }> }> }>;
  drawCalls: number; image: string;
};
type Win = Window & { __SHADER_LAB__?: Lab; __SHADER_LAB_ERROR__?: string };
const reportDir = "tests/reports/shader-failures";

test.describe("custom shader failures are loud and non-fatal", () => {
  test.setTimeout(600_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  async function run(page: import("@playwright/test").Page, query: string): Promise<{ lab: Lab; consoleErrors: string[] }> {
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.setViewportSize({ width: 320, height: 180 });
    await page.goto(`${server.origin}${LAB}${query}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as Win).__SHADER_LAB__?.ready) || Boolean((window as unknown as Win).__SHADER_LAB_ERROR__), undefined, { timeout: 400_000 });
    const failure = await page.evaluate(() => (window as unknown as Win).__SHADER_LAB_ERROR__);
    expect(failure, String(failure)).toBeUndefined();
    const lab = await page.evaluate(() => (window as unknown as Win).__SHADER_LAB__!);
    mkdirSync(resolve(reportDir), { recursive: true });
    writeFileSync(resolve(reportDir, `${query.replace(/[^a-z0-9]+/gi, "_") || "default"}.jpg`), Buffer.from(lab.image.split(",")[1]!, "base64"));
    const { image, ...rest } = lab;
    process.stdout.write(`@@SHADER_LAB ${query || "default"} ${JSON.stringify(rest)}\n`);
    process.stdout.write(`@@SHADER_CONSOLE ${query || "default"} ${JSON.stringify(consoleErrors.map((line) => line.slice(0, 400)))}\n`);
    return { lab, consoleErrors };
  }

  test("default (skip): the valid mesh renders, the failure is diagnosed with the offending line, console.error once", async ({ page }) => {
    const { lab, consoleErrors } = await run(page, "");
    expect(lab.stepError).toBe("");
    expect(lab.left.lit, "valid box still renders").toBeGreaterThan(200);
    expect(lab.right.lit, "failed box is skipped (nothing drawn there)").toBeLessThan(20);
    expect(lab.shaderFailures).toHaveLength(1);
    const failure = lab.shaderFailures[0]!;
    expect(failure.code).toBe("CUSTOM_SHADER_COMPILE_FAILED");
    expect(failure.stage).toBe("fragment");
    expect(failure.material.length).toBeGreaterThan(0);
    const location = failure.locations[0]!;
    expect(location.window.find((row) => row.error)?.text).toContain("DUPLICATE_DECLARATION_LINE");
    expect(location.authoredLine).toBe(4);
    expect(lab.errors.some((line) => line.startsWith("CUSTOM_SHADER_COMPILE_FAILED"))).toBe(true);
    expect(consoleErrors.filter((line) => line.includes("CUSTOM_SHADER_COMPILE_FAILED"))).toHaveLength(1);
  });

  test("magenta mode draws the failed mesh flat magenta while the valid mesh still renders", async ({ page }) => {
    const { lab } = await run(page, "?mode=magenta");
    expect(lab.left.lit).toBeGreaterThan(200);
    expect(lab.right.magenta).toBeGreaterThan(200);
    expect(lab.shaderFailures[0]?.mode).toBe("magenta");
  });

  test("strict (throw) fails the frame with the named custom-shader error (recorded in diagnostics errors)", async ({ page }) => {
    const { lab } = await run(page, "?mode=throw");
    // The production renderer submits frames asynchronously, so the strict failure is recorded as the frame's error
    // (route health reports "error") instead of rejecting app.step(); a synchronous renderer throws it to the caller.
    const strictErrors = lab.errors.filter((line) => line.startsWith("AuraRuntimeError: CUSTOM_SHADER_COMPILE_FAILED"));
    expect(strictErrors.length + (lab.stepError.includes("custom-shader-compile-failed") ? 1 : 0)).toBeGreaterThan(0);
  });

  test("control: without the broken mesh there are no failures and no console errors", async ({ page }) => {
    const { lab, consoleErrors } = await run(page, "?broken=0");
    expect(lab.shaderFailures).toHaveLength(0);
    expect(lab.errors).toEqual([]);
    expect(consoleErrors.filter((line) => line.includes("CUSTOM_SHADER"))).toHaveLength(0);
  });
});
