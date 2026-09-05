import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const harnessSource = resolve(process.cwd(), "tests/browser/webgpu-post-j2-harness.ts");

test.describe("J2 native WebGPU post — bloom, color-grade, FXAA pixel proof", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("harness drives the rendering package directly (no app shortcuts)", () => {
    const source = readFileSync(harnessSource, "utf8");
    expect(source).not.toMatch(/from\s+["']three["']/);
    expect(source).not.toMatch(/from\s+["']@aura3d\/engine["']/);
    expect(source).toContain("executeWebGPUBloom");
    expect(source).toContain("executeWebGPUColorGrade");
    expect(source).toContain("executeWebGPUFxaa");
  });

  test("bloom, color-grade, and FXAA change real WebGPU pixels", async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(`${server.origin}/tests/browser/webgpu-post-j2-harness.html`, { waitUntil: "domcontentloaded" });
    await page.click("#shoot");
    await page.waitForFunction(
      () => {
        const state = window.__AURA3D_J2_WEBGPU_POST__;
        return state?.status === "ready" || state?.status === "error" || state?.status === "unsupported";
      },
      undefined,
      { timeout: 180_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_J2_WEBGPU_POST__);
    mkdirSync(resolve("tests/reports/webgpu-post-j2"), { recursive: true });
    writeFileSync(resolve("tests/reports/webgpu-post-j2/j2-result.json"), `${JSON.stringify({ ...result, pageErrors, consoleErrors }, null, 2)}\n`);
    await page.screenshot({ path: resolve("tests/reports/webgpu-post-j2/j2-capture.png") });

    expect(result?.status, result?.error ?? pageErrors.join("\n")).toBe("ready");
    expect(result?.backend).toBe("webgpu");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(result?.stages?.map((stage) => stage.id)).toEqual(["bloom", "color-grade", "fxaa"]);

    // The scene itself must read: a bright quad, mid tones, dark ground.
    expect(Number(result?.checks?.sceneBright ?? 0)).toBeGreaterThan(1000);
    const sceneMean = Number(result?.checks?.sceneMeanLuma ?? 0);
    expect(sceneMean).toBeGreaterThan(0.05);
    expect(sceneMean).toBeLessThan(0.6);

    // Bloom ADDS light: the halo lifts mean luma (LDR-clamped quad cores
    // cannot exceed 1.0, so the bright-pixel count is the wrong oracle here)
    // and thousands of halo pixels change.
    const bloomMean = Number(result?.stages?.find((stage) => stage.id === "bloom")?.meanLuma ?? 0);
    expect(bloomMean).toBeGreaterThan(sceneMean + 0.005);
    expect(Number(result?.checks?.bloomDiff ?? 0)).toBeGreaterThan(1000);

    // Color grade exposure +1 stop lifts the whole frame measurably.
    expect(Number(result?.checks?.gradeMeanLuma ?? 0)).toBeGreaterThan(sceneMean + 0.05);
    expect(Number(result?.checks?.gradeDiff ?? 0)).toBeGreaterThan(1000);

    // FXAA works edges only: some pixels change, the frame does not shift.
    expect(Number(result?.checks?.fxaaDiff ?? 0)).toBeGreaterThan(50);
    expect(Number(result?.checks?.fxaaMeanAbsDiff ?? 1)).toBeLessThan(0.05);

    // GPU validation must be silent: every post pass validated clean.
    expect(result?.postErrors ?? []).toEqual([]);

    // Native legs: balanced bloom runs 1 + 3*2 + 1 passes on the device.
    expect(result?.checks?.bloomMipCount).toBe(3);
    expect(result?.checks?.bloomHalfFloat).toBe(true);
    expect(result?.checks?.bloomPasses).toBe(8);
    expect(result?.checks?.bloomExecutionMode).toBe("webgpu-native-post");
    expect(result?.checks?.nativeBloomPasses).toBe(8);
    expect(result?.checks?.nativeColorGradePasses).toBe(1);
    expect(result?.checks?.nativeFxaaPasses).toBe(1);
  });
});

declare global {
  interface Window {
    __AURA3D_J2_WEBGPU_POST__?: {
      readonly status: "ready" | "error" | "unsupported" | "waiting";
      readonly backend?: string;
      readonly adapter?: string;
      readonly stages?: readonly {
        readonly id: string;
        readonly brightPixels: number;
        readonly meanLuma: number;
        readonly diffPixelsVsScene: number;
        readonly meanAbsDiffVsScene: number;
        readonly drawCalls: number;
      }[];
      readonly postErrors?: readonly string[];
      readonly checks?: Record<string, number | string | boolean>;
      readonly error?: string;
    };
  }
}
