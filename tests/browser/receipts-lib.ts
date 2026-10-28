import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Page } from "@playwright/test";
import type { ContactMaskComparison, ContactMaskFrame, ContactMaskVariant, FrameComparison, FrameResult, KitRunResult } from "./receipts-harness";

/**
 * Shared Node-side helpers for the pixel-receipt specs (PRD beat-three.js §3.5).
 *
 * The remote runner (tools/remote-acr/run.sh) has no artifact egress, so every receipt
 * file is also emitted to stdout as chunked base64 lines. `tools/receipts/extract-from-acr-log.mjs`
 * reassembles them from `acr-run.log` into `evidence/receipts/**`.
 */

export interface ReceiptFrame {
  readonly file: string;
  readonly sha256: string;
  readonly meanLuma: number;
  readonly nonBlackRatio: number;
  readonly label: string;
}

export interface Receipt {
  readonly capability: string;
  readonly version: string;
  readonly gitSha: string;
  readonly renderer: string;
  readonly scene: string;
  readonly frames: readonly ReceiptFrame[];
  readonly tests: readonly string[];
  readonly date: string;
  readonly checks: Readonly<Record<string, number | boolean | string>>;
}

interface ReceiptsWindow {
  __AURA3D_RECEIPTS__?: {
    renderer(): string;
    renderEffect(id: string): Promise<FrameResult>;
    renderKit(id: string): Promise<KitRunResult>;
    compare(a: string, b: string): FrameComparison;
    renderContactMask(id: ContactMaskVariant): Promise<ContactMaskFrame>;
    compareContactMask(a: string, b: string): ContactMaskComparison;
    effectVariants: readonly string[];
    kitIds: readonly string[];
  };
  __AURA3D_RECEIPTS_ERROR__?: string;
}

export const HARNESS_PATH = "/tests/browser/receipts-harness.html";

export function engineVersion(): string {
  const manifest = JSON.parse(readFileSync(resolve("packages/engine/package.json"), "utf8")) as { version: string };
  return manifest.version;
}

export function gitSha(): string {
  if (process.env.AURA3D_GIT_SHA) return process.env.AURA3D_GIT_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // The remote image has no .git; the extractor patches this from the staged commit.
    return "unknown-in-image";
  }
}

export async function openHarness(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}${HARNESS_PATH}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const w = window as unknown as ReceiptsWindow;
    return Boolean(w.__AURA3D_RECEIPTS__ || w.__AURA3D_RECEIPTS_ERROR__);
  }, undefined, { timeout: 60_000 });
  const error = await page.evaluate(() => (window as unknown as ReceiptsWindow).__AURA3D_RECEIPTS_ERROR__);
  if (error) throw new Error(error);
}

export function rendererString(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as ReceiptsWindow).__AURA3D_RECEIPTS__!.renderer());
}

export function renderEffect(page: Page, id: string): Promise<FrameResult> {
  return page.evaluate((variant) => (window as unknown as ReceiptsWindow).__AURA3D_RECEIPTS__!.renderEffect(variant), id);
}

export function renderKit(page: Page, id: string): Promise<KitRunResult> {
  return page.evaluate((kit) => (window as unknown as ReceiptsWindow).__AURA3D_RECEIPTS__!.renderKit(kit), id);
}

export function renderContactMask(page: Page, id: ContactMaskVariant): Promise<ContactMaskFrame> {
  return page.evaluate((variant) => (window as unknown as ReceiptsWindow).__AURA3D_RECEIPTS__!.renderContactMask(variant), id);
}

export function compareContactMask(page: Page, a: ContactMaskVariant, b: ContactMaskVariant): Promise<ContactMaskComparison> {
  return page.evaluate(([first, second]) => (window as unknown as ReceiptsWindow).__AURA3D_RECEIPTS__!.compareContactMask(first!, second!), [a, b] as const);
}

export function compareFrames(page: Page, a: string, b: string): Promise<FrameComparison> {
  return page.evaluate(([first, second]) => (window as unknown as ReceiptsWindow).__AURA3D_RECEIPTS__!.compare(first!, second!), [a, b] as const);
}

/** Normalises the WebGL renderer string to the schema's `swiftshader | <gpu string>`. */
export function receiptRenderer(raw: string): string {
  return /swiftshader/i.test(raw) ? "swiftshader" : raw;
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function logMetrics(label: string, value: unknown): void {
  console.log(`@@METRICS ${label} ${JSON.stringify(value)}`);
}

/** Writes a file under the repo and mirrors it to stdout as chunked base64 for log extraction. */
export function emitFile(repoRelativePath: string, bytes: Buffer): void {
  const absolute = resolve(repoRelativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  const encoded = bytes.toString("base64");
  const chunk = 3000;
  const total = Math.max(1, Math.ceil(encoded.length / chunk));
  for (let index = 0; index < total; index += 1) {
    console.log(`@@FILE ${repoRelativePath} ${index + 1}/${total} ${encoded.slice(index * chunk, (index + 1) * chunk)}`);
  }
}

/** Saves a captured frame as a PNG and returns its receipt entry. */
export function saveFrame(frame: FrameResult, repoRelativePath: string, label: string): ReceiptFrame {
  const bytes = Buffer.from(frame.pngBase64, "base64");
  emitFile(repoRelativePath, bytes);
  return {
    file: repoRelativePath,
    sha256: sha256(bytes),
    meanLuma: frame.metrics.meanLuma,
    nonBlackRatio: frame.metrics.nonBlackRatio,
    label
  };
}

export function writeReceipt(receipt: Receipt): void {
  const path = `evidence/receipts/${receipt.capability}/${receipt.version}.json`;
  emitFile(path, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"));
}
