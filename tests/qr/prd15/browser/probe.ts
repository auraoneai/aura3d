/**
 * PRD-15 §15-SPECS page-load helper: navigate to a lane harness URL, wait for
 * `__QR_READY__`/`__QR_ERROR__`, return the ready payload.
 */
import { expect, type Page } from "@playwright/test";

export interface Prd15ProbePayload {
  readonly harness: string;
  readonly mode: string;
  readonly flags: readonly string[];
  readonly mountFailed: boolean;
  readonly errorName?: string;
  readonly errorMessage?: string;
  readonly overlayText?: string | null;
  readonly backend?: string | null;
  readonly degradations?: readonly unknown[];
  readonly drawCalls?: number | null;
  readonly shaderScan?: { readonly files: number; readonly hits: readonly string[] };
  readonly extra?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

export function probeFrame(payload: Prd15ProbePayload): { width: number; height: number; pixels: readonly number[] } {
  const frame = (payload.extra ?? {}).frame as { width: number; height: number; pixels: number[] } | undefined;
  expect(frame, "extra.frame present — pass pixels=1").toBeTruthy();
  expect(Array.isArray(frame!.pixels) && frame!.pixels.length > 0, "frame pixels populated").toBe(true);
  return frame!;
}

export async function loadProbe(page: Page, url: string, timeoutMs = 180_000): Promise<Prd15ProbePayload> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      (window as { __QR_READY__?: unknown; __QR_ERROR__?: unknown }).__QR_READY__ !== undefined ||
      (window as { __QR_READY__?: unknown; __QR_ERROR__?: unknown }).__QR_ERROR__ !== undefined,
    undefined,
    { timeout: timeoutMs }
  );
  const error = await page.evaluate(() => (window as { __QR_ERROR__?: string }).__QR_ERROR__ ?? null);
  expect(error, `harness error on ${url}: ${error ?? ""}`).toBeNull();
  const payload = await page.evaluate(() => (window as { __QR_READY__?: unknown }).__QR_READY__ ?? null);
  expect(payload, `payload on ${url}`).not.toBeNull();
  return payload as Prd15ProbePayload;
}
