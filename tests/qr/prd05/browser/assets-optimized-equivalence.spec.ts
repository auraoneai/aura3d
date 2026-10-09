/**
 * PRD-05 §16.1 S6 — optimized-vs-source equivalence (rows 02/03/08/09/15/18).
 *
 * For each `prd05-optimized-*` lane scene the spec captures four frames:
 *   aura3d × (optimized | source), three × (optimized | source)
 * `variant=source` resolves every model at the optimizer's input corpus GLB on
 * the SAME scene spec, so masked SSIM / silhouette IoU isolate the §6.3
 * pipeline's effect (meshopt + quantization + KTX2) within each engine.
 *
 * Gates (per the row table):
 *   (a)/(b) masked SSIM opt-vs-src ≥ 0.97 per engine (≥ 0.95 on 09-outdoor —
 *     ETC1S is lossier than UASTC)
 *   silhouette IoU ≥ 0.98 on the skinned rows (08-skinned, 15-animation)
 * (c) vision ×2 score-drop is judged offline on these captured frames.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd05DevServer, type ExampleDevServer } from "../dev-server";
import { maskedSsim, subjectMask } from "../../../../benchmarks/quality-rebuild/scenes/prd04/metrics";
import { maskIoU } from "../../prd01/metrics/maskIoU";

interface Frame {
  readonly width: number;
  readonly height: number;
  readonly pixels: number[];
}

const capture = (scene: string, engine: "aura3d" | "three", variant: "optimized" | "source") =>
  `/tests/qr/prd05/harness/prd05-capture.html?engine=${engine}&scene=${scene}&flags=assets&variant=${variant}`;

/** Screenshot the stage canvas and decode it to RGBA inside the page — engine-
 * independent pixel capture that needs no preserveDrawingBuffer. */
async function captureFrame(page: Page, url: string): Promise<Frame> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => (window as { __QR_READY__?: unknown; __QR_ERROR__?: unknown }).__QR_READY__ !== undefined
      || (window as { __QR_READY__?: unknown; __QR_ERROR__?: unknown }).__QR_ERROR__ !== undefined,
    undefined,
    { timeout: 180_000 }
  );
  const error = await page.evaluate(() => (window as { __QR_ERROR__?: string }).__QR_ERROR__ ?? null);
  expect(error, `harness error on ${url}: ${error ?? ""}`).toBeNull();
  const shot = await page.locator("canvas").first().screenshot();
  return page.evaluate(async (b64: string) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    return { width: c.width, height: c.height, pixels: Array.from(data) };
  }, shot.toString("base64"));
}

const unionMask = (a: Frame, b: Frame): Uint8Array => {
  const ma = subjectMask(a.pixels);
  const mb = subjectMask(b.pixels);
  const mask = new Uint8Array(ma.length);
  for (let i = 0; i < mask.length; i += 1) mask[i] = ma[i]! | mb[i]!;
  return mask;
};

const asImage = (f: Frame) => ({ data: new Uint8ClampedArray(f.pixels), width: f.width, height: f.height });

const ROWS = [
  { scene: "prd05-optimized-damaged-helmet", rows: "03", ssim: 0.97, iou: null as number | null, background: [0x20, 0x23, 0x27] as const },
  { scene: "prd05-optimized-pbr-product", rows: "02", ssim: 0.97, iou: null as number | null, background: [0x26, 0x29, 0x2d] as const },
  { scene: "prd05-optimized-skinned", rows: "08/15", ssim: 0.97, iou: 0.98, background: [0x23, 0x26, 0x2a] as const },
  { scene: "prd05-optimized-outdoor", rows: "09", ssim: 0.95, iou: null as number | null, background: [0x2b, 0x2e, 0x33] as const },
  { scene: "prd05-optimized-game-scene", rows: "18", ssim: 0.97, iou: null as number | null, background: [0x1d, 0x21, 0x26] as const }
];

test.describe("PRD-05 S6 optimized-vs-source equivalence", () => {
  let server: ExampleDevServer;
  const records: Record<string, unknown>[] = [];

  test.beforeAll(async () => {
    server = await startPrd05DevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve("tests/reports/prd05"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd05/optimized-equivalence.json"),
      `${JSON.stringify({ probe: "s6-optimized-equivalence", records }, null, 2)}\n`
    );
    await server.close();
  });

  for (const row of ROWS) {
    test(`${row.scene} (§16.1 row ${row.rows})`, async ({ page }) => {
      const auraOpt = await captureFrame(page, `${server.origin}${capture(row.scene, "aura3d", "optimized")}`);
      const auraSrc = await captureFrame(page, `${server.origin}${capture(row.scene, "aura3d", "source")}`);
      const threeOpt = await captureFrame(page, `${server.origin}${capture(row.scene, "three", "optimized")}`);
      const threeSrc = await captureFrame(page, `${server.origin}${capture(row.scene, "three", "source")}`);

      const auraMask = unionMask(auraOpt, auraSrc);
      const threeMask = unionMask(threeOpt, threeSrc);
      const auraSsim = maskedSsim(auraOpt.pixels, auraSrc.pixels, auraOpt.width, auraOpt.height, auraMask);
      const threeSsim = maskedSsim(threeOpt.pixels, threeSrc.pixels, threeOpt.width, threeOpt.height, threeMask);

      const record: Record<string, unknown> = { scene: row.scene, rows: row.rows, auraSsim, threeSsim };
      if (row.iou !== null) {
        record.auraIoU = maskIoU(asImage(auraOpt), asImage(auraSrc), { background: row.background }).iou;
        record.threeIoU = maskIoU(asImage(threeOpt), asImage(threeSrc), { background: row.background }).iou;
      }
      records.push(record);

      expect(auraSsim, `(b) Aura opt-vs-src masked SSIM`).toBeGreaterThanOrEqual(row.ssim);
      expect(threeSsim, `(a) three opt-vs-src masked SSIM`).toBeGreaterThanOrEqual(row.ssim);
      if (row.iou !== null) {
        expect(record.auraIoU as number, "Aura silhouette IoU").toBeGreaterThanOrEqual(row.iou);
        expect(record.threeIoU as number, "three silhouette IoU").toBeGreaterThanOrEqual(row.iou);
      }
    });
  }
});
