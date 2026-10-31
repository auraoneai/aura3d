import type { Browser, Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";
import { emitFile, engineVersion, gitSha, logMetrics, receiptRenderer, sha256, writeReceipt, type ReceiptFrame } from "../receipts-lib";
import type { Gu47FogAmount, Gu47RegionStats, Gu47WorldComparison, Gu47WorldFrame, Gu47WorldVariant, Rect } from "./world-receipts";

/**
 * Node-side helpers for the GU47 E-G receipts `sky`, `height-fog` and `water`
 * (PRD WP-7). Remote runner only (`tools/remote-acr/run.sh`, software WebGL2):
 * every PNG and receipt is mirrored to stdout for
 * `tools/receipts/extract-from-acr-log.mjs`.
 */

const HARNESS = "/tests/browser/gu47/world-receipts.html";

interface HarnessWindow {
  __GU47_WORLD_RECEIPTS__?: {
    render(id: Gu47WorldVariant): Promise<Gu47WorldFrame>;
    compare(a: string, b: string, rect?: Rect): Gu47WorldComparison;
    stats(key: string, rect: Rect): Gu47RegionStats;
    fogAmount(off: string, fogged: string, solid: string, rect: Rect): Gu47FogAmount;
  };
}

export interface WorldReceiptSession {
  readonly consoleProblems: string[];
  /** console.warn lines (engine degradations such as a failed water program). */
  readonly consoleWarnings: string[];
  render(id: Gu47WorldVariant): Promise<Gu47WorldFrame>;
  compare(a: Gu47WorldVariant, b: Gu47WorldVariant, rect?: Rect): Promise<Gu47WorldComparison>;
  stats(key: Gu47WorldVariant, rect: Rect): Promise<Gu47RegionStats>;
  fogAmount(off: Gu47WorldVariant, fogged: Gu47WorldVariant, solid: Gu47WorldVariant, rect: Rect): Promise<Gu47FogAmount>;
  save(capability: string, frame: Gu47WorldFrame): ReceiptFrame;
  write(capability: string, sceneText: string, frames: readonly ReceiptFrame[], tests: readonly string[], checks: Readonly<Record<string, number | boolean | string>>): void;
  close(): Promise<void>;
}

export async function openWorldReceipts(browser: Browser): Promise<WorldReceiptSession> {
  const server: ExampleDevServer = await startExampleDevServer();
  const page: Page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const consoleProblems: string[] = [];
  const consoleWarnings: string[] = [];
  page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") consoleProblems.push(`console.error: ${message.text()}`); if (message.type() === "warning") consoleWarnings.push(message.text().slice(0, 600)); });
  await page.goto(`${server.origin}${HARNESS}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as HarnessWindow).__GU47_WORLD_RECEIPTS__), undefined, { timeout: 60_000 });
  const rawRenderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return String(gl?.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : 0x1f01) ?? "unknown");
  });
  return {
    consoleProblems,
    consoleWarnings,
    render: (id) => page.evaluate((variant) => (window as unknown as HarnessWindow).__GU47_WORLD_RECEIPTS__!.render(variant), id),
    compare: (a, b, rect) => page.evaluate(([first, second, region]) =>
      (window as unknown as HarnessWindow).__GU47_WORLD_RECEIPTS__!.compare(first!, second!, region as Rect | undefined), [a, b, rect] as const),
    stats: (key, rect) => page.evaluate(([frame, region]) =>
      (window as unknown as HarnessWindow).__GU47_WORLD_RECEIPTS__!.stats(frame as string, region as Rect), [key, rect] as const),
    fogAmount: (off, fogged, solid, rect) => page.evaluate(([a, b, c, region]) =>
      (window as unknown as HarnessWindow).__GU47_WORLD_RECEIPTS__!.fogAmount(a as string, b as string, c as string, region as Rect), [off, fogged, solid, rect] as const),
    save(capability, frame) {
      const bytes = Buffer.from(frame.pngBase64, "base64");
      const file = `evidence/receipts/${capability}/${frame.key}.png`;
      emitFile(file, bytes);
      logMetrics(`${capability}:${frame.key}`, { meanRgb: frame.meanRgb, meanLuma: frame.meanLuma, drawCalls: frame.drawCalls });
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

export const WORLD_HARNESS_SCENE = "tests/browser/gu47/world-receipts.ts body(): ground strip 40x60 m, columns at 4/12/28 m, one shadow-casting sun, camera (0, 2, 6) -> (0, 1.4, -10), fov 55, 480x270";

/** Normalised rectangles (x0, y0, x1, y1; y down) of the harness body at 480x270. */
export const WORLD_REGIONS = {
  sky: [0, 0, 1, 0.3],
  farColumn: [0.44, 0.34, 0.6, 0.5],
  nearGround: [0.1, 0.85, 0.9, 1],
  lake: [0.25, 0.55, 0.75, 0.8]
} as const satisfies Record<string, Rect>;
