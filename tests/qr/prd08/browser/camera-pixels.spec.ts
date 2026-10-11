/**
 * camera-pixels.spec.ts — guard against "evidence-only camera" regressions.
 *
 * Promote run 38151983512 (L4, NO-EFFECT): with A3D_QR_CAMERA on, the rigs
 * ran and `app.camera.presented()` moved, yet the rendered frames were
 * byte-identical to flags-off, because the presented pose never reached the
 * renderer's camera (fixed in #1202). This spec asserts the pose reaches
 * PIXELS on the static `wall` scene:
 * - the same presented pose twice gives (near-)identical frames;
 * - a clearly different presented pose gives a clearly different frame.
 * Frames are decoded in the page (createImageBitmap → 2D canvas) and
 * compared as mean absolute RGB difference in [0, 1].
 *
 * Remote-only: `qr-prd08-camera.yml` browser-gpu (macos-14).
 */
import { test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd08DevServer, type ExampleDevServer } from "../dev-server";
import { captureCanvas, openHarness, pump, pwExpect, REPORT_DIR, writeEvidence } from "./harness-page";

let server: ExampleDevServer;

test.beforeAll(async () => {
  server = await startPrd08DevServer();
});
test.afterAll(async () => {
  await server.close();
});

type Pose = { position: number[]; target: number[]; fov: number };

async function present(page: Page, pose: Pose): Promise<void> {
  await page.evaluate((p) => {
    const h = (window as unknown as { __AURA3D_PRD08_HARNESS__: { app: { camera: { setPose(p: unknown): void } } } }).__AURA3D_PRD08_HARNESS__;
    h.app.camera.setPose(p);
  }, pose);
  await pump(page, 1000 / 60, 4);
}

/** Mean absolute RGB difference of two PNGs, decoded in the page. */
async function meanAbsDiff(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([ab64, bb64]) => {
    const decode = async (b64: string) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    };
    const [x, y] = await Promise.all([decode(ab64), decode(bb64)]);
    if (x.length !== y.length) return 1;
    let sum = 0;
    for (let i = 0; i < x.length; i += 4) sum += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
    return sum / ((x.length / 4) * 3 * 255);
  }, [a.toString("base64"), b.toString("base64")] as const);
}

test("presented camera pose changes the rendered pixels", async ({ page }) => {
  await openHarness(page, server.origin, "?scripted=1&scene=wall");
  const near: Pose = { position: [0, 2, 12], target: [0, 1, 0], fov: 50 };
  const far: Pose = { position: [14, 10, -6], target: [0, 1, 0], fov: 30 };

  await present(page, near);
  await captureCanvas(page, "camera-pixels", "near-a");
  await present(page, near);
  await captureCanvas(page, "camera-pixels", "near-b");
  await present(page, far);
  await captureCanvas(page, "camera-pixels", "far");

  const read = (n: string) => readFileSync(resolve(REPORT_DIR, "camera-pixels", `${n}.png`));
  const samePose = await meanAbsDiff(page, read("near-a"), read("near-b"));
  const movedPose = await meanAbsDiff(page, read("near-a"), read("far"));
  writeEvidence("camera-pixels", "summary", { samePose, movedPose, near, far });

  pwExpect(samePose, `same pose produced different frames (mean abs diff ${samePose})`).toBeLessThan(0.01);
  // An evidence-only camera gives ~0 here; a moved camera repaints most of the frame.
  pwExpect(movedPose, `moving the presented camera did not change the pixels (mean abs diff ${movedPose})`).toBeGreaterThan(0.03);
  pwExpect(movedPose, "moved-pose diff must dominate same-pose noise").toBeGreaterThan(samePose * 5);
});
