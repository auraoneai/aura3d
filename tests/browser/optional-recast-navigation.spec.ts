import { createServer, type Server } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build } from "esbuild";
import { expect, test } from "@playwright/test";

const reportPath = resolve("tests/reports/optional-recast-navigation/report.json");
let server: Server;
let origin = "";
let bundle = Buffer.alloc(0);
let workerBundle = Buffer.alloc(0);
let bundleRequests = 0;

test.beforeAll(async () => {
  const [mainOutput, workerOutput] = await Promise.all([
    build({ entryPoints: [resolve("tests/fixtures/optional-recast-browser.ts")], bundle: true, format: "iife", platform: "browser", target: "es2022", write: false, minify: true, logLevel: "silent" }),
    build({ entryPoints: [resolve("tests/fixtures/navigation-recast-worker.ts")], bundle: true, format: "esm", platform: "browser", target: "es2022", write: false, minify: true, logLevel: "silent" })
  ]);
  bundle = Buffer.from(mainOutput.outputFiles[0]?.contents ?? []);
  workerBundle = Buffer.from(workerOutput.outputFiles[0]?.contents ?? []);
  server = createServer((request, response) => {
    if (request.url === "/bundle.js") { bundleRequests += 1; response.writeHead(200, { "content-type": "text/javascript", "cache-control": "public, max-age=3600, immutable" }); response.end(bundle); return; }
    if (request.url === "/navigation-worker.js") { response.writeHead(200, { "content-type": "text/javascript", "cache-control": "public, max-age=3600, immutable" }); response.end(workerBundle); return; }
    response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
    response.end("<!doctype html><script>window.__auraRecastLoadStart=performance.now()</script><script src='/bundle.js'></script>");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind optional Recast server");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => { if (server) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done())); });

test("optional Recast package loads, builds in a worker, queries, crowds, obstacles, caches, and disposes", async ({ browser }) => {
  const context = await browser.newContext();
  const consoleErrors: string[] = [];
  const samples: unknown[] = [];
  for (let run = 0; run < 2; run += 1) {
    const page = await context.newPage();
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.goto(origin, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as Window & { __auraRecastProof?: unknown }).__auraRecastProof), undefined, { timeout: 45_000 });
    samples.push(await page.evaluate(() => (window as Window & { __auraRecastProof?: unknown }).__auraRecastProof));
    await page.close();
  }
  await context.close();
  const typed = samples as Array<{ pass: boolean; transferredBytes: number; repeatedDisposals: number; crowdStepMs32Agents: number }>;
  const report = {
    schema: "aura3d.optional-recast-browser/1.0",
    generatedAt: new Date().toISOString(),
    pass: typed.every((entry) => entry.pass) && consoleErrors.length === 0 && bundleRequests === 1,
    package: "@aura3d/navigation-recast",
    backend: "recast-navigation@0.43.1",
    browser: "Chromium",
    bundle: { mainRawBytes: bundle.length, mainGzipBytes: gzipSync(bundle).length, mainBrotliBytes: brotliCompressSync(bundle).length, workerRawBytes: workerBundle.length, workerGzipBytes: gzipSync(workerBundle).length, requestsAcrossColdAndCachedNavigation: bundleRequests },
    cold: typed[0],
    cached: typed[1],
    consoleErrors,
    claimBoundary: "Optional Recast/Detour browser lifecycle, worker generation, query, crowd, and temporary-obstacle evidence only."
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  expect(report.pass).toBe(true);
  expect(report.cold?.transferredBytes).toBeGreaterThan(0);
  expect(report.cold?.repeatedDisposals).toBe(10);
  expect(report.cold?.crowdStepMs32Agents).toBeLessThan(16.7);
});
