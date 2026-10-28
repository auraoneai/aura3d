import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Group-4 showcase upgrade check (top-tennis(-v2), vault-breakers, webgpu-particle-lab, bean-brawl-race, kart-havoc,
 * turbo-ball, asset-audition, data-galaxy, material-asset-inspector, product-configurator, smart-city-control). Mode comes from tests/browser/upgrade-g4-mode.txt (remote runs cannot forward env):
 *   "live" -> https://aura3d.auraone.ai (production build), "dev" (default) -> the repo example dev server.
 * Reports console errors/warnings (incl. deprecation notices), failed requests, canvas pixels (HUD hidden),
 * a Start attempt and frame/state change. Results are printed as G4_JSON lines (no artifact egress).
 */
const MODE_FILE = "tests/browser/upgrade-g4-mode.txt";
const MODE = (existsSync(MODE_FILE) ? readFileSync(MODE_FILE, "utf8").trim() : "dev").split(/\s+/)[0] || "dev";
const APPS_FILE = "tests/browser/upgrade-g4-apps.txt";
const ALL_APPS = ["top-tennis", "vault-breakers", "webgpu-particle-lab", "bean-brawl-race", "kart-havoc", "turbo-ball", "asset-audition", "data-galaxy", "material-asset-inspector", "product-configurator", "smart-city-control"];
const APPS = (existsSync(APPS_FILE) ? readFileSync(APPS_FILE, "utf8").split(/\s+/).filter(Boolean) : ALL_APPS);
const BOOT_WAIT_MS = 9000;

interface Px { nonBlackFraction: number; distinctColors: number; lumaStdDev: number }

async function pixelStats(page: Page, png: Buffer): Promise<Px> {
  return page.evaluate(async (b64: string) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBlack = 0; let sum = 0; let sum2 = 0; const seen = new Set<number>(); const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]!; const g = d[i + 1]!; const b = d[i + 2]!;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (l > 8) nonBlack++;
      sum += l; sum2 += l * l; seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
    }
    const mean = sum / n;
    return { nonBlackFraction: nonBlack / n, distinctColors: seen.size, lumaStdDev: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
  }, png.toString("base64"));
}

async function changedFraction(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(async ([ax, bx]: [string, string]) => {
    const load = async (s: string) => { const img = new Image(); img.src = `data:image/png;base64,${s}`; await img.decode(); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext("2d")!; x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const [da, db] = [await load(ax), await load(bx)]; let ch = 0; const n = da.length / 4;
    for (let i = 0; i < da.length; i += 4) if (Math.abs((da[i]! + da[i + 1]! + da[i + 2]!) - (db[i]! + db[i + 1]! + db[i + 2]!)) / 3 > 6) ch++;
    return ch / n;
  }, [a.toString("base64"), b.toString("base64")] as [string, string]);
}

async function canvasShot(page: Page): Promise<Buffer> {
  await page.addStyleTag({ content: "body *:not(canvas):not(html):not(body){visibility:hidden !important} canvas{visibility:visible !important}" }).catch(() => undefined);
  const png = await page.screenshot({ type: "png" });
  await page.evaluate(() => { document.querySelectorAll("style").forEach((s) => { if (s.textContent?.includes("visibility:hidden !important")) s.remove(); }); }).catch(() => undefined);
  return png;
}

async function hookSnapshot(page: Page): Promise<{ hooks: string[]; nums: Record<string, number>; drawCalls: number | null }> {
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const hooks = Object.keys(w).filter((k) => /^__[A-Z0-9_]+__$/.test(k) && !/ERROR|PORT_MODULES/.test(k));
    const nums: Record<string, number> = {}; let drawCalls: number | null = null;
    const flatten = (v: unknown, p: string, d: number): void => {
      if (typeof v === "number" && Number.isFinite(v)) { nums[p] = v; if (/drawCalls$/i.test(p)) drawCalls = Math.max(drawCalls ?? 0, v); return; }
      if (d >= 3 || v === null || typeof v !== "object") return;
      for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 50)) flatten(x, `${p}.${k}`, d + 1);
    };
    for (const h of hooks.slice(0, 4)) {
      const o = w[h] as Record<string, unknown> | undefined;
      for (const name of ["state", "snapshot", "getState", "evidence", "summary", "stats", "diagnostics"]) {
        try { const m = o?.[name]; const val = typeof m === "function" ? (m as () => unknown)() : m; if (val && typeof val === "object") { flatten(val, `${h}.${name}`, 0); break; } } catch { /* needs args */ }
      }
      if (o && typeof o === "object") flatten(o, h, 1);
    }
    return { hooks, nums, drawCalls };
  });
}

