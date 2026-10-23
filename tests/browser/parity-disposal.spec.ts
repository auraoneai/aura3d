import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * parity-disposal - threejs-parity lane L7 acceptance fixture
 * (docs/workflows/threejs-parity-gaps.md §5.7 / §6 L7-14, SR-08, task R-09).
 *
 * Remote-only. 20 load/unload cycles; `getDiagnostics()`-backed gauges
 * (approximateGpuMemoryBytes, textures, buffers, renderTargets) must stay within
 * 5% of cycle 1, both for app mount/dispose cycles and for allocate/release
 * cycles on one long-lived WebGL2 renderer.
 */

const REPORT_ROOT = resolve("tests/reports/parity-disposal");
const LAB = "/examples/parity-runtime-lab/disposal.html";
const TOLERANCE = 0.05;

interface Gauges {
  readonly approximateGpuMemoryBytes: number;
  readonly textures: number;
  readonly buffers: number;
  readonly renderTargets: number;
}

interface Evidence {
  readonly status: "boot" | "ready" | "error";
  readonly error?: string;
  readonly cycles: number;
  readonly routeCycles: readonly Gauges[];
  readonly devicePeak: readonly Gauges[];
  readonly deviceAfter: readonly Gauges[];
}

const KEYS = ["approximateGpuMemoryBytes", "textures", "buffers", "renderTargets"] as const;

function driftFromFirst(series: readonly Gauges[]): Record<(typeof KEYS)[number], number> {
  const first = series[0]!;
  const drift = {} as Record<(typeof KEYS)[number], number>;
  for (const key of KEYS) {
    const base = first[key];
    drift[key] = Math.max(
      ...series.map((g) => (base === 0 ? (g[key] === 0 ? 0 : Infinity) : Math.abs(g[key] - base) / base))
    );
  }
  return drift;
}

test.describe("parity-disposal (L7, SR-08)", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("20 load/unload cycles stay within 5% of cycle 1", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}${LAB}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const status = (window as unknown as { __AURA3D_PARITY_DISPOSAL__?: { status: string } }).__AURA3D_PARITY_DISPOSAL__?.status;
        return status === "ready" || status === "error";
      },
      undefined,
      { timeout: 840_000 }
    );
    const evidence = await page.evaluate(
      () => (window as unknown as { __AURA3D_PARITY_DISPOSAL__: Evidence }).__AURA3D_PARITY_DISPOSAL__
    );

    console.log("[parity-evidence:disposal]", JSON.stringify(evidence));
    const drift = {
      route: driftFromFirst(evidence.routeCycles),
      devicePeak: driftFromFirst(evidence.devicePeak),
      deviceAfter: driftFromFirst(evidence.deviceAfter)
    };
    writeFileSync(
      resolve(`${REPORT_ROOT}/parity-disposal.json`),
      `${JSON.stringify({ schema: "aura3d-parity-disposal/1.0", generatedAt: new Date().toISOString(), tolerance: TOLERANCE, drift, pageErrors: errors, ...evidence }, null, 2)}\n`
    );

    expect(evidence.status, evidence.error ?? "").toBe("ready");
    expect(errors).toEqual([]);
    expect(evidence.routeCycles).toHaveLength(evidence.cycles);
    expect(evidence.devicePeak).toHaveLength(evidence.cycles);
    expect(evidence.deviceAfter).toHaveLength(evidence.cycles);

    // The scene must actually hold GPU resources, or "within 5%" proves nothing.
    expect(evidence.routeCycles[0]!.approximateGpuMemoryBytes).toBeGreaterThan(0);
    expect(evidence.routeCycles[0]!.textures).toBeGreaterThan(0);
    expect(evidence.devicePeak[0]!.textures).toBeGreaterThan(0);
    expect(evidence.devicePeak[0]!.renderTargets).toBeGreaterThan(0);

    for (const [name, series] of Object.entries(drift)) {
      for (const key of KEYS) {
        expect(series[key], `${name}.${key} drifted ${(series[key] * 100).toFixed(2)}% from cycle 1`).toBeLessThanOrEqual(TOLERANCE);
      }
    }
  });
});
