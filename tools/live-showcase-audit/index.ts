import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "../..");
const origin = process.env.A3D_AUDIT_ORIGIN ?? "http://127.0.0.1:7782";
const outputDir = resolve(root, process.env.A3D_AUDIT_OUTPUT ?? "tests/reports/live-showcase-2.0.2");
const catalog = await readFile(resolve(root, "apps/showcase-index/index.html"), "utf8");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as { version: string };
const cards = [...catalog.matchAll(/<a class="showcase-card[^"]*" href="([^"]+)">\s*<span>(\d+)<\/span>\s*<strong>([^<]+)<\/strong>/g)]
  .map((match) => ({ url: match[1]!, number: match[2]!, title: match[3]! }));

if (cards.length !== 36) throw new Error(`Expected 36 showcase cards, found ${cards.length}`);
if (packageJson.version !== "2.0.2") throw new Error(`Expected Aura3D 2.0.2, found ${packageJson.version}`);
const requestedNumbers = new Set((process.env.A3D_AUDIT_NUMBERS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const selectedCards = requestedNumbers.size > 0 ? cards.filter((card) => requestedNumbers.has(card.number)) : cards;
if (selectedCards.length === 0) throw new Error("A3D_AUDIT_NUMBERS did not match a showcase card.");

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results: unknown[] = [];

for (const card of selectedCards) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(120_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const badResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => requestFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`));
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });

  const startedAt = Date.now();
  let navigationError: string | null = null;
  try {
    await page.goto(`${origin}${card.url}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const settleMs = card.url.includes("advanced-examples-gallery") ? 18_000
      : card.url.includes("showcase-") || card.url.includes("aura-clash") ? 7_000
        : 3_500;
    await page.waitForTimeout(settleMs);
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
  }

  const state = await page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    const canvas = document.querySelector("canvas");
    const wowRuntime = (window as unknown as { __a3dWowRuntime?: { status?: string; frameCount?: number; drawCalls?: number } }).__a3dWowRuntime;
    return {
      title: document.title,
      ready: document.body?.dataset.aura3dReady ?? null,
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      fallbackVisible: /authored asset failed to load|procedural scene only|failed to initialize|runtime error/i.test(text),
      runtimeStatus: wowRuntime?.status ?? null,
      runtimeFrameCount: wowRuntime?.frameCount ?? null,
      runtimeDrawCalls: wowRuntime?.drawCalls ?? null,
      bodyTextLength: text.length
    };
  }).catch(() => ({ title: "", ready: null, canvas: null, fallbackVisible: true, runtimeStatus: "error", runtimeFrameCount: null, runtimeDrawCalls: null, bodyTextLength: 0 }));

  const slug = card.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const screenshot = `${card.number}-${slug}.png`;
  let screenshotError: string | null = null;
  try {
    // A running game intentionally never reaches animation stability. Capture
    // Chromium's current framebuffer directly instead of waiting for motion to stop.
    const cdp = await page.context().newCDPSession(page);
    const capture = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true
    });
    await writeFile(resolve(outputDir, screenshot), Buffer.from(capture.data, "base64"));
    await cdp.detach();
  } catch (error) {
    screenshotError = error instanceof Error ? error.message : String(error);
  }
  const meaningfulFailures = requestFailures.filter((failure) => !/net::ERR_ABORTED$/i.test(failure));
  const runtimeFailed = state.runtimeStatus === "error" || state.runtimeStatus === "unsupported";
  const runtimeStalled = state.runtimeStatus !== null && state.runtimeStatus !== "loading" && Number(state.runtimeFrameCount) <= 0;
  const pass = !navigationError && !screenshotError && !state.fallbackVisible && !runtimeFailed && !runtimeStalled && consoleErrors.length === 0
    && pageErrors.length === 0 && meaningfulFailures.length === 0 && badResponses.length === 0;
  const result = {
    ...card,
    libraryVersion: packageJson.version,
    screenshot,
    elapsedMs: Date.now() - startedAt,
    pass,
    state,
    navigationError,
    screenshotError,
    consoleErrors,
    pageErrors,
    requestFailures: meaningfulFailures,
    badResponses
  };
  results.push(result);
  process.stdout.write(`${card.number}/${cards.length} ${pass ? "PASS" : "REVIEW"} ${card.title}\n`);
  await page.close();
}

await browser.close();
const summary = {
  schema: "aura3d-live-showcase-audit/1.0",
  generatedAt: new Date().toISOString(),
  origin,
  libraryVersion: packageJson.version,
  total: results.length,
  passed: results.filter((result) => (result as { pass: boolean }).pass).length,
  failed: results.filter((result) => !(result as { pass: boolean }).pass).length,
  results
};
await writeFile(resolve(outputDir, "audit.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`Audit complete: ${summary.passed}/${summary.total} passed; ${outputDir}\n`);
if (summary.failed > 0) process.exitCode = 1;
