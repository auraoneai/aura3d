import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import sharp from "sharp";
import { test } from "@playwright/test";

/**
 * Tagline check (tools/bench-vs-threejs/tagline): does the llms.txt hello world build on a stock create-aura3d scaffold
 * and render, how does it compare with a matched three.js app, and does the 18-line bench cube still build and render.
 * Remote only (tools/remote-acr/run.sh): software WebGL2, not GPU numbers. Results leave as base64 chunks in the log.
 */
const WORK = process.env.TAGLINE_WORK ?? "/tmp/tagline";
const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".glb": "model/gltf-binary", ".hdr": "application/octet-stream", ".wasm": "application/wasm", ".png": "image/png",
  ".jpg": "image/jpeg", ".ktx2": "image/ktx2", ".svg": "image/svg+xml"
};
const GL_HOOK = `(() => {
  const c = { draws: 0, frames: 0, firstDrawMs: -1 };
  window.__GLC__ = c;
  const p = WebGL2RenderingContext.prototype;
  for (const n of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
    const o = p[n];
    p[n] = function (...a) { c.draws++; if (c.firstDrawMs < 0) c.firstDrawMs = performance.now(); return o.apply(this, a); };
  }
  const raf = window.requestAnimationFrame.bind(window);
  const tick = () => { c.frames++; raf(tick); };
  raf(tick);
})();`;

function serve(root: string): Promise<{ server: Server; origin: string }> {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
      if (rel.endsWith("/")) rel += "index.html";
      const file = join(root, rel);
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "content-length": statSync(file).size, "cache-control": "no-store" });
      createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      done({ server, origin: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}` });
    });
  });
}
const emit = (tag: string, b64: string) => { for (let i = 0; i * 3000 < b64.length; i++) console.log(`${tag}:${i}:${b64.slice(i * 3000, (i + 1) * 3000)}`); };

async function lumaStats(png: Buffer) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0, sq = 0;
  const n = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) { const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!; sum += l; sq += l * l; }
  const mean = sum / n;
  return { width: info.width, height: info.height, mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

test("tagline check: hello world vs three.js, and the 18-line cube", async ({ browser }) => {
  test.setTimeout(2_400_000);
  execFileSync("node", ["tools/bench-vs-threejs/tagline/build.mjs", "/repo/tools/bench-vs-threejs/tagline", "/repo/tools/bench-vs-threejs", WORK], { stdio: "inherit", timeout: 1_500_000 });
  const build = JSON.parse(readFileSync(join(WORK, "build.json"), "utf8"));
  const out: Record<string, unknown> = { build };
  for (const [name, app] of Object.entries(build.apps as Record<string, { buildOk: boolean; dist: string }>)) {
    if (!app.buildOk) { out[name] = { skipped: "build failed" }; continue; }
    const { server, origin } = await serve(app.dist);
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(GL_HOOK);
    const page = await context.newPage();
    const consoleMessages: string[] = [];
    const failed: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleMessages.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => consoleMessages.push(`[pageerror] ${String(e.message).slice(0, 300)}`));
    page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    const t0 = Date.now();
    try {
      await page.goto(`${origin}/index.html`, { waitUntil: "load" });
      let png: Buffer;
      let extra: unknown = null;
      if (name === "aura-cube") {
        await page.waitForFunction(() => Boolean((window as never as { __BENCH__?: { ready: boolean; errors: string[] } }).__BENCH__), undefined, { timeout: 300_000 });
        extra = await page.evaluate(() => {
          const b = (window as never as { __BENCH__: { ready: boolean; errors: string[]; firstFrameMs: number; capture(dt: number): { mean: number; std: number; jpeg: string } } }).__BENCH__;
          if (!b.ready) return { ready: false, errors: b.errors };
          for (let i = 0; i < 24; i++) (b as never as { frame(dt: number): void }).frame(1 / 60);
          const c = b.capture(1 / 60);
          return { ready: true, firstFrameMs: b.firstFrameMs, mean: c.mean, std: c.std, jpeg: c.jpeg };
        });
        const e = extra as { jpeg?: string };
        png = e.jpeg ? Buffer.from(e.jpeg.split(",")[1]!, "base64") : await page.screenshot({ type: "png" });
        if (e.jpeg) delete e.jpeg;
      } else {
        // Wait for the first draw, then for the page to settle (assets, env, shader compile), capped for software GL.
        await page.waitForFunction(() => ((window as never as { __GLC__: { draws: number } }).__GLC__.draws > 0), undefined, { timeout: 300_000 });
        await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => undefined);
        await page.waitForTimeout(15_000);
        png = await page.screenshot({ type: "png" });
      }
      const window1 = await page.evaluate(async () => {
        const c = (window as never as { __GLC__: { draws: number; frames: number; firstDrawMs: number } }).__GLC__;
        const d0 = c.draws, f0 = c.frames;
        await new Promise((r) => setTimeout(r, 5000));
        return { firstDrawMs: c.firstDrawMs, framesIn5s: c.frames - f0, drawsIn5s: c.draws - d0 };
      });
      const stats = await lumaStats(png);
      out[name] = { wallMs: Date.now() - t0, stats, gl: window1, extra, failedRequests: failed, console: consoleMessages.slice(0, 12) };
      console.log(`TAGLINE_RENDER ${name}: mean=${stats.mean.toFixed(1)} std=${stats.std.toFixed(1)} draws5s=${window1.drawsIn5s} frames5s=${window1.framesIn5s} failed=${failed.length} console=${consoleMessages.length}`);
      console.log(`TAGLINE_FRAME_BEGIN ${name}`);
      emit(`TAGLINE_FRAME:${name}`, (await sharp(png).jpeg({ quality: 82 }).toBuffer()).toString("base64"));
      console.log(`TAGLINE_FRAME_END ${name}`);
    } catch (error) {
      out[name] = { error: String((error as Error)?.message ?? error).slice(0, 800), failedRequests: failed, console: consoleMessages.slice(0, 12) };
      console.log(`TAGLINE_RENDER ${name}: ERROR ${(out[name] as { error: string }).error}`);
    } finally {
      await context.close();
      server.close();
    }
  }
  console.log("TAGLINE_RESULTS_BEGIN");
  emit("TAGLINE_RESULTS", Buffer.from(JSON.stringify(out)).toString("base64"));
  console.log("TAGLINE_RESULTS_END");
});
