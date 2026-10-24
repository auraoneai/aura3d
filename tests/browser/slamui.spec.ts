import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * slamui: before/after frames and layout metrics for the native Aura Slam menu and portrait quick bar. Remote-only
 * (tools/remote-acr/run.sh, RUN_ID prefix slamui). Build both dists first:
 *   node tools/aura-slam/build-wrapper.mjs tests/browser/slamui-dist-before   (from a checkout of the old commit)
 *   node tools/aura-slam/build-wrapper.mjs tests/browser/slamui-dist-after
 * Frames and metrics are printed as chunked console lines (`SLAMUI_FRAME name i n payload`, `SLAMUI_METRICS json`).
 */
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".wav": "audio/wav", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff" };

function serve(dist: string): Promise<{ origin: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    let file = path.join(dist, url);
    if (!file.startsWith(dist)) { res.statusCode = 403; res.end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file)) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("content-type", MIME[path.extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as { port: number };
    resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
  }));
}

async function frame(page: Page, name: string): Promise<void> {
  const b64 = (await page.screenshot({ type: "jpeg", quality: 82 })).toString("base64");
  const n = Math.ceil(b64.length / 16000);
  for (let i = 0; i < n; i++) console.log(`SLAMUI_FRAME ${name} ${i} ${n} ${b64.slice(i * 16000, (i + 1) * 16000)}`);
}

const probe = (page: Page) => page.evaluate(() => {
  const rect = (sel: string) => { const el = document.querySelector(sel) as HTMLElement | null; if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, fontSize: cs.fontSize, padding: cs.padding, gap: cs.gap }; };
  const inter = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a && b ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : null;
  const bar = rect(".aura3d-top-bar"), sb = rect("#scoreboard"), pause = rect(".pause-btn"), menu = rect(".mode-menu"), canvas = rect("#game");
  return { vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth, bar, sb, pause, canvas, menu, h1: rect(".mode-menu h1"), picker: rect(".mode-picker"), choice: rect(".mode-choice"), overlapBarScoreboard: inter(bar, sb), overlapBarPause: inter(bar, pause) };
});

const TARGETS = (existsSync(path.resolve("tests/browser/slamui-targets.txt")) ? readFileSync(path.resolve("tests/browser/slamui-targets.txt"), "utf8").trim().split(/\s+/) : ["before", "after"]) as Array<"before" | "after">;
for (const target of TARGETS) {
  test(`slamui ${target}: menu and portrait play`, async ({ browser }) => {
    test.setTimeout(1_200_000);
    const server = await serve(path.resolve(`tests/browser/slamui-dist-${target}`));
    const errors: string[] = [];
    try {
      for (const viewport of [{ name: "1280", width: 1280, height: 720, mobile: false }, { name: "390", width: 390, height: 844, mobile: true }]) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, ...(viewport.mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) errors.push(m.text()); });
        await page.goto(`${server.origin}/apps/showcase-top-tennis/?heal=0`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.body.dataset.auraSlamReady === "true", undefined, { timeout: 900_000, polling: 2000 });
        await page.waitForTimeout(1500);
        const out: Record<string, unknown> = { target, viewport: viewport.name };
        out.boot = await probe(page);
        await frame(page, `${target}-play-${viewport.name}`);
        await page.locator("#aura-btn-menu").evaluate((el) => (el as HTMLElement).click());
        await expect(page.locator("#menu")).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(1200);
        out.menu = await probe(page);
        await frame(page, `${target}-menu-${viewport.name}`);
        await page.locator("#mode-single").evaluate((el) => (el as HTMLElement).click());
        await page.waitForTimeout(1200);
        out.setup = await probe(page);
        await frame(page, `${target}-setup-${viewport.name}`);
        console.log(`SLAMUI_METRICS ${JSON.stringify(out)}`);
        await context.close();
      }
      console.log(`SLAMUI_ERRORS ${target} ${JSON.stringify(errors)}`);
      expect(errors).toEqual([]);
    } finally { await server.close(); }
  });
}
