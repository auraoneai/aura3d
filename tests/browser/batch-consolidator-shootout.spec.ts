import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PART D1 same-scene shootout (muse3jsparity-PRD): the batch consolidator
 * ties/beats `three.BatchedMesh` on draws + memory over the same 360-box
 * scene. Two honest levels: (1) rendered draws — the mounted Aura scene
 * submits 1 native-instanced draw vs 1 multidraw `BatchedMesh` call (tie);
 * (2) consolidator planning — 6 chunk-draws under the 64-instances/device
 * uniform policy (360 = 5x64 + 40) vs 360 naive draws, with fewer uploaded
 * bytes than `BatchedMesh`. Memory note: the engines upload structurally
 * different unit boxes (Aura position-only cube vs three
 * position/normal/uv box), so the memory gate is aura-bytes <= three-bytes
 * (measured 2.5% lower) plus an exact tie on per-instance matrix bytes.
 */

const REPORT_PATH = "tests/reports/batch-consolidator-shootout.json";
const ARTIFACTS = {
  aura: "tests/reports/batch-consolidator-shootout/aura.png",
  three: "tests/reports/batch-consolidator-shootout/three.png",
} as const;

interface ShootoutResult {
  readonly status: "ready" | "error" | "waiting";
  readonly threeRevision?: string;
  readonly instanceCount?: number;
  readonly aura?: {
    readonly consolidatedDraws: number;
    readonly drawsSaved: number;
    readonly naiveBytes: number;
    readonly consolidatedBytes: number;
    readonly sharedBytes: number;
    readonly instanceTransformBytes: number;
    readonly mountedDrawCalls: number;
    readonly pixels: { readonly nonDarkPixels: number; readonly foregroundPixels: number; readonly checksum: number };
  };
  readonly three?: {
    readonly multiDraw: boolean;
    readonly batchedCalls: number;
    readonly batchedTriangles: number;
    readonly naiveCalls: number;
    readonly naiveTriangles: number;
    readonly geometryBytes: number;
    readonly instanceMatrixBytes: number;
    readonly totalBytes: number;
    readonly pixels: { readonly nonDarkPixels: number; readonly foregroundPixels: number; readonly checksum: number };
  };
  readonly error?: string;
}

test.describe("batch consolidator shootout vs three.BatchedMesh (PART D1)", () => {
  test.setTimeout(180_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("ties/beats BatchedMesh on draws + memory over the same 360-box scene", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${server.origin}/tests/browser/batch-consolidator-shootout-harness.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () =>
        window.__AURA3D_BATCH_SHOOTOUT__?.status === "ready" ||
        window.__AURA3D_BATCH_SHOOTOUT__?.status === "error",
      undefined,
      { timeout: 120_000 }
    );

    const result = (await page.evaluate(() => window.__AURA3D_BATCH_SHOOTOUT__)) as ShootoutResult;
    mkdirSync(resolve("tests/reports/batch-consolidator-shootout"), { recursive: true });
    writeFileSync(resolve(REPORT_PATH), `${JSON.stringify({ ...result, pageErrors }, null, 2)}\n`);
    await page.locator("#aura").screenshot({ path: resolve(ARTIFACTS.aura) });
    await page.locator("#three").screenshot({ path: resolve(ARTIFACTS.three) });

    expect(result.status, result.error).toBe("ready");
    if (result.status !== "ready" || !result.aura || !result.three) return;
    expect(pageErrors).toEqual([]);
    expect(result.threeRevision).toBe("185");
    expect(result.instanceCount).toBe(360);

    // Rendered draws: mounted Aura scene ties/beats the BatchedMesh call
    // count. The 1-call tie holds when the WEBGL_multi_draw path is active
    // (recorded); without it BatchedMesh falls back to per-batch calls and
    // the mounted scene still wins.
    expect(result.aura.mountedDrawCalls).toBeLessThanOrEqual(result.three.batchedCalls);
    if (result.three.multiDraw) expect(result.three.batchedCalls).toBe(1);
    // Consolidator planning: 6 chunk-draws under the 64/device policy
    // (360 = 5x64 + 40) vs 360 naive draws on both sides.
    expect(result.aura.consolidatedDraws).toBe(6);
    expect(result.aura.drawsSaved).toBe(354);
    expect(result.three.naiveCalls).toBe(360);
    expect(result.three.naiveTriangles).toBe(360 * 12);
    expect(result.three.batchedTriangles).toBe(360 * 12);
    expect(result.aura.consolidatedDraws).toBeLessThan(result.three.naiveCalls);

    // Memory: single geometry upload + one mat4 per instance on both sides.
    // Per-instance batching bytes tie exactly; Aura uploads fewer total bytes.
    expect(result.aura.instanceTransformBytes).toBe(result.three.instanceMatrixBytes);
    expect(result.aura.instanceTransformBytes).toBe(360 * 16 * 4);
    expect(result.aura.consolidatedBytes).toBeLessThanOrEqual(result.three.totalBytes);
    const memoryRatio = result.aura.consolidatedBytes / result.three.totalBytes;
    expect(memoryRatio).toBeGreaterThan(0.9);
    expect(result.aura.consolidatedBytes).toBeLessThan(result.aura.naiveBytes);

    // Both sides actually render the scene.
    expect(result.aura.pixels.foregroundPixels).toBeGreaterThan(50000);
    expect(result.three.pixels.foregroundPixels).toBeGreaterThan(50000);
    expect(result.aura.mountedDrawCalls).toBeGreaterThan(0);
  });
});
