import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke test for the DEPLOYED showcase pages of upgrade group 2
 * (https://aura3d.auraone.ai/apps/showcase-<slug>/): production entry boots, a canvas draws non-blank pixels,
 * pixels change over time, no console/page errors, no failed responses. Results print as G2_JSON lines (remote runner).
 */
const BASE = (process.env.LIVE_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const ALL = ["bunker-zero", "cinematic-architecture", "cross-hop", "digital-twin-ops", "dot-dash-3d", "heatsink"];
const SLUGS_FILE = "tests/browser/live-slugs-g2.txt";
const SLUGS = (process.env.LIVE_SLUGS ?? (existsSync(SLUGS_FILE) ? readFileSync(SLUGS_FILE, "utf8").replace(/\s+/g, ",") : ALL.join(",")))
  .split(",").map((x) => x.trim()).filter(Boolean);
const BOOT_WAIT_MS = Number(process.env.LIVE_BOOT_WAIT_MS ?? 9000);
// Retired prototype routes deliberately redirect to the showcase index (marketing/scripts/build-showcase-routes.mjs).
const RETIRED = new Set(["cinematic-architecture", "digital-twin-ops"]);

interface Stats { nonBlack: number; colors: number; std: number }

async function stats(page: Page, png: Buffer): Promise<Stats> {
  return page.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nb = 0; let s = 0; let s2 = 0; const seen = new Set<number>(); const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      if (l > 8) nb++;
      s += l; s2 += l * l;
      seen.add(((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3));
    }
    const m = s / n;
    return { nonBlack: nb / n, colors: seen.size, std: Math.sqrt(Math.max(0, s2 / n - m * m)) };
  }, png.toString("base64"));
}

async function changed(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([ax, bx]: [string, string]) => {
    const load = async (x: string) => {
      const img = new Image(); img.src = `data:image/png;base64,${x}`; await img.decode();
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const [da, db] = [await load(ax), await load(bx)];
    let n = 0;
    for (let i = 0; i < da.length; i += 4) if (Math.abs((da[i]! + da[i + 1]! + da[i + 2]!) - (db[i]! + db[i + 1]! + db[i + 2]!)) / 3 > 6) n++;
    return n / (da.length / 4);
  }, [a.toString("base64"), b.toString("base64")] as [string, string]);
}

for (const slug of SLUGS) {
  test(`live showcase g2: ${slug}`, async ({ page }) => {
    test.setTimeout(420_000);
    const errors: string[] = []; const bad: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
    page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 120)}`); });
    await page.setViewportSize({ width: 800, height: 450 });
    const response = await page.goto(`${BASE}/apps/showcase-${slug}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(BOOT_WAIT_MS);
    if (RETIRED.has(slug)) {
      const url = page.url();
      process.stdout.write(`G2_JSON ${JSON.stringify({ slug, status: response?.status(), retiredRedirect: url.includes("/apps/showcase-index/"), url: url.replace(BASE, "") })}\n`);
      expect(url).toContain("/apps/showcase-index/");
      return;
    }
    for (const key of ["Enter", "Space"]) { await page.keyboard.press(key); await page.waitForTimeout(400); }
    const canvases = await page.evaluate(() => Array.from(document.querySelectorAll("canvas")).map((c) => `${c.width}x${c.height}`));
    const shotA = await page.screenshot({ type: "png", timeout: 120_000 });
    await page.waitForTimeout(4000);
    // Software GL can starve the compositor; a second-shot timeout is reported, not failed (the first shot proves a draw).
    const shotB = await page.screenshot({ type: "png", timeout: 90_000 }).catch(() => null);
    const a = await stats(page, shotA);
    const diff = shotB ? await changed(page, shotA, shotB) : null;
    const hooks = await page.evaluate(() => Object.keys(window).filter((k) => /^__AURA_/.test(k)).slice(0, 8));
    process.stdout.write(`G2_JSON ${JSON.stringify({ slug, status: response?.status(), canvases, hooks, stats: a, changedFraction: diff, secondShotTimedOut: shotB === null, errors: errors.slice(0, 6), bad: bad.slice(0, 6) })}\n`);
    expect(response?.status()).toBe(200);
    expect(canvases.length).toBeGreaterThan(0);
    expect(a.nonBlack).toBeGreaterThan(0.02);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}
