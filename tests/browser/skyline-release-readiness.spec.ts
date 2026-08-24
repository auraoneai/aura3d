import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const ROUTE = "/apps/showcase-skyline-runner/";
const GLOBAL = "__AURA3D_SHOWCASE_SKYLINE_RUNNER__";
const REPORT_DIR = resolve("tests/reports/skyline-release-readiness");

interface SkylineReadinessEvidence {
  readonly status: string;
  readonly platformerStateStatus: string;
  readonly player: { readonly x: number };
  readonly feel: { readonly paused: boolean };
  readonly diagnostics: {
    readonly backend: string;
    readonly fps: number;
    readonly drawCalls: number;
    readonly renderSize: readonly [number, number];
    readonly errors: readonly string[];
    readonly renderer?: {
      readonly runtime: {
        readonly backend: string;
        readonly nativeInstancedSubmissions?: number;
        readonly submittedObjects?: number;
        readonly visibleObjects?: number;
        readonly culledObjects?: number;
      };
    };
  };
}

async function waitForRoute(page: Page): Promise<SkylineReadinessEvidence> {
  await page.waitForFunction((name) => {
    const value = (window as unknown as Record<string, SkylineReadinessEvidence | undefined>)[name];
    return value?.status === "running"
      && value.diagnostics?.renderer?.runtime.backend === "production-runtime"
      && value.diagnostics.drawCalls > 0;
  }, GLOBAL, { timeout: 45_000 });
  return page.evaluate((name) =>
    (window as unknown as Record<string, SkylineReadinessEvidence>)[name]!, GLOBAL);
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

test.describe("Skyline SR-12 release readiness", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(REPORT_DIR, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("mounted production route stays within bounded runtime budgets", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) browserErrors.push(message.text());
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    const startedAt = Date.now();
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    const evidence = await waitForRoute(page);
    const readyMs = Date.now() - startedAt;
    const frameIntervals = await page.evaluate(async () => {
      const samples: number[] = [];
      let previous = performance.now();
      await new Promise<void>((resolveSample) => {
        const sample = (now: number) => {
          samples.push(now - previous);
          previous = now;
          if (samples.length >= 120) resolveSample();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      return samples.slice(5);
    });
    const resources = await page.evaluate(() => {
      const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      return {
        count: entries.length,
        transferredBytes: entries.reduce((sum, entry) => sum + entry.transferSize, 0),
        encodedBytes: entries.reduce((sum, entry) => sum + entry.encodedBodySize, 0)
      };
    });
    const p50FrameMs = percentile(frameIntervals, 0.5);
    const p95FrameMs = percentile(frameIntervals, 0.95);
    const longFrameRatio = frameIntervals.filter((value) => value > 50).length / frameIntervals.length;
    const runtime = evidence.diagnostics.renderer!.runtime;

    expect(readyMs).toBeLessThanOrEqual(45_000);
    expect(evidence.diagnostics.backend).toBe("webgl2");
    expect(evidence.diagnostics.drawCalls).toBeGreaterThan(0);
    expect(evidence.diagnostics.drawCalls).toBeLessThanOrEqual(2_000);
    expect(evidence.diagnostics.renderSize[0]).toBeGreaterThan(0);
    expect(evidence.diagnostics.renderSize[1]).toBeGreaterThan(0);
    expect(runtime.nativeInstancedSubmissions ?? 0).toBeGreaterThan(0);
    expect(runtime.submittedObjects ?? 0).toBeGreaterThan(0);
    expect(runtime.visibleObjects ?? 0).toBeGreaterThan(0);
    // A release pass requires the retained software-WebGL target itself; the
    // looser 100 ms ceiling remains diagnostic context, not acceptance.
    expect(p95FrameMs).toBeLessThanOrEqual(50);
    expect(longFrameRatio).toBeLessThanOrEqual(0.1);
    expect(evidence.diagnostics.fps).toBeGreaterThanOrEqual(10);
    expect(evidence.diagnostics.errors).toEqual([]);
    expect(browserErrors).toEqual([]);

    writeFileSync(resolve(REPORT_DIR, "performance.json"), `${JSON.stringify({
      schema: "aura3d-skyline-performance/1.0",
      generatedAt: new Date().toISOString(),
      pass: p95FrameMs <= 50 && longFrameRatio <= 0.1,
      stabilityProbePass: p95FrameMs <= 100 && evidence.diagnostics.fps >= 10,
      blockers: [
        ...(p95FrameMs > 50 ? [`software-webgl-p95-frame-ms:${p95FrameMs.toFixed(2)}>50`] : []),
        ...(longFrameRatio > 0.1 ? [`software-webgl-long-frame-ratio:${longFrameRatio.toFixed(3)}>0.1`] : [])
      ],
      budgets: {
        readyMs: 45_000,
        maxDrawCalls: 2_000,
        softwareWebglP95FrameMs: 100,
        optimizationTargetP95FrameMs: 50,
        optimizationTargetMaxLongFrameRatio: 0.1,
        minimumDiagnosticsFps: 10
      },
      measurements: {
        readyMs,
        drawCalls: evidence.diagnostics.drawCalls,
        fps: evidence.diagnostics.fps,
        p50FrameMs,
        p95FrameMs,
        longFrameRatio,
        sampleCount: frameIntervals.length,
        resources,
        runtime
      },
      browserErrors
    }, null, 2)}\n`);
  });

  test("semantic controls, focus, touch targets, status, and reduced motion are accessible", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}${ROUTE}`, { waitUntil: "domcontentloaded" });
    const before = await waitForRoute(page);
    await expect(page.locator("main[aria-label='Skyline Runner']")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1, name: "Skyline Runner" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Skyline Runner game HUD" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Runner controls" })).toBeVisible();

    const controls = page.locator(".button-grid button");
    await expect(controls).toHaveCount(7);
    const controlAudit = await controls.evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      const name = button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "";
      return { id: button.id, name, width: rect.width, height: rect.height };
    }));
    expect(controlAudit.every((control) => control.name.length > 0)).toBe(true);
    expect(new Set(controlAudit.map((control) => control.name)).size).toBe(controlAudit.length);
    expect(controlAudit.every((control) => control.width >= 44 && control.height >= 44)).toBe(true);

    const focusedIds: string[] = [];
    for (let index = 0; index < controlAudit.length; index += 1) {
      await page.keyboard.press("Tab");
      focusedIds.push(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.id ?? ""));
    }
    expect(focusedIds).toEqual(controlAudit.map((control) => control.id));

    const ghost = page.getByRole("button", { name: "Ghost" });
    await ghost.focus();
    await page.keyboard.press("Enter");
    await expect(ghost).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("KeyP");
    await expect(page.getByRole("status").filter({ hasText: "Paused" })).toBeVisible();
    const paused = await page.evaluate((name) =>
      (window as unknown as Record<string, SkylineReadinessEvidence>)[name]!, GLOBAL);
    expect(paused.feel.paused).toBe(true);
    expect(paused.player.x).toBe(before.player.x);

    const motion = await page.evaluate((name) => {
      const value = (window as unknown as Record<string, {
        motionPreferences: { reducedMotion: boolean; camera: { impulsesRemoved: boolean }; secondaryMotion: { excessiveMotionRemoved: boolean } };
      }>)[name]!;
      return value.motionPreferences;
    }, GLOBAL);
    expect(motion.reducedMotion).toBe(true);
    expect(motion.camera.impulsesRemoved).toBe(true);
    expect(motion.secondaryMotion.excessiveMotionRemoved).toBe(true);

    writeFileSync(resolve(REPORT_DIR, "accessibility.json"), `${JSON.stringify({
      schema: "aura3d-skyline-accessibility/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      viewport: { width: 390, height: 844 },
      semantics: { main: true, h1: true, complementaryHud: true, controlsRegion: true },
      controlAudit,
      focusOrder: focusedIds,
      ghostPressedState: true,
      pauseStatusAnnounced: true,
      reducedMotion: motion
    }, null, 2)}\n`);
  });
});
