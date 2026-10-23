import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke test for the DEPLOYED port pages (https://aura3d.auraone.ai/apps/showcase-<slug>-port/).
 * The port specs run against the Vite dev server; this one exercises the production build: entry script present,
 * assets/CSS/fonts load, a WebGL canvas boots and draws non-blank pixels, no console/page errors.
 * Remote-runner friendly: results and downsized screenshots are printed into the log (no artifact egress).
 */
const BASE = (process.env.LIVE_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const SLUGS = (process.env.LIVE_SLUGS ?? [
  "strange-orbit", "splat-rush", "serpentine-sky-run", "drift-and-deliver", "heatsink", "ninja-runner",
  "last-train", "roadster-hours", "where-the-wind-wanders", "silt-and-signal", "cloud-runner"
].join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const BOOT_WAIT_MS = Number(process.env.LIVE_BOOT_WAIT_MS ?? 9000);

interface PixelStats { width: number; height: number; nonBlackFraction: number; distinctColors: number; lumaStdDev: number }

async function pixelStats(page: Page, png: Buffer): Promise<PixelStats> {
  return page.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
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
    return { width: c.width, height: c.height, nonBlackFraction: nonBlack / n, distinctColors: seen.size, lumaStdDev: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
  }, png.toString("base64"));
}

for (const slug of SLUGS) {
  test(`live port boots: ${slug}`, async ({ page }) => {
    test.setTimeout(240_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const badResponses: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
    page.on("pageerror", (e) => pageErrors.push(String(e.message ?? e).slice(0, 300)));
    page.on("requestfailed", (r) => failedRequests.push(`${r.url().slice(0, 160)} :: ${r.failure()?.errorText ?? "?"}`));
    page.on("response", (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().slice(0, 160)}`); });

    const url = `${BASE}/apps/showcase-${slug}-port/`;
    const response = await page.goto(url, { waitUntil: "load", timeout: 90_000 });
    const status = response?.status() ?? 0;

    const scripts = await page.evaluate(() => Array.from(document.querySelectorAll("script[src]")).map((s) => (s as HTMLScriptElement).src));
    await page.waitForTimeout(BOOT_WAIT_MS);

    const canvasInfo = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll("canvas"));
      return canvases.map((c) => ({ id: c.id, width: c.width, height: c.height, hasWebgl: (() => { try { return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })() }));
    });
    const hooks = await page.evaluate(() => Object.keys(window).filter((k) => /^__AURA_|^__orbit|^__AURA|^__PORT/i.test(k)).slice(0, 12));

    const shot1 = await page.screenshot({ type: "png" });
    const stats1 = await pixelStats(page, shot1);

    // Press the start control once it is enabled (boot can take a while on software GL), then re-check a gameplay frame.
    let started = false;
    const startButton = page.locator("#start, button#play, [data-action='start'], button.primary").first();
    if (await startButton.count()) {
      try {
        await expect(startButton).toBeEnabled({ timeout: 60_000 });
        await startButton.click({ timeout: 10_000 });
        started = true;
        await page.waitForTimeout(Math.min(BOOT_WAIT_MS, 7000));
      } catch { /* start control may be absent or never enable; the first frame already counts */ }
    }
    const shot2 = await page.screenshot({ type: "png" });
    const stats2 = await pixelStats(page, shot2);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 45, scale: "css" });

    const summary = {
      slug, url, status, scripts: scripts.map((s) => s.replace(BASE, "")), canvases: canvasInfo, hooks, started,
      beforeStart: stats1, afterStart: stats2,
      consoleErrors: consoleErrors.slice(0, 8), pageErrors: pageErrors.slice(0, 8),
      failedRequests: failedRequests.slice(0, 8), badResponses: badResponses.slice(0, 8)
    };
    console.log(`SMOKE_JSON ${JSON.stringify(summary)}`);
    console.log(`SMOKE_IMG ${slug} ${jpeg.toString("base64")}`);

    expect(status, "page status").toBe(200);
    expect(scripts.length, "entry script tag present").toBeGreaterThan(0);
    expect(canvasInfo.length, "a canvas exists").toBeGreaterThan(0);
    const best = stats2.distinctColors >= stats1.distinctColors ? stats2 : stats1;
    expect(best.nonBlackFraction, "canvas draws non-black pixels").toBeGreaterThan(0.02);
    expect(best.distinctColors, "frame has more than a flat colour").toBeGreaterThan(24);
    expect(pageErrors, "no uncaught page errors").toEqual([]);
    expect(consoleErrors, "no console errors").toEqual([]);
    expect(badResponses, "no 4xx/5xx responses").toEqual([]);
  });
}
