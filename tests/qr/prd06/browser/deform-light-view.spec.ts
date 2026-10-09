// PRD-06 T0.14 (S2–S3) — CesiumMan clip 0 at t=0.5s rendered through the
// registered `a3d_prd06_*` depth-deform chunks into a 2048² float light-view
// target (elevation 50°, azimuth 30°): silhouette IoU vs the CPU-skinned
// reference must be ≥ 0.98, the raw `a_position` control must be < 0.8, and the
// scene-08 bind pose must round-trip ≥ 0.98 both GPU→CPU and CPU→GPU. Mask PNGs
// are written under test-results/deform-light-view/ for the evidence note.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../../../browser/example-dev-server";

declare global {
  interface Window {
    __PRD06_DEFORM_LIGHT_VIEW__?: {
      readonly status: "ready" | "error";
      readonly error?: string;
      readonly iou?: {
        readonly deformVsCpu: number;
        readonly deformVsCpuTolerant: number;
        readonly bindPoseGpuVsCpu: number;
        readonly bindPoseGpuVsCpuTolerant: number;
        readonly controlRawVsCpu: number;
        readonly animatedVsBindCpu: number;
      };
      readonly maskStats?: Record<string, { count: number; cx: number; cy: number; minX: number; minY: number; maxX: number; maxY: number }>;
      readonly stats?: { readonly joints: number; readonly vertices: number; readonly pixels: number };
      readonly masks?: Record<"deform" | "cpu" | "bindGpu" | "bindCpu" | "control", string>;
      readonly previousDelta?: { readonly maxDelta: number; readonly vertexCount: number; readonly exceeding?: number; readonly firstBad?: number };
      readonly selftestDelta?: { readonly maxDelta: number; readonly vertexCount: number };
      readonly posedDelta?: { readonly maxDelta: number; readonly vertexCount: number; readonly exceeding?: number; readonly firstBad?: number };
      readonly ndcDelta?: { readonly maxDelta: number; readonly worstVertex: number; readonly maxAbsW: number };
      readonly row3?: { readonly maxAbs: number; readonly worstVertex: number; readonly worstRow: readonly number[] };
      readonly paletteRow3?: { readonly maxAbs: number; readonly worstJoint: number; readonly worst: readonly number[]; readonly joint0: readonly number[]; readonly bindJoint0: readonly number[]; readonly tails: readonly (readonly number[])[] };
    };
  }
}

const ARTIFACT_DIR = process.env.PRD06_EVIDENCE_DIR ?? "test-results/deform-light-view";

