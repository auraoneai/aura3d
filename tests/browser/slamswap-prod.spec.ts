import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

/**
 * slamswap-prod: drives the PRODUCTION build output of /apps/showcase-top-tennis/ (the native Aura Slam route that replaces the
 * legacy game). Remote-only (tools/remote-acr/run.sh, RUN_ID prefix slamswap); never local Playwright.
 */

const OUT = resolve(process.cwd(), process.env.SLAMSWAP_DIR ?? "apps/slamswap-out");
const ROUTE = "/apps/showcase-top-tennis/";
const TYPES: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".wasm": "application/wasm", ".wav": "audio/wav", ".glb": "model/gltf-binary", ".png": "image/png", ".woff2": "font/woff2",
  ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".txt": "text/plain", ".ktx2": "image/ktx2", ".map": "application/json"
};

interface Win extends Window {
  __TOP_TENNIS_CONTROL__: { getState(): Record<string, any> };
  advanceTime(ms: number): void;
  render_game_to_text(): string;
}

let server: Server;
let origin = "";

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = join(OUT, normalize(url).replace(/^(\.\.[/\\])+/, ""));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const addr = server.address();
  origin = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
test.afterAll(async () => { await new Promise<void>((ok) => server.close(() => ok())); });

const state = (page: Page) => page.evaluate(() => (window as unknown as Win).__TOP_TENNIS_CONTROL__.getState());
const advance = (page: Page, ms: number) => page.evaluate((n) => (window as unknown as Win).advanceTime(n), ms);
function expectPanelClean(panel: string): void {
  expect(panel).not.toMatch(/SHADER|FAILED|context lost/i);
  expect(panel).toMatch(/safety: rung 0 \(full\)/);
  expect(panel).toMatch(/black 0\b/);
  expect(panel).toMatch(/no errors captured/);
}
const out = (tag: string, value: unknown) => console.log(`SLAMSWAP ${tag} ${JSON.stringify(value)}`);

test("production Aura Slam route: boots native, menu, Quick Match, pause card, diagnostics clean", async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors: string[] = [];
  const bad: string[] = [];
  const assets: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 300)));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error") errors.push(`console.error ${t}`.slice(0, 300));
    if (/black.?frame|SAFETY_BLACK_FRAME|frame.?tap/i.test(t)) out("frameTapConsole", t.slice(0, 200));
  });
  page.on("response", (r) => {
    const u = r.url();
    if (!u.startsWith(origin)) return;
    if (/\/aura-assets\//.test(u)) assets.push(`${r.status()} ${u.slice(origin.length)}`);
    if (r.status() >= 400) bad.push(`${r.status()} ${u.slice(origin.length)}`);
  });

  await page.goto(`${origin}${ROUTE}?diag=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.auraSlamReady === "true", undefined, { timeout: 420_000 });

  const html = await page.evaluate(() => document.documentElement.outerHTML);
  expect(html).not.toMatch(/busted|spreadsheet|work-sheet/i);
  expect(await page.locator("#work-sheet").count()).toBe(0);
  expect(await page.locator("#match-hud").getAttribute("class")).not.toMatch(/hidden/);
  expect((await state(page)).phase).toBe("serve");
  out("title", await page.title());

  const panelText = async () => (await page.locator("[data-aura3d-safety-panel]").first().innerText().catch(() => "")) || "";
  await advance(page, 1000);
  await page.waitForTimeout(2500);
  let panel = await panelText();
  const dc = Number(/drawCalls=(\d+)/.exec(panel)?.[1] ?? 0);
  out("panel1", panel.slice(0, 600));
  expect(dc).toBeGreaterThan(0);
  expect(dc).toBeLessThanOrEqual(150);
  expectPanelClean(panel);
  await page.screenshot({ path: "tests/reports/slamswap/01-boot.png" });

  await page.locator("#aura-btn-play").click();
  await advance(page, 300);
  await page.keyboard.press("Space");
  expect((await state(page)).phase).toBe("serveToss");
  await advance(page, 900);
  expect(["rally", "serveToss", "serve"]).toContain((await state(page)).phase);
  out("afterServe", { phase: (await state(page)).phase });

  await page.keyboard.press("Backquote");
  await page.keyboard.press("Shift+Backquote");
  expect(await page.locator("#work-sheet").count()).toBe(0);
  expect((await state(page)).paused ?? false).toBe(false);

  await page.keyboard.press("KeyP");
  expect((await state(page)).paused).toBe(true);
  const pauseText = await page.locator("#pause-menu").innerText();
  out("pauseText", pauseText);
  expect(pauseText).not.toMatch(/busted|spreadsheet|\bwork\b/i);
  await page.screenshot({ path: "tests/reports/slamswap/02-pause.png" });
  await page.keyboard.press("KeyP");
  expect((await state(page)).paused).toBe(false);

  await advance(page, 2500);
  await page.screenshot({ path: "tests/reports/slamswap/03-rally.png" });

  await page.locator("#aura-btn-menu").click();
  await expect(page.locator("#menu")).toBeVisible();
  const single = page.locator("#mode-single");
  const tour = page.locator("#mode-tournament");
  const online = page.locator("#mode-online");
  expect(await single.isDisabled()).toBe(false);
  expect(await tour.isDisabled()).toBe(true);
  expect(await online.isDisabled()).toBe(true);
  const menuText = await page.locator("#menu").innerText();
  out("menuText", menuText.replace(/\s+/g, " ").slice(0, 700));
  expect(menuText).toMatch(/coming soon/i);
  expect(menuText).not.toMatch(/busted|spreadsheet/i);
  await page.screenshot({ path: "tests/reports/slamswap/04-menu.png" });
  await page.keyboard.press("Escape");

  await page.locator("#aura-btn-practice").click();
  await advance(page, 500);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "tests/reports/slamswap/05-smash-lab.png" });
  out("practice", { practiceHudHidden: await page.locator("#practice-hud").getAttribute("class") });

  await page.locator("#aura-btn-play").click();
  await advance(page, 2000);
  await page.waitForTimeout(3000);
  panel = await panelText();
  out("panel2", panel.slice(0, 600));
  expect(Number(/drawCalls=(\d+)/.exec(panel)?.[1] ?? 0)).toBeGreaterThan(0);
  expect(Number(/drawCalls=(\d+)/.exec(panel)?.[1] ?? 0)).toBeLessThanOrEqual(150);
  expectPanelClean(panel);

  out("assets", assets);
  out("badResponses", bad);
  out("errors", errors);
  expect(assets.length).toBeGreaterThan(0);
  expect(assets.filter((a) => !a.startsWith("200 "))).toEqual([]);
  expect(bad).toEqual([]);
  expect(errors).toEqual([]);
});
