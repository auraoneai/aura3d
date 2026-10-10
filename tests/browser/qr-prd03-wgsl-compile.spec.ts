import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-03 Phase 7 / §8.18 exit gate — every `post/shaders/*.wgsl.ts` mirror
 * compiles standalone on a real WebGPU device:
 * `GPUShaderModule.getCompilationInfo()` reports zero `type === "error"`
 * messages per module (Chromium with WebGPU on macos-14, per CI-ROUTING).
 *
 * `tests/qr/prd03/wgsl-compile.spec.ts` per the PRD — located beside the
 * other lane-03 browser specs (the `qr-prd03-` ownership slot; the
 * `tests/browser/` dir is the de-facto lane-03 spec home).
 * WebGPU execution parity is Q-11-2 (lane 11, integrated — not gated here).
 */

interface ModuleReport {
  errors: number;
  messages: Array<{ type: string; lineNum: number; linePos: number; message: string }>;
}
interface WgslRunResult {
  ok?: boolean;
  error?: string;
  modules?: Record<string, ModuleReport>;
}

test.describe("PRD-03 Phase 7 — WGSL twins compile (getCompilationInfo)", () => {
  // Cold dev-server transform of the engine module graph can exceed the
  // global 60s budget on CI runners before the harness global registers.
  test.describe.configure({ timeout: 240_000 });
  let server: ExampleDevServer;

  test.beforeAll(async ({}, testInfo) => {
    // beforeAll hooks keep the 60s config timeout even when
    // describe.configure raises per-test budgets — extend the hook
    // itself for cold dev-server transforms on CI.
    testInfo.setTimeout(240_000);
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("all 35 post/* WGSL modules compile with zero errors", async ({ page }) => {
    await page.goto(`${server.origin}/tests/browser/qr-prd03-wgsl-harness.html`);
    // Deferred module script may still be resolving after `load` — wait for the
    // harness global before evaluating (was flaky: `run is not a function`).
    try {
      await page.waitForFunction(
      () => typeof (window as { runQrPrd03Wgsl?: unknown }).runQrPrd03Wgsl === "function",
      undefined,
      { timeout: 150_000 },
    );
    } catch {
      // Cold CI transform of the engine module graph can outrun one
      // budget; the dev server caches transpiled modules, so a reload
      // re-serves the whole graph from cache and lands the global.
      await page.reload();
      await page.waitForFunction(
      () => typeof (window as { runQrPrd03Wgsl?: unknown }).runQrPrd03Wgsl === "function",
      undefined,
      { timeout: 150_000 },
    );
    }
    const result = await page.evaluate(async () => {
      const run = (window as { runQrPrd03Wgsl?: () => Promise<WgslRunResult> }).runQrPrd03Wgsl!;
      return await run();
    });
    // P-22 requireOrSkip: on CI the runner must have a WebGPU adapter — a
    // missing adapter is a red job, not a skipped spec. Local non-CI runs may
    // still skip so contributor laptops without WebGPU aren't blocked.
    if (process.env.CI) {
      expect(result.error ?? null, "CI runner must expose a WebGPU adapter").toBeNull();
    } else {
      test.skip(result.error === "webgpu-unavailable" || result.error === "webgpu-no-adapter",
        `WebGPU unavailable in this browser (${result.error})`);
    }

    expect(result.error ?? null).toBeNull();
    const modules = result.modules!;
    expect(Object.keys(modules)).toHaveLength(35);
    for (const [name, report] of Object.entries(modules)) {
      expect(report.errors, `${name}: ${report.messages.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join("; ")}`).toBe(0);
    }
  });
});