test.describe("PRD-06 deform light view (T0.14)", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("skinned depth silhouette matches the CPU reference within IoU 0.98", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd06/browser/deform-light-view-harness.html?a3d-qr=animation`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__PRD06_DEFORM_LIGHT_VIEW__?.status === "ready" || window.__PRD06_DEFORM_LIGHT_VIEW__?.status === "error",
      undefined,
      { timeout: 60_000 }
    );
    const result = await page.evaluate(() => window.__PRD06_DEFORM_LIGHT_VIEW__);
    expect(result?.status, result?.error).toBe("ready");
    const iou = result!.iou!;

    mkdirSync(ARTIFACT_DIR, { recursive: true });
    for (const [name, dataUrl] of Object.entries(result!.masks ?? {})) {
      writeFileSync(join(ARTIFACT_DIR, `${name}.png`), Buffer.from(dataUrl.split(",")[1]!, "base64"));
    }
    writeFileSync(join(ARTIFACT_DIR, "iou.json"), JSON.stringify({ iou, stats: result!.stats, previousDelta: result!.previousDelta, selftestDelta: result!.selftestDelta }, null, 2));

    const diag = () =>
      `iou=${JSON.stringify(iou)} posed=${JSON.stringify(result!.posedDelta)} ndc=${JSON.stringify(result!.ndcDelta)} row3=${JSON.stringify(result!.row3)} pal=${JSON.stringify(result!.paletteRow3)} selftest=${JSON.stringify(result!.selftestDelta)} prev=${JSON.stringify(result!.previousDelta)} stats=${JSON.stringify(result!.stats)} masks=${JSON.stringify(result!.maskStats)}`;
    // Numeric ground truth first: the deform path's per-vertex positions must
    // match the CPU deform within 1e-3 — if this holds while silhouette IoU
    // fails, the IoU delta is rasterization noise, not a deform bug.
    expect(result!.selftestDelta!.maxDelta, diag()).toBeLessThanOrEqual(1e-3);
    // The bind-palette selftest is vacuous for ordering (identity matrices
    // read the same however texels land) — the POSED deform must also match
    // the CPU skinned positions component-wise before silhouettes are judged.
    expect(result!.posedDelta!.maxDelta, diag()).toBeLessThanOrEqual(1e-3);
    // The deformed path must land on the CPU-skinned silhouette. The strict
    // (unsmoothed) IoU is the §17.0/S3 gate; the 2px-tolerant variant stays in
    // the diagnostic dump to separate rasterization noise from deform bugs.
    expect(iou.deformVsCpu, diag()).toBeGreaterThanOrEqual(0.98);
    // Scene-08 bind pose resolves §2: the depth path must also reproduce it
    // exactly (GPU bind palette vs CPU-skinned bind pose).
    expect(iou.bindPoseGpuVsCpu, diag()).toBeGreaterThanOrEqual(0.98);
    // Control: today's raw a_position capture is the failing baseline.
    expect(iou.controlRawVsCpu).toBeLessThan(0.8);
    // The pose at t=0.5s must actually move the silhouette vs bind pose.
    expect(iou.animatedVsBindCpu).toBeLessThan(0.8);
    // T2.5 §8.5 — `a3dDeformPrevious` transform-feedback numerics vs the CPU
    // previous-frame deform (bind pose standing in for frame N-1): ≤ 1e-3.
    expect(result!.previousDelta!.maxDelta).toBeLessThanOrEqual(1e-3);
  });

  test("a 191-joint rig renders through the bone-texture chunk (T1.12)", async ({ page }) => {
    await page.goto(`${server.origin}/tests/qr/prd06/browser/deform-light-view-harness.html?a3d-qr=animation&rig=synthetic-191`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__PRD06_DEFORM_LIGHT_VIEW__?.status === "ready" || window.__PRD06_DEFORM_LIGHT_VIEW__?.status === "error",
      undefined,
      { timeout: 60_000 }
    );
    const result = await page.evaluate(() => window.__PRD06_DEFORM_LIGHT_VIEW__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result!.stats!.joints).toBe(191);

    mkdirSync(ARTIFACT_DIR, { recursive: true });
    for (const [name, dataUrl] of Object.entries(result!.masks ?? {})) {
      writeFileSync(join(ARTIFACT_DIR, `synthetic-191-${name}.png`), Buffer.from(dataUrl.split(",")[1]!, "base64"));
    }

    const iou = result!.iou!;
    const diag191 = () =>
      `iou=${JSON.stringify(iou)} posed=${JSON.stringify(result!.posedDelta)} ndc=${JSON.stringify(result!.ndcDelta)} row3=${JSON.stringify(result!.row3)} pal=${JSON.stringify(result!.paletteRow3)} selftest=${JSON.stringify(result!.selftestDelta)} prev=${JSON.stringify(result!.previousDelta)} masks=${JSON.stringify(result!.maskStats)}`;
    expect(result!.selftestDelta!.maxDelta, diag191()).toBeLessThanOrEqual(1e-3);
    expect(result!.posedDelta!.maxDelta, diag191()).toBeLessThanOrEqual(1e-3);
    expect(iou.deformVsCpu, diag191()).toBeGreaterThanOrEqual(0.98);
    expect(iou.bindPoseGpuVsCpu, diag191()).toBeGreaterThanOrEqual(0.98);
    expect(iou.controlRawVsCpu).toBeLessThan(0.8);
    expect(iou.animatedVsBindCpu).toBeLessThan(0.8);
    expect(result!.previousDelta!.maxDelta).toBeLessThanOrEqual(1e-3);
  });
});
