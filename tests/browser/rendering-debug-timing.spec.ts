import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __GALILEO3D_POSTPROCESS_LAB__?: {
      readonly status: "ready" | "error";
      readonly renderer: "mock-rendergraph-2d";
      readonly visualClaim: string;
      readonly graphOrder?: readonly string[];
      readonly passCostsMs?: Record<string, number>;
      readonly timing?: {
        readonly gpuTimingSupported: boolean;
        readonly cpuFallbackActive: boolean;
        readonly sampleCount: number;
        readonly unavailableReason?: string;
        readonly samples: readonly {
          readonly label: string;
          readonly durationMs: number;
          readonly cpuDurationMs: number;
          readonly gpuDurationMs?: number;
          readonly source: "gpu" | "cpu-fallback";
          readonly fallbackReason?: string;
        }[];
      };
      readonly debugOverlay?: {
        readonly visible: boolean;
        readonly issueCount: number;
        readonly renderPassErrors: number;
        readonly shaderErrors: number;
        readonly lines: readonly string[];
      };
      readonly diagnostics?: { readonly lastError: string | null };
      readonly error?: string;
    };
  }
}

test.describe("renderer debug overlay and timing evidence", () => {
  let server: ExampleDevServer;
  const report: RendererDebugTimingReport = {
    ok: false,
    generatedAt: new Date().toISOString(),
    command: "pnpm exec playwright test tests/browser/rendering-debug-timing.spec.ts",
    run: {
      id: `foundation-rendering-debug-timing-${Date.now()}`,
      agent: "renderer-debug-timing",
      startedAt: new Date().toISOString(),
      command: "pnpm exec playwright test tests/browser/rendering-debug-timing.spec.ts"
    },
    validations: [],
    completedTaskEvidence: [
      {
        task: "Implement render-pass and shader error overlays for developer debugging",
        evidence: [
          "packages/rendering/src/RendererDebugOverlay.ts",
          "examples/postprocess-lab/main.ts",
          "tests/unit/rendering/renderer-debug-overlay.test.ts",
          "tests/browser/rendering-debug-timing.spec.ts",
          "tests/reports/foundation-rendering-debug-timing.json"
        ]
      },
      {
        task: "Implement GPU timing where available with fallback CPU timing",
        evidence: [
          "packages/rendering/src/RendererTiming.ts",
          "examples/postprocess-lab/main.ts",
          "tests/unit/rendering/renderer-timing.test.ts",
          "tests/browser/rendering-debug-timing.spec.ts",
          "tests/reports/foundation-rendering-debug-timing.json"
        ]
      }
    ],
    blockers: []
  };

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    report.ok = report.validations.every((validation) => validation.ok);
    report.generatedAt = new Date().toISOString();
    report.run.finishedAt = report.generatedAt;
    const reportPath = resolve("tests/reports/foundation-rendering-debug-timing.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  test("postprocess lab publishes render-pass/shader overlay and CPU timing fallback", async ({ page }) => {
    await page.goto(`${server.origin}/examples/postprocess-lab/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_POSTPROCESS_LAB__?.status === "ready" || window.__GALILEO3D_POSTPROCESS_LAB__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );
    const result = await page.evaluate(() => window.__GALILEO3D_POSTPROCESS_LAB__);
    const passCostKeys = Object.keys(result?.passCostsMs ?? {}).sort();
    const overlayLines = result?.debugOverlay?.lines.join("\n") ?? "";
    const timingLabels = result?.timing?.samples.map((sample) => sample.label).sort() ?? [];

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2-real-scene-postprocess");
    expect(result?.realScene?.source).toBe("v4-product-gltf-webgl2-readback");
    expect(result?.realScene?.drawCalls ?? 0).toBeGreaterThanOrEqual(1);
    expect(result?.diagnostics?.lastError).toBeNull();
    expect(result?.debugOverlay).toMatchObject({
      visible: true,
      issueCount: 2,
      renderPassErrors: 1,
      shaderErrors: 1
    });
    expect(overlayLines).toContain("postprocess-debug-invalid-shader");
    expect(overlayLines).toContain("postprocess-debug-pass");
    expect(overlayLines).toContain("SHADER_MARKER_MISSING");
    expect(result?.timing).toMatchObject({
      gpuTimingSupported: false,
      cpuFallbackActive: true,
      sampleCount: passCostKeys.length
    });
    expect(result?.timing?.unavailableReason).toContain("using CPU timing fallback");
    expect(timingLabels).toEqual(passCostKeys);
    expect(result?.timing?.samples.every((sample) => sample.source === "cpu-fallback" && sample.cpuDurationMs >= 0 && sample.durationMs >= 0)).toBe(true);

    const checks = {
      renderPassOverlayVisible: result?.debugOverlay?.renderPassErrors === 1 && overlayLines.includes("postprocess-debug-pass"),
      shaderOverlayVisible: result?.debugOverlay?.shaderErrors === 1 && overlayLines.includes("SHADER_MARKER_MISSING"),
      timingSamplesMatchRenderPasses: timingLabels.length > 0 && timingLabels.join("|") === passCostKeys.join("|"),
      cpuFallbackVisible: result?.timing?.cpuFallbackActive === true && result.timing.samples.every((sample) => sample.source === "cpu-fallback")
    };
    report.validations.push({
      name: "postprocess-debug-overlay-and-timing",
      ok: Object.values(checks).every(Boolean),
      metrics: {
        graphPasses: result?.graphOrder?.length ?? 0,
        passCostsReported: passCostKeys.length,
        timingSamples: result?.timing?.sampleCount ?? 0,
        overlayIssues: result?.debugOverlay?.issueCount ?? 0,
        renderPassErrors: result?.debugOverlay?.renderPassErrors ?? 0,
        shaderErrors: result?.debugOverlay?.shaderErrors ?? 0
      },
      checks
    });
    expect(checks).toEqual({
      renderPassOverlayVisible: true,
      shaderOverlayVisible: true,
      timingSamplesMatchRenderPasses: true,
      cpuFallbackVisible: true
    });
  });
});

interface RendererDebugTimingReport {
  ok: boolean;
  generatedAt: string;
  command: string;
  run: {
    readonly id: string;
    readonly agent: string;
    readonly startedAt: string;
    readonly command: string;
    finishedAt?: string;
  };
  validations: RendererDebugTimingValidation[];
  completedTaskEvidence: Array<{ readonly task: string; readonly evidence: readonly string[] }>;
  blockers: readonly string[];
}

interface RendererDebugTimingValidation {
  readonly name: string;
  readonly ok: boolean;
  readonly metrics: Record<string, number>;
  readonly checks: Record<string, boolean>;
}
