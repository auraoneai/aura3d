import { test, type Page } from "@playwright/test";

/**
 * A/B on the DEPLOYED showcase games: default URL (the app's own qualityRebuild pin) vs the same build with the pinned
 * stages turned back on through the highest-precedence `a3d-qr` URL list. Prints one PINFIX_JSON line per game with
 * non-black fraction, luma mean/stddev, console errors and failed requests before and after a viewport resize
 * (the reported failure mode: the post lane losing its render targets after a device lifecycle event).
 */
const BASE = (process.env.LIVE_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const SLUGS = [
  "top-tennis", "roadster-rush", "heatsink", "teleoperator", "iron-crown", "pips-big-leap", "aura-hoops-3d", "aura-diamond-3d",
  "aura-fc-3d", "red-zone-3d", "aura-links-3d", "bunker-zero", "slingshot-siege", "dot-dash-3d", "cross-hop"
];
const UNPINNED = "game,post,compiler,vfxFog";
const BOOT_MS = Number(process.env.PINFIX_BOOT_MS ?? 14000);

interface Stats { nonBlack: number; mean: number; std: number }

async function stats(lab: Page, png: Buffer): Promise<Stats> {
  return lab.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nb = 0, s = 0, s2 = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      if (l > 8) nb++;
      s += l; s2 += l * l;
    }
    const mean = s / n;
    return { nonBlack: nb / n, mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
  }, png.toString("base64"));
}

async function shot(page: Page): Promise<Buffer | null> {
  try {
    return await page.screenshot({ type: "png", timeout: 120_000 });
  } catch {
    return null;
  }
}

for (const slug of SLUGS) {
  test(`pinfix A/B ${slug}`, async ({ browser }) => {
    test.setTimeout(900_000);
    const lab = await (await browser.newContext()).newPage();
    await lab.goto("about:blank");
    const out: Record<string, unknown> = { slug };
    for (const variant of ["pinned", "unpinned"] as const) {
      const ctx = await browser.newContext({ viewport: { width: 400, height: 240 } });
      const page = await ctx.newPage();
      const errors: string[] = [];
      const failed: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 160)}`));
      page.on("requestfailed", (r) => failed.push(r.url().slice(-80)));
      page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(-80)}`); });
      const url = `${BASE}/apps/showcase-${slug}/${variant === "unpinned" ? `?a3d-qr=${UNPINNED}` : ""}`;
      const rec: Record<string, unknown> = { url };
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForTimeout(BOOT_MS);
        const a = await shot(page);
        rec.before = a ? await stats(lab, a) : "screenshot-timeout";
        await page.setViewportSize({ width: 320, height: 200 });
        await page.waitForTimeout(4000);
        await page.setViewportSize({ width: 400, height: 240 });
        await page.waitForTimeout(6000);
        const b = await shot(page);
        rec.afterResize = b ? await stats(lab, b) : "screenshot-timeout";
        rec.qr = await page.evaluate(() => new URL(location.href).searchParams.get("a3d-qr"));
      } catch (e) {
        rec.error = String((e as Error).message).slice(0, 200);
      }
      rec.consoleErrors = [...new Set(errors)].slice(0, 5);
      rec.failedRequests = [...new Set(failed)].slice(0, 5);
      out[variant] = rec;
      await ctx.close();
    }
    console.log(`PINFIX_JSON ${JSON.stringify(out)}`);
  });
}