async function tryStart(page: Page): Promise<string> {
  const button = page.locator("button, [role=button], a.button, .btn").filter({ hasText: /start|play|launch|begin|enter|drive|continue|deploy|serve|new game/i }).first();
  if (await button.count()) {
    const box = await button.boundingBox().catch(() => null);
    if (box) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => undefined); return `click:${(await button.innerText().catch(() => "?")).slice(0, 24)}`; }
  }
  await page.keyboard.press("Enter"); await page.keyboard.press("Space");
  return "keys";
}

let server: ExampleDevServer | null = null;
test.beforeAll(async () => { if (MODE === "dev") server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

for (const app of APPS) {
  test(`g4 ${MODE}: ${app}`, async ({ page }) => {
    test.setTimeout(240_000);
    const url = MODE === "live" ? `https://aura3d.auraone.ai/apps/showcase-${app}/` : `${server!.origin}/apps/showcase-${app}/index.html`;
    const consoleLines: string[] = []; const pageErrors: string[] = []; const failed: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleLines.push(`${m.type()}: ${m.text().slice(0, 220)}`); });
    page.on("pageerror", (e) => pageErrors.push(String(e.message ?? e).slice(0, 220)));
    page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 140)}`); });
    page.on("requestfailed", (r) => failed.push(`FAILED ${r.url().slice(0, 140)}`));
    await page.setViewportSize({ width: 800, height: 450 });
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(BOOT_WAIT_MS);
    const canvases = await page.evaluate(() => Array.from(document.querySelectorAll("canvas")).map((c) => ({ w: c.width, h: c.height })));
    const before = await canvasShot(page); const pxBefore = await pixelStats(page, before); const snap0 = await hookSnapshot(page);
    const started = await tryStart(page);
    for (let i = 0; i < 8; i++) { await page.keyboard.down(["ArrowRight", "ArrowUp", "Space", "KeyW", "KeyD"][i % 5]!); await page.waitForTimeout(260); await page.keyboard.up(["ArrowRight", "ArrowUp", "Space", "KeyW", "KeyD"][i % 5]!); }
    await page.waitForTimeout(3000);
    const after = await canvasShot(page); const pxAfter = await pixelStats(page, after); const snap1 = await hookSnapshot(page);
    const changed = await changedFraction(page, before, after);
    const advanced = Object.keys(snap1.nums).filter((k) => k in snap0.nums && Math.abs(snap0.nums[k]! - snap1.nums[k]!) > 1e-6).slice(0, 6);
    const deprecations = consoleLines.filter((l) => /deprecat|removed in 4\.1|a3d-migrate/i.test(l));
    const result = { app, mode: MODE, status: resp?.status() ?? 0, canvases, started, pxBefore, pxAfter, frameChanged: Number(changed.toFixed(4)), hooks: snap1.hooks, drawCalls: snap1.drawCalls, stateAdvanced: advanced, deprecations: deprecations.slice(0, 5), console: consoleLines.slice(0, 8), pageErrors: pageErrors.slice(0, 5), failed: failed.slice(0, 8) };
    // eslint-disable-next-line no-console
    console.log(`G4_JSON ${JSON.stringify(result)}`);
    const small = await page.evaluate(async (b64: string) => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); const c = document.createElement("canvas"); c.width = 320; c.height = Math.round(320 * img.naturalHeight / img.naturalWidth); c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.5).split(",")[1]!; }, after.toString("base64"));
    // eslint-disable-next-line no-console
    console.log(`G4_IMG ${app} ${small}`);
    expect(resp?.status() ?? 0).toBeLessThan(400);
    expect(pageErrors, "page errors").toEqual([]);
    expect(pxAfter.nonBlackFraction + pxBefore.nonBlackFraction, "canvas not blank").toBeGreaterThan(0.02);
  });
}
