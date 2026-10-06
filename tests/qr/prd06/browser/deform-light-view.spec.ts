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
        readonly bindPoseGpuVsCpu: number;
        readonly controlRawVsCpu: number;
        readonly animatedVsBindCpu: number;
      };
      readonly stats?: { readonly joints: number; readonly vertices: number };
      readonly masks?: Record<"deform" | "cpu" | "bindGpu" | "bindCpu" | "control", string>;
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
    writeFileSync(join(ARTIFACT_DIR, "iou.json"), JSON.stringify({ iou, stats: result!.stats }, null, 2));

    // The deformed path must land on the CPU-skinned silhouette.
    expect(iou.deformVsCpu).toBeGreaterThanOrEqual(0.98);
    // Scene-08 bind pose resolves §2: the depth path must also reproduce it
    // exactly (GPU bind palette vs CPU-skinned bind pose).
    expect(iou.bindPoseGpuVsCpu).toBeGreaterThanOrEqual(0.98);
    // Control: today's raw a_position capture is the failing baseline.
    expect(iou.controlRawVsCpu).toBeLessThan(0.8);
    // The pose at t=0.5s must actually move the silhouette vs bind pose.
    expect(iou.animatedVsBindCpu).toBeLessThan(0.8);
  });
});
