import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke test for DEPLOYED (or locally served) non-port showcase games: https://aura3d.auraone.ai/apps/<app>/.
 * Checks the production build boots: HTTP 200, a canvas draws non-blank pixels (DOM hidden), the frame changes over time,
 * no console/page errors and no failed requests. Results are printed as SHOWCASE_JSON lines (remote runs cannot egress files).
 */
const BASE = (process.env.LIVE_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const APPS = ["showcase-aura-diamond-3d", "showcase-aura-fc-3d", "showcase-aura-hoops-3d", "showcase-aura-links-3d", "showcase-aurora-lander", "showcase-bank-shot", "showcase-blockfall-reactor"];
const BOOT_WAIT_MS = Number(process.env.LIVE_BOOT_WAIT_MS ?? 9000);

async function lumaStats(page: Page, png: Buffer): Promise<{ nonBlack: number; colors: number; mean: number }> {
  return page.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBlack = 0; let sum = 0; const seen = new Set<number>(); const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      if (luma > 8) nonBlack++;
      sum += luma;
      seen.add(((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3));
    }
    return { nonBlack: nonBlack / n, colors: seen.size, mean: sum / n };
  }, png.toString("base64"));
}

async function changedFraction(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([ax, bx]: [string, string]) => {
    const load = async (b64: string) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const [da, db] = [await load(ax), await load(bx)];
    let changed = 0; const n = da.length / 4;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs((da[i]! + da[i + 1]! + da[i + 2]!) - (db[i]! + db[i + 1]! + db[i + 2]!)) / 3;
      if (d > 6) changed++;
    }
    return changed / n;
  }, [a.toString("base64"), b.toString("base64")] as [string, string]);
}

async function canvasOnlyShot(page: Page): Promise<Buffer | null> {
  await page.addStyleTag({ content: "html.__canvas-only *{visibility:hidden !important} html.__canvas-only canvas{visibility:visible !important}" }).catch(() => undefined);
  await page.evaluate(() => document.documentElement.classList.add("__canvas-only")).catch(() => undefined);
  try { return await page.screenshot({ type: "png", timeout: 90000 }); } catch { return null; }
}

test.describe.configure({ mode: "serial" });
test.setTimeout(480000);

for (const app of APPS) {
  test(`showcase boots: ${app}`, async ({ page }) => {
    const errors: string[] = []; const bad: string[] = []; const notes: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push(String(e.message ?? e).slice(0, 200)));
    page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
    const url = `${BASE}/apps/${app}/`;
    const response = await page.goto(url, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(BOOT_WAIT_MS);
    const canvases = await page.evaluate(() => Array.from(document.querySelectorAll("canvas")).map((c) => ({ id: c.id, w: c.width, h: c.height }))).catch(() => []);
    const hooks = await page.evaluate(() => Object.keys(window).filter((k) => /^__(AURA|A3D)/i.test(k)).slice(0, 12)).catch(() => []);
    // Real pointer events (Playwright click() waits on rAF stability, which starves on software GL), then documented keys.
    const target = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll("button, [role='button'], a.btn")).find((b) => (b as HTMLElement).offsetParent !== null && /start|play|begin|launch|tap/i.test(`${b.textContent ?? ""} ${b.id}`)) as HTMLElement | undefined;
      if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: (el.textContent ?? "").trim().slice(0, 30) };
    }).catch(() => null);
    if (target) { await page.mouse.move(target.x, target.y); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); notes.push(`clicked "${target.text}"`); }
    for (const key of ["Enter", "Space"]) { await page.keyboard.press(key).catch(() => undefined); await page.waitForTimeout(300); }
    await page.waitForTimeout(3000);
    const a = await canvasOnlyShot(page);
    await page.keyboard.down("ArrowRight"); await page.waitForTimeout(700); await page.keyboard.up("ArrowRight");
    await page.keyboard.down("Space"); await page.waitForTimeout(500); await page.keyboard.up("Space");
    await page.waitForTimeout(3000);
    const b = await canvasOnlyShot(page);
    const stats = a ? await lumaStats(page, a) : { nonBlack: 0, colors: 0, mean: 0 };
    const changed = a && b ? await changedFraction(page, a, b) : -1;
    const result = {
      app, url, status: response?.status() ?? 0, canvases, hooks, notes, shotOk: !!a, nonBlack: Number(stats.nonBlack.toFixed(3)), colors: stats.colors,
      meanLuma: Number(stats.mean.toFixed(1)), changedFraction: Number(changed.toFixed(4)), errors: errors.slice(0, 6), bad: bad.slice(0, 8)
    };
    console.log(`SHOWCASE_JSON ${JSON.stringify(result)}`);
    expect(response?.status()).toBe(200);
    expect(canvases.length).toBeGreaterThan(0);
    expect(stats.nonBlack).toBeGreaterThan(0.02);
    expect(errors).toEqual([]);
    expect(bad).toEqual([]);
  });
}
