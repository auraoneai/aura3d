/**
 * probe.ts — shared page-load helper for the PRD-04 §16.1 spec files. Navigates
 * to a lane harness/driver URL, waits for `__QR_READY__`/`__QR_ERROR__`, and
 * returns the ready payload. `extra.frame` pixels travel as plain JSON numbers.
 */
import { expect, type Page } from "@playwright/test";

export interface Prd04ProbePayload {
  readonly scene: string;
  readonly engine: string;
  readonly flags: readonly string[];
  readonly warnings: readonly string[];
  readonly extra?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

export interface ProbeFrame {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly number[];
}

export function probeFrame(payload: Prd04ProbePayload): ProbeFrame {
  const frame = (payload.extra ?? {}).frame as ProbeFrame | undefined;
  expect(frame, "extra.frame present — pass pixels=1").toBeTruthy();
  expect(Array.isArray(frame!.pixels) && frame!.pixels.length > 0, "frame pixels populated").toBe(true);
  return frame!;
}

export async function loadProbe(page: Page, url: string, timeoutMs = 180_000): Promise<Prd04ProbePayload> {
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
  return payload as Prd04ProbePayload;
}
