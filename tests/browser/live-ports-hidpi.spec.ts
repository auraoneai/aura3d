import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * The deployed ports at the owner's real display: a 1780x1150 CSS viewport at devicePixelRatio 2 (a MacBook Chrome window).
 * The other live specs run 800x600 at DPR 1, where every quality tier and canvas-sizing path differs from a real laptop.
 * Prints SMOKE_JSON / SMOKE_IMG lines (remote-runner friendly) and asserts a lit, non-black world drawn by the canvas alone.
 */
const BASE = (process.env.LIVE_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const SLUGS_FILE = "tests/browser/hidpi-slugs.txt";
const SLUGS = (process.env.LIVE_SLUGS ?? (existsSync(SLUGS_FILE) ? readFileSync(SLUGS_FILE, "utf8").replace(/\s+/g, ",") : "drift-and-deliver,silt-and-signal,last-train"))
  .split(",").map((x) => x.trim()).filter(Boolean);
const START_SELECTOR: Record<string, string> = {
  "splat-rush": "#btn-start", "silt-and-signal": "#start-button", "cloud-runner": "button[data-a='play']", "where-the-wind-wanders": "#wwui-begin"
};

test.use({ viewport: { width: 1780, height: 1150 }, deviceScaleFactor: 2 });

interface Stats { width: number; height: number; nonBlackFraction: number; lumaMean: number; lumaStdDev: number; distinctColors: number }

async function pixelStats(page: Page, png: Buffer): Promise<Stats> {
  return page.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = Math.min(img.naturalWidth, 1200); c.height = Math.round(img.naturalHeight * (c.width / img.naturalWidth));
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBlack = 0; let sum = 0; let sum2 = 0; const seen = new Set<number>(); const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]!; const g = d[i + 1]!; const b = d[i + 2]!;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (luma > 8) nonBlack++;
      sum += luma; sum2 += luma * luma;
      seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    }
    const mean = sum / n;
    return { width: img.naturalWidth, height: img.naturalHeight, nonBlackFraction: nonBlack / n, lumaMean: mean, lumaStdDev: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), distinctColors: seen.size };
  }, png.toString("base64"));
}

async function canvasOnlyShot(page: Page): Promise<Buffer> {
  await page.addStyleTag({ content: "html.__canvas-only *{visibility:hidden !important} html.__canvas-only canvas{visibility:visible !important}" });
  await page.evaluate(() => document.documentElement.classList.add("__canvas-only"));
  const shot = await page.screenshot({ type: "png" });
  await page.evaluate(() => document.documentElement.classList.remove("__canvas-only"));
  return shot;
}

for (const slug of SLUGS) {
  test(`live port at hidpi: ${slug}`, async ({ page }) => {
    test.setTimeout(900_000);
    const consoleMsgs: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 400)}`); });
    page.on("pageerror", (e) => pageErrors.push(String(e.message ?? e).slice(0, 400)));
    await page.goto(`${BASE}/apps/showcase-${slug}-port/`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(12_000);

    const gl = await page.evaluate(() => {
      const c = document.createElement("canvas");
      const g = c.getContext("webgl2");
      if (!g) return null;
      const ext = g.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
      const p = (k: number): unknown => g.getParameter(k);
      return {
        renderer: ext ? p(ext.UNMASKED_RENDERER_WEBGL) : p(g.RENDERER), maxTextureSize: p(g.MAX_TEXTURE_SIZE), maxUnits: p(g.MAX_TEXTURE_IMAGE_UNITS),
        maxSamples: p(g.MAX_SAMPLES), dpr: devicePixelRatio, hasGpu: "gpu" in navigator
      };
    });
    const canvases = await page.evaluate(() => Array.from(document.querySelectorAll("canvas")).map((c) => ({ id: c.id, w: c.width, h: c.height, css: [c.clientWidth, c.clientHeight] })));

    const target = await page.evaluate(([sel]) => {
      const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === "fixed";
      const el = (document.querySelector(sel as string) as HTMLButtonElement | null)
        ?? (Array.from(document.querySelectorAll("button, [role='button']")) as HTMLButtonElement[]).find((b) => visible(b) && /start|begin|play/i.test(`${b.textContent ?? ""} ${b.id}`)) ?? null;
      if (!el || !visible(el)) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: !!el.disabled };
    }, [START_SELECTOR[slug] ?? "#start"] as [string]);
    if (target && !target.disabled) { await page.mouse.move(target.x, target.y); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); }
    else { for (const key of ["Enter", "Space"]) { await page.keyboard.press(key); await page.waitForTimeout(300); } }
    await page.waitForTimeout(4000);
    if (slug === "last-train") { for (const key of ["KeyE", "KeyW"]) { await page.keyboard.down(key); await page.waitForTimeout(1500); await page.keyboard.up(key); } }
    await page.waitForTimeout(4000);

    const canvasShot = await canvasOnlyShot(page);
    const stats = await pixelStats(page, canvasShot);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 50, scale: "css" });
    const diag = await page.evaluate(() => {
      const w = window as unknown as Record<string, Record<string, unknown>>;
      const hook = Object.keys(w).find((k) => /^__AURA_(?!PORT_MODULES|LIVE_APPS|ROUTE_READY)[A-Z0-9_]+__$/.test(k));
      const h = hook ? w[hook] : null;
      const out: Record<string, unknown> = { hook };
      for (const name of ["diagnostics", "diag", "info"]) {
        try { const m = h?.[name]; const v = typeof m === "function" ? (m as () => unknown)() : m; if (v) out[name] = JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isFinite(x) ? null : x)).slice(0, 2500)); } catch { /* accessor needs arguments */ }
      }
      return out;
    }).catch(() => ({}));
    console.log(`HIDPI_JSON ${JSON.stringify({ slug, gl, canvases, stats, consoleMsgs: consoleMsgs.slice(0, 12), pageErrors: pageErrors.slice(0, 6), diag })}`);
    console.log(`HIDPI_IMG ${slug} ${jpeg.toString("base64")}`);

    expect(pageErrors, "no uncaught page errors").toEqual([]);
    expect(stats.nonBlackFraction, "canvas-only frame is not black at hidpi").toBeGreaterThan(0.3);
    expect(stats.lumaStdDev, "canvas-only frame has detail at hidpi").toBeGreaterThan(8);
    expect(stats.distinctColors, "canvas-only frame is more than a flat colour at hidpi").toBeGreaterThan(40);
  });
}
