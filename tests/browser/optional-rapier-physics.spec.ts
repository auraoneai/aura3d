import { createServer, type Server } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build } from "esbuild";
import { expect, test } from "@playwright/test";

const reportPath = resolve("tests/reports/optional-rapier-physics/report.json");
let server: Server;
let origin = "";
let bundle = Buffer.alloc(0);
let bundleRequests = 0;

test.beforeAll(async () => {
  const output = await build({
    entryPoints: [resolve("tests/fixtures/optional-rapier-browser.ts")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
    minify: true,
    logLevel: "silent"
  });
  bundle = Buffer.from(output.outputFiles[0]?.contents ?? []);
  server = createServer((request, response) => {
    if (request.url === "/bundle.js") {
      bundleRequests += 1;
      response.writeHead(200, { "content-type": "text/javascript", "cache-control": "public, max-age=3600, immutable", "content-length": bundle.length });
      response.end(bundle); return;
    }
    response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
    response.end("<!doctype html><script>window.__auraRapierLoadStart=performance.now()</script><script src='/bundle.js'></script>");
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind optional Rapier server");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
});

test("optional Rapier package loads, caches, steps, queries, controls, and disposes in Chromium", async ({ browser }) => {
  const context = await browser.newContext();
  const consoleErrors: string[] = [];
  const samples: unknown[] = [];
  for (let run = 0; run < 2; run += 1) {
    const page = await context.newPage();
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.goto(origin, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as typeof window & { __auraRapierProof?: unknown }).__auraRapierProof), undefined, { timeout: 30_000 });
    samples.push(await page.evaluate(() => (window as typeof window & { __auraRapierProof?: unknown }).__auraRapierProof));
    await page.close();
  }
  await context.close();
  const typed = samples as Array<{ pass: boolean; loadToReadyMs: number; initMs: number; stepMs220Bodies: number; rayHit: boolean; nativeCharacterController: boolean; nativeVehicleController: boolean; repeatedDisposals: number; usedJSHeapSize: number | null }>;
  const report = {
    schema: "aura3d.optional-rapier-browser/1.0",
    generatedAt: new Date().toISOString(),
    pass: typed.every((entry) => entry.pass) && consoleErrors.length === 0 && bundleRequests === 1,
    package: "@aura3d/physics-rapier",
    backend: "@dimforge/rapier3d-compat@0.20.0",
    browser: "Chromium",
    bundle: { rawBytes: bundle.length, gzipBytes: gzipSync(bundle).length, brotliBytes: brotliCompressSync(bundle).length, requestsAcrossColdAndCachedNavigation: bundleRequests },
    cold: typed[0],
    cached: typed[1],
    consoleErrors,
    claimBoundary: "Optional physical-simulation browser lifecycle only; no renderer, arcade-game, or universal performance claim."
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  expect(report.pass).toBe(true);
  expect(report.bundle.requestsAcrossColdAndCachedNavigation).toBe(1);
  expect(report.cold?.nativeCharacterController).toBe(true);
  expect(report.cold?.nativeVehicleController).toBe(true);
  expect(report.cold?.repeatedDisposals).toBe(20);
  expect(report.cold?.stepMs220Bodies).toBeLessThan(16.7);
});
