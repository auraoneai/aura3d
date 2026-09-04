/**
 * J1 governor 60fps-hold browser proof (PART J open box).
 *
 * The harness steps the real `createPerformanceGovernor` with real
 * requestAnimationFrame wall-clock telemetry and applies every knob back to
 * the same rendered frame. This spec asserts measurement integrity (real
 * wall-clock, real pixels, degrade order) and then the hold itself:
 * - verdict `holds-60fps-after-degrade` / `holds-60fps-no-degrade-needed` pass;
 * - verdict `blocked-fully-degraded-below-60fps` fails CLOSED with the numbers
 *   (that failure IS the honest BLOCKED report, not a reason to weaken this).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface GovernorHoldRung {
  readonly settings: { readonly resolutionScale: number; readonly lodBias: number; readonly particleScale: number; readonly shadowSize: number };
  readonly degraded: readonly string[];
  readonly windowFps: number;
  readonly windowFrameMs: number;
  readonly draws: number;
  readonly drawnInstances: number;
  readonly shadowMounted: boolean;
}

interface GovernorHoldReport {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly wallClock: { readonly rafFrames: number; readonly totalMs: number };
  readonly rampInstances: number;
  readonly rampWindowFps: number;
  readonly nonBlackPixels: number;
  readonly realWebGL2: boolean;
  readonly shadowMounted: boolean;
  readonly degraded: readonly string[];
  readonly orderValid: boolean;
  readonly rungs: readonly GovernorHoldRung[];
  readonly verdict: string;
  readonly finalFps: number;
}

test.describe("J1 governor 60fps hold (browser wall-clock)", () => {
  test.setTimeout(180_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("governor degrades in order on real wall-clock frames and holds 60fps", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${server.origin}/tests/browser/game-performance-governor-hold.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const report = (window as unknown as { __a3dGovernorHold?: { status?: string } }).__a3dGovernorHold;
        return report?.status === "ready" || report?.status === "error";
      },
      undefined,
      { timeout: 150_000 }
    );
    const report = (await page.evaluate(() => (window as unknown as { __a3dGovernorHold: GovernorHoldReport }).__a3dGovernorHold));

    mkdirSync(resolve("tests/reports/game-performance-governor"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/game-performance-governor/browser-hold.json"),
      `${JSON.stringify({ schema: "a3d-game-performance-governor-browser-hold", generatedAt: new Date().toISOString(), pass: report.verdict.startsWith("holds-60fps"), report }, null, 2)}\n`
    );

    // Measurement integrity first: real wall-clock, real backend, real pixels.
    expect(report.status, `${report.error ?? ""}\n${errors.join("\n")}`).toBe("ready");
    expect(report.realWebGL2).toBe(true);
    expect(report.wallClock.rafFrames).toBeGreaterThan(30);
    expect(report.nonBlackPixels).toBeGreaterThan(1000);
    // Degrade order holds on the observed wall-clock run (when it degraded).
    expect(report.orderValid).toBe(true);
    if (report.degraded.length > 0) {
      expect(report.degraded[0]).toBe("resolutionScale");
    }

    // The hold itself: fails closed with numbers when fully-degraded hardware
    // still cannot sustain the side-view budget floor (55fps sustained).
    expect(
      report.verdict,
      `BLOCKED: governor fully degraded but wall-clock fps ${report.finalFps} < 55 ` +
        `(ramp ${report.rampInstances} instances at ${report.rampWindowFps}fps; ` +
        `degraded=[${report.degraded.join(",")}]; shadowMounted=${report.shadowMounted}). ` +
        `See tests/reports/game-performance-governor/browser-hold.json`
    ).toMatch(/^holds-60fps/);
  });
});
