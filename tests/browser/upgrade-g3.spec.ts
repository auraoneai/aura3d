import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Group-3 showcase upgrade check (iron-crown, pips-big-leap, roadster-rush(-v2), slingshot-siege,
 * teleoperator(-v2)). Mode comes from tests/browser/upgrade-g3-mode.txt (remote runs cannot forward env):
 *   "live" (default) -> https://aura3d.auraone.ai (production build), "dev" -> the repo example dev server (does NOT resolve the vite-only aliases such as @aura3d/engine/game; use "live").
 * Reports console errors/warnings (incl. deprecation notices), failed requests, canvas pixels (HUD hidden),
 * a Start attempt and frame/state change. Results are printed as G3_JSON lines (no artifact egress).
 */
const MODE_FILE = "tests/browser/upgrade-g3-mode.txt";
const MODE = (existsSync(MODE_FILE) ? readFileSync(MODE_FILE, "utf8").trim() : "live").split(/\s+/)[0] || "live";
const APPS_FILE = "tests/browser/upgrade-g3-apps.txt";
const ALL_APPS = ["iron-crown", "pips-big-leap", "roadster-rush", "slingshot-siege", "teleoperator"];
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

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T, ms = 25_000): Promise<{ value: T; error: string | null }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const value = await Promise.race([fn(), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms); })]);
    return { value, error: null };
  } catch (e) { return { value: fallback, error: `${label}: ${String((e as Error)?.message ?? e).slice(0, 140)}` }; } finally { if (timer) clearTimeout(timer); }
}

let server: ExampleDevServer | null = null;
test.beforeAll(async () => { if (MODE === "dev") server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

for (const app of APPS) {
  test(`g3 ${MODE}: ${app}`, async ({ page }) => {
    test.setTimeout(420_000);
    const url = MODE === "live" ? `https://aura3d.auraone.ai/apps/showcase-${app}/` : `${server!.origin}/apps/showcase-${app}/index.html`;
    const consoleLines: string[] = []; const pageErrors: string[] = []; const failed: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleLines.push(`${m.type()}: ${m.text().slice(0, 220)}`); });
    page.on("pageerror", (e) => pageErrors.push(String(e.message ?? e).slice(0, 220)));
    page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 140)}`); });
    page.on("requestfailed", (r) => failed.push(`FAILED ${r.url().slice(0, 140)}`));
    await page.setViewportSize({ width: 320, height: 180 });
    const stepErrors: string[] = [];
    const note = (e: string | null): void => { if (e) stepErrors.push(e); };
    const nav = await safe("goto", () => page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 }), null, 100_000);
    note(nav.error);
    const resp = nav.value;
    await page.waitForTimeout(BOOT_WAIT_MS);
    const canvasesR = await safe("canvases", () => page.evaluate(() => Array.from(document.querySelectorAll("canvas")).map((c) => ({ w: c.width, h: c.height }))), [] as Array<{ w: number; h: number }>);
    note(canvasesR.error);
    const snap0R = await safe("hook0", () => hookSnapshot(page), { hooks: [] as string[], nums: {} as Record<string, number>, drawCalls: null as number | null });
    note(snap0R.error);
    // eslint-disable-next-line no-console
    console.log(`G3_BOOT ${JSON.stringify({ app, mode: MODE, status: resp?.status() ?? 0, canvases: canvasesR.value, hooks: snap0R.value.hooks, drawCalls: snap0R.value.drawCalls, console: consoleLines.slice(0, 10), pageErrors: pageErrors.slice(0, 5), failed: failed.slice(0, 10) })}`);
    const beforeR = await safe("shot0", () => canvasShot(page), null as Buffer | null, 60_000);
    note(beforeR.error);
    const pxBefore = beforeR.value ? (await safe("px0", () => pixelStats(page, beforeR.value!), { nonBlackFraction: 0, distinctColors: 0, lumaStdDev: 0 })).value : { nonBlackFraction: 0, distinctColors: 0, lumaStdDev: 0 };
    const startedR = await safe("start", () => tryStart(page), "none", 30_000);
    note(startedR.error);
    const keys = ["ArrowRight", "ArrowUp", "Space", "KeyW", "KeyD"];
    for (let i = 0; i < 5; i++) {
      const k = keys[i]!;
      note((await safe("keydown", () => page.keyboard.down(k), undefined, 15_000)).error);
      await page.waitForTimeout(300);
      note((await safe("keyup", () => page.keyboard.up(k), undefined, 15_000)).error);
    }
    await page.waitForTimeout(2500);
    const afterR = await safe("shot1", () => canvasShot(page), null as Buffer | null, 60_000);
    note(afterR.error);
    const after = afterR.value; const before = beforeR.value;
    const pxAfter = after ? (await safe("px1", () => pixelStats(page, after), { nonBlackFraction: 0, distinctColors: 0, lumaStdDev: 0 })).value : { nonBlackFraction: 0, distinctColors: 0, lumaStdDev: 0 };
    const snap1R = await safe("hook1", () => hookSnapshot(page), snap0R.value);
    note(snap1R.error);
    const snap0 = snap0R.value; const snap1 = snap1R.value;
    const changed = before && after ? (await safe("diff", () => changedFraction(page, before, after), 0)).value : 0;
    const advanced = Object.keys(snap1.nums).filter((k) => k in snap0.nums && Math.abs(snap0.nums[k]! - snap1.nums[k]!) > 1e-6).slice(0, 6);
    const deprecations = consoleLines.filter((l) => /deprecat|removed in 4\.1|a3d-migrate/i.test(l));
    const started = startedR.value;
    const canvases = canvasesR.value;
    const result = { app, mode: MODE, status: resp?.status() ?? 0, canvases, started, pxBefore, pxAfter, frameChanged: Number(changed.toFixed(4)), hooks: snap1.hooks, drawCalls: snap1.drawCalls ?? snap0.drawCalls, stateAdvanced: advanced, deprecations: deprecations.slice(0, 5), console: consoleLines.slice(0, 8), pageErrors: pageErrors.slice(0, 5), failed: failed.slice(0, 8), stepErrors: stepErrors.slice(0, 6) };
    // eslint-disable-next-line no-console
    console.log(`G3_JSON ${JSON.stringify(result)}`);
    const small = !after ? "" : await page.evaluate(async (b64: string) => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); const c = document.createElement("canvas"); c.width = 320; c.height = Math.round(320 * img.naturalHeight / img.naturalWidth); c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.5).split(",")[1]!; }, after.toString("base64"));
    // eslint-disable-next-line no-console
    console.log(`G3_IMG ${app} ${small}`);
    expect(resp?.status() ?? 0).toBeLessThan(400);
    expect(pageErrors, "page errors").toEqual([]);
    expect(pxAfter.nonBlackFraction + pxBefore.nonBlackFraction, "canvas not blank").toBeGreaterThan(0.02);
    expect(stepErrors, "page stayed responsive").toEqual([]);
  });
}
