/**
 * render-server.ts — WARM persistent render server (#7). It pays the expensive startup
 * costs ONCE — Vite dev server + Chromium/swiftshader launch — and then keeps them alive,
 * serving many render requests over HTTP. Each request opens a fresh page in the SAME warm
 * browser context (so GLB fetches are HTTP-cache hits) and renders via the shared
 * render-core pipeline. This turns the studio iteration loop from "~25s cold every edit"
 * into "page-load + capture only".
 *
 * Start:  pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/templates/animation-studio/scripts/render-server.ts
 *         (prints PORT=<n>; honours AURA_RENDER_PORT to pin it)
 * Render: curl -s localhost:<port>/render -d '{"document":"dist/scene/working.document.json","range":"0-6","lowFi":true,"outputDir":"dist/episodes/preview"}'
 * Health: curl localhost:<port>/health   Stop: curl localhost:<port>/shutdown
 */

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import type { ViteDevServer } from "vite";
import type { EpisodeDocument } from "../src/episode-document.js";
import { profileFor, renderRange, startWarmVite } from "./render-core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "..");
const MONOREPO_ROOT = resolve(TEMPLATE_ROOT, "../../../..");
const PORT = Number(process.env.AURA_RENDER_PORT ?? "0");

interface RenderRequest {
  readonly document: string; // path to a document JSON (relative to template root or absolute)
  readonly range?: string; // "start-end" seconds; default whole episode
  readonly lowFi?: boolean;
  readonly outputDir?: string;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  console.log("warm render server: launching Vite + Chromium (one-time startup) ...");
  const vite: ViteDevServer = await startWarmVite(TEMPLATE_ROOT, MONOREPO_ROOT);
  const address = vite.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Vite did not expose a numeric port.");
  const routeUrl = `http://127.0.0.1:${address.port}/live-route.html`;
  const browser: Browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swdecoder", "--ignore-gpu-blocklist"]
  });
  const context = await browser.newContext(); // shared context → warm HTTP cache for GLBs

  let busy = false;
  async function handleRender(body: RenderRequest): Promise<unknown> {
    const docPath = resolve(TEMPLATE_ROOT, body.document);
    const document = JSON.parse(readFileSync(docPath, "utf8")) as EpisodeDocument;
    const profile = profileFor(Boolean(body.lowFi));
    const [a, b] = (body.range ?? `0-${document.duration}`).split("-").map(Number);
    const outDir = resolve(TEMPLATE_ROOT, body.outputDir ?? "dist/episodes/warm-preview");

    const page = await context.newPage();
    try {
      await page.addInitScript(() => { (window as unknown as { __AURA_LIVE_ROUTE_HEADLESS__: boolean }).__AURA_LIVE_ROUTE_HEADLESS__ = true; });
      await page.addInitScript((d) => { (window as unknown as { __AURA_EPISODE_DOCUMENT__: unknown }).__AURA_EPISODE_DOCUMENT__ = d; }, document as unknown);
      await page.setViewportSize({ width: profile.width + 40, height: profile.height + 40 });
      await page.goto(routeUrl, { waitUntil: "load", timeout: 60_000 });
      await page.waitForFunction(() => {
        const w = window as unknown as { __AURA_LIVE_ROUTE_READY__?: unknown; __AURA_LIVE_ROUTE_ERROR__?: string };
        if (w.__AURA_LIVE_ROUTE_ERROR__) throw new Error(`route error: ${w.__AURA_LIVE_ROUTE_ERROR__}`);
        return Boolean(w.__AURA_LIVE_ROUTE_READY__);
      }, { timeout: 60_000 });
      const t0 = Date.now();
      const result = await renderRange(page, { document, firstSec: a ?? 0, lastSec: b ?? document.duration, profile, outDir });
      return { ...result, ms: Date.now() - t0, document: document.id };
    } finally {
      await page.close();
    }
  }

  const http = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = req.url ?? "/";
      if (url === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, routeUrl })); return; }
      if (url === "/shutdown") {
        res.writeHead(200); res.end("shutting down");
        await context.close(); await browser.close(); await vite.close();
        http.close(() => process.exit(0));
        return;
      }
      if (url === "/render" && req.method === "POST") {
        if (busy) { res.writeHead(429, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "render in progress" })); return; }
        busy = true;
        try {
          const body = JSON.parse(await readBody(req)) as RenderRequest;
          const out = await handleRender(body);
          res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out));
        } catch (err) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        } finally { busy = false; }
        return;
      }
      res.writeHead(404); res.end("not found");
    })();
  });
  http.listen(PORT, "127.0.0.1", () => {
    const a = http.address();
    const port = a && typeof a !== "string" ? a.port : PORT;
    console.log(`PORT=${port}`);
    console.log(`warm render server ready on http://127.0.0.1:${port} (route ${routeUrl})`);
    console.log(`  POST /render  {"document":"dist/scene/working.document.json","range":"0-6","lowFi":true}`);
    console.log(`  GET  /health   GET /shutdown`);
  });
}

main().catch((error: unknown) => {
  console.error("render-server failed:", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
