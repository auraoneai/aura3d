import type { Browser, Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";
import { emitFile, engineVersion, gitSha, logMetrics, receiptRenderer, sha256, writeReceipt, type ReceiptFrame } from "../receipts-lib";
import type { Gu47Comparison, Gu47Frame, Gu47PostVariant, Rect } from "./post-receipts";

/**
 * Node-side helpers for the GU47 E-C post receipts (PRD WP-3). Remote runner
 * only (`tools/remote-acr/run.sh`, software WebGL2): every PNG and receipt is
 * also mirrored to stdout for `tools/receipts/extract-from-acr-log.mjs`.
 */

const HARNESS = "/tests/browser/gu47/post-receipts.html";

interface HarnessWindow {
  __GU47_POST_RECEIPTS__?: {
    render(id: Gu47PostVariant): Promise<Gu47Frame>;
    compare(a: string, b: string, rect?: Rect): Gu47Comparison;
  };
}

export interface PostReceiptSession {
  readonly page: Page;
  readonly renderer: string;
  readonly consoleProblems: string[];
  render(id: Gu47PostVariant): Promise<Gu47Frame>;
  compare(a: Gu47PostVariant, b: Gu47PostVariant, rect?: Rect): Promise<Gu47Comparison>;
  save(capability: string, frame: Gu47Frame): ReceiptFrame;
  write(capability: string, sceneText: string, frames: readonly ReceiptFrame[], tests: readonly string[], checks: Readonly<Record<string, number | boolean | string>>): void;
  close(): Promise<void>;
}

export async function openPostReceipts(browser: Browser): Promise<PostReceiptSession> {
  const server: ExampleDevServer = await startExampleDevServer();
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const consoleProblems: string[] = [];
  page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") consoleProblems.push(`console.error: ${message.text()}`); });
  await page.goto(`${server.origin}${HARNESS}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as HarnessWindow).__GU47_POST_RECEIPTS__), undefined, { timeout: 60_000 });
  const rawRenderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return String(gl?.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : 0x1f01) ?? "unknown");
  });
  return {
    page,
    renderer: receiptRenderer(rawRenderer),
    consoleProblems,
    render: (id) => page.evaluate((variant) => (window as unknown as HarnessWindow).__GU47_POST_RECEIPTS__!.render(variant), id),
    compare: (a, b, rect) => page.evaluate(([first, second, region]) =>
      (window as unknown as HarnessWindow).__GU47_POST_RECEIPTS__!.compare(first!, second!, region as Rect | undefined), [a, b, rect] as const),
    save(capability, frame) {
      const bytes = Buffer.from(frame.pngBase64, "base64");
      const file = `evidence/receipts/${capability}/${frame.key}.png`;
      emitFile(file, bytes);
      logMetrics(`${capability}:${frame.key}`, { meanRgb: frame.meanRgb, meanLuma: frame.meanLuma, stagesRan: frame.stagesRan, skipped: frame.skipped });
      return { file, sha256: sha256(bytes), meanLuma: frame.meanLuma, nonBlackRatio: frame.nonBlackRatio, label: frame.key };
    },
    write(capability, sceneText, frames, tests, checks) {
      writeReceipt({ capability, version: engineVersion(), gitSha: gitSha(), renderer: receiptRenderer(rawRenderer), scene: sceneText, frames, tests, date: new Date().toISOString(), checks });
    },
    async close() {
      await page.close();
      await server.close();
    }
  };
}

export const HARNESS_SCENE = "tests/browser/gu47/post-receipts.ts body(): grey floor (glossy for SSR), emissive white wall (left), warm emissive lamp sphere (right), grey crate (runtime id mover), one shadow-casting sun, camera (0, 2.2, 5.2) -> (0, 0.8, 0), 480x270";

/** Normalised rectangles (x0, y0, x1, y1; y down) of the harness body at 480x270. */
export const REGIONS = {
  lamp: [0.62, 0.22, 0.86, 0.52],
  wall: [0.14, 0.12, 0.36, 0.6],
  floorUnderCrate: [0.36, 0.72, 0.64, 0.98]
} as const satisfies Record<string, Rect>;
