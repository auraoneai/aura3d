import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));

/** Load a perf harness tool and return its `__QR_PERF__` report (fails on `__QR_ERROR__`). */
export async function runPerfTool<T>(page: Page, query: string, timeout: number): Promise<{ report: T; pageErrors: string[] }> {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(`/?${query}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__QR_READY__ !== undefined || window.__QR_ERROR__ !== undefined, null, { timeout });
  const qrError = await page.evaluate(() => window.__QR_ERROR__);
  if (qrError !== undefined) throw new Error(`harness error: ${String(qrError)}`);
  const report = (await page.evaluate(() => (window as unknown as { __QR_PERF__?: unknown }).__QR_PERF__)) as T;
  return { report, pageErrors: pageErrors.filter((e) => !e.includes("favicon")) };
}

/** Counters report for the perf job artifact (`tests/qr/prd01/out/perf/<name>.json`). */
export function writePerfReport(name: string, report: unknown): void {
  const out = resolve(here, "../out/perf");
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
}
