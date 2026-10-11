/**
 * Shared helpers for the lane-01 S-row browser specs: open a harness spec tool,
 * screenshot a canvas region (works with `preserveDrawingBuffer: false`), and
 * run lane metrics in the page over decoded screenshots.
 */

import { expect, type Page } from "@playwright/test";
import type * as Metrics from "../metrics/index";

export interface QrTools {
  decodePng(pngBase64: string): Promise<Metrics.ImageLike>;
  readonly metrics: typeof Metrics;
}

/** Navigates to `/?<query>`, waits for the harness, fails on __QR_ERROR__, returns __QR_SPEC__. */
export async function openTool<T>(page: Page, query: string, pageErrors: string[], timeout = 120_000): Promise<T> {
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(`/?${query}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__QR_READY__ !== undefined || window.__QR_ERROR__ !== undefined, null, { timeout });
  const qrError = await page.evaluate(() => window.__QR_ERROR__);
  expect(qrError).toBeUndefined();
  return (await page.evaluate(() => (window as unknown as { __QR_SPEC__?: unknown }).__QR_SPEC__)) as T;
}

/** PNG screenshot of a CSS-pixel region of the page, base64. */
export async function shot(page: Page, x: number, y: number, width: number, height: number): Promise<string> {
  const buffer = await page.screenshot({ clip: { x, y, width, height }, animations: "disabled" });
  return buffer.toString("base64");
}

/** Aura half (0,0) and three half (640,0) of a side-by-side spec tool, base64 PNGs. */
export async function shotPair(page: Page): Promise<{ aura: string; three: string }> {
  return { aura: await shot(page, 0, 0, 640, 360), three: await shot(page, 640, 0, 640, 360) };
}

/** Center-pixel RGB of a screenshot (decoded in the page). */
export async function centerRgb(page: Page, png: string): Promise<number[]> {
  return page.evaluate(async (b64) => {
    const tools = (window as unknown as { __QR_TOOLS__: QrTools }).__QR_TOOLS__;
    const img = await tools.decodePng(b64);
    const o = (Math.floor(img.height / 2) * img.width + Math.floor(img.width / 2)) * 4;
    return [img.data[o]!, img.data[o + 1]!, img.data[o + 2]!];
  }, png);
}

export function nonFavicon(errors: readonly string[]): string[] {
  return errors.filter((e) => !e.includes("favicon"));
}

export function maxAbsDiff(a: readonly number[], b: readonly number[]): number {
  return Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
}
