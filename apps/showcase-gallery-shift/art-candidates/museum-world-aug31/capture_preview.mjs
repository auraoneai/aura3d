#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const origin = process.env.GALLERY_CANDIDATE_ORIGIN ?? "http://127.0.0.1:4197";
const output = new URL("./museum-world-aura-preview.png", import.meta.url);
const evidenceOutput = new URL("./museum-world-aura-preview.json", import.meta.url);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(origin, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(window.__GALLERY_MUSEUM_CANDIDATE_PREVIEW__) || Boolean(window.__GALLERY_MUSEUM_CANDIDATE_ERROR__),
    undefined,
    { timeout: 60_000 }
  );
  const error = await page.evaluate(() => window.__GALLERY_MUSEUM_CANDIDATE_ERROR__);
  if (error) throw new Error(error);
  const evidence = await page.evaluate(() => window.__GALLERY_MUSEUM_CANDIDATE_PREVIEW__);
  await page.screenshot({ path: output.pathname, fullPage: false });
  const png = readFileSync(output);
  const receipt = {
    ...evidence,
    screenshot: {
      path: "museum-world-aura-preview.png",
      sha256: createHash("sha256").update(png).digest("hex"),
      bytes: png.byteLength,
      viewport: [1280, 800]
    }
  };
  writeFileSync(evidenceOutput, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  await browser.close();
}
