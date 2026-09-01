#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const repoRoot = resolve(import.meta.dirname, "../../..");
const port = 5199;
const origin = `http://127.0.0.1:${port}`;
const previewRoute = "/apps/showcase-gravity-post/scripts/freight-district-preview/index.html";
const output = resolve(repoRoot, "apps/showcase-gravity-post/assets/candidates/gravityPostFreightDistrict.preview.png");
const sidecar = resolve(repoRoot, "apps/showcase-gravity-post/assets/candidates/gravityPostFreightDistrict.preview.json");

const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: repoRoot,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true
});

let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += String(chunk); });
server.stderr.on("data", (chunk) => { serverLog += String(chunk); });

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin + previewRoute);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Preview Vite server did not become ready.\n${serverLog}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(origin + previewRoute, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__GRAVITY_FREIGHT_DISTRICT_PREVIEW__?.ready === true, undefined, { timeout: 60_000 });
  await page.waitForTimeout(700);
  const evidence = await page.evaluate(() => globalThis.__GRAVITY_FREIGHT_DISTRICT_PREVIEW__);
  await page.screenshot({ path: output, type: "png" });
  const screenshotSha256 = `sha256-${createHash("sha256").update(readFileSync(output)).digest("hex")}`;
  writeFileSync(sidecar, `${JSON.stringify({
    schema: "aura3d-gravity-post-freight-district-preview/1.0",
    generatedBy: "apps/showcase-gravity-post/scripts/capture-freight-district-preview.mjs",
    route: previewRoute,
    screenshot: "apps/showcase-gravity-post/assets/candidates/gravityPostFreightDistrict.preview.png",
    screenshotSha256,
    viewport: [1440, 900],
    evidence
  }, null, 2)}\n`);
  console.log(JSON.stringify({ output, sidecar, screenshotSha256, evidence }, null, 2));
} finally {
  if (browser) await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); }
}
