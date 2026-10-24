import { expect, test, type Page } from "@playwright/test";

/**
 * liveslam: drives the LIVE https://aura3d.auraone.ai/apps/showcase-top-tennis/ (native Aura Slam). Remote-only
 * (tools/remote-acr/run.sh, RUN_ID prefix liveslam). Frames and results are printed as chunked console lines
 * (`LIVESLAM <name> i/n <payload>`) because remote runs cannot egress files.
 */
const BASE = "https://aura3d.auraone.ai";
const ROUTE = "/apps/showcase-top-tennis/";

interface Win extends Window {
  __TOP_TENNIS_CONTROL__?: { getState(): Record<string, any> };
  advanceTime?(ms: number): void;
}

function emit(name: string, payload: unknown, chunk = 60000): void {
  const s = typeof payload === "string" ? payload : JSON.stringify(payload);
  const n = Math.max(1, Math.ceil(s.length / chunk));
  for (let i = 0; i < n; i++) console.log(`LIVESLAM ${name} ${i + 1}/${n} ${s.slice(i * chunk, (i + 1) * chunk)}`);
}
const frame = async (page: Page, name: string) => emit(`FRAME_${name}`, (await page.screenshot({ type: "jpeg", quality: 72 })).toString("base64"));
const state = (page: Page) => page.evaluate(() => (window as unknown as Win).__TOP_TENNIS_CONTROL__?.getState() ?? null);
const panelText = (page: Page) => page.locator("[data-aura3d-safety-panel]").first().innerText().catch(() => "");

test("live Aura Slam: boot, menu, Quick Match, keys, pause, disabled modes, mobile, diagnostics", async ({ browser }) => {
  test.setTimeout(1_200_000);
  const results: Record<string, unknown> = {};
  const checks: Record<string, boolean> = {};
  const errors: string[] = [];
  const bad: string[] = [];
  const assets: string[] = [];
  const guard: string[] = [];

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 300)));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error") errors.push(`console.error ${t}`.slice(0, 300));
    if (/SAFETY_COMPAT_MODE|AURA3D_COMPAT_MODE|SAFETY_BLACK_FRAME|black.?frame|self.?heal/i.test(t)) guard.push(t.slice(0, 200));
  });
  page.on("response", (r) => {
    const u = r.url();
    if (!u.startsWith(BASE)) return;
    if (/\/aura-assets\//.test(u)) assets.push(`${r.status()} ${u.slice(BASE.length)}`);
    if (r.status() >= 400) bad.push(`${r.status()} ${u.slice(BASE.length)}`);
  });

  const resp = await page.goto(`${BASE}${ROUTE}?diag=1`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  results.httpStatus = resp?.status();
  checks.http200 = resp?.status() === 200;
  await page.waitForFunction(() => document.body.dataset.auraSlamReady === "true", undefined, { timeout: 600_000 });
  checks.ready = true;
  results.title = await page.title();

  const html = await page.evaluate(() => document.documentElement.outerHTML);
  checks.noBusted = !/busted|spreadsheet|work-sheet/i.test(html);
  results.scripts = await page.evaluate(() => Array.from(document.scripts).map((s) => s.src.replace(location.origin, "")).filter(Boolean));
  checks.noLegacyScripts = !(results.scripts as string[]).some((s) => /toptennis/i.test(s));
  results.initialState = await state(page);

  await page.waitForTimeout(4000);
  await frame(page, "01_boot");
  let panel = await panelText(page);
  results.panelBoot = panel;
  let dc = Number(/drawCalls=(\d+)/.exec(panel)?.[1] ?? 0);
  results.drawCallsBoot = dc;
  checks.drawCallsBoot = dc > 0 && dc <= 150;
  checks.diagClean = !/SHADER COMPILE FAILED|PROGRAM LINK FAILED|WEBGL CONTEXT LOST/.test(panel) && /safety: rung 0 \(full\)/.test(panel) && /black 0\b/.test(panel) && /no errors captured/.test(panel);

  // Quick Match with real key events (real time, no advanceTime).
  await page.locator("#aura-btn-play").click();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Space");
  await page.waitForTimeout(1500);
  results.afterServeKey = await state(page);
  checks.serveAdvanced = ["serveToss", "serveSwing", "rally", "serve"].includes(String((results.afterServeKey as any)?.phase));
  for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]) {
    await page.keyboard.down(k);
    await page.waitForTimeout(350);
    await page.keyboard.up(k);
  }
  await page.waitForTimeout(2500);
  await frame(page, "02_rally");
  results.afterKeys = await state(page);

  // Pause card.
  await page.keyboard.press("KeyP");
  await page.waitForTimeout(600);
  const pauseState = await state(page);
  results.pausedState = pauseState?.paused;
  checks.paused = pauseState?.paused === true;
  const pauseText = await page.locator("#pause-menu").innerText().catch(() => "");
  results.pauseText = pauseText.replace(/\s+/g, " ").slice(0, 400);
  checks.pauseNoBusted = !/busted|spreadsheet|\bwork\b/i.test(pauseText);
  await frame(page, "03_pause");
  await page.keyboard.press("KeyP");
  await page.waitForTimeout(600);
  checks.resumed = (await state(page))?.paused === false;

  // Modes menu.
  await page.locator("#aura-btn-menu").click();
  await page.waitForTimeout(800);
  checks.menuVisible = await page.locator("#menu").isVisible();
  checks.singleEnabled = !(await page.locator("#mode-single").isDisabled());
  checks.tournamentDisabled = await page.locator("#mode-tournament").isDisabled();
  checks.onlineDisabled = await page.locator("#mode-online").isDisabled();
  const menuText = await page.locator("#menu").innerText().catch(() => "");
  results.menuText = menuText.replace(/\s+/g, " ").slice(0, 700);
  checks.comingSoon = /coming soon/i.test(menuText);
  checks.menuNoBusted = !/busted|spreadsheet/i.test(menuText);
  await frame(page, "04_menu");
  await page.keyboard.press("Escape");

  // Smash Lab.
  await page.locator("#aura-btn-practice").click();
  await page.waitForTimeout(3000);
  await frame(page, "05_smash_lab");
  await page.locator("#aura-btn-play").click();
  await page.waitForTimeout(3000);

  panel = await panelText(page);
  results.panelEnd = panel;
  dc = Number(/drawCalls=(\d+)/.exec(panel)?.[1] ?? 0);
  results.drawCallsEnd = dc;
  checks.drawCallsEnd = dc > 0 && dc <= 150;
  checks.diagCleanEnd = !/SHADER COMPILE FAILED|PROGRAM LINK FAILED|WEBGL CONTEXT LOST/.test(panel) && /safety: rung 0 \(full\)/.test(panel) && /black 0\b/.test(panel) && /no errors captured/.test(panel);
  await ctx.close();

  // Mobile 390x844 with touch.
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const mp = await mctx.newPage();
  mp.on("pageerror", (e) => errors.push(`mobile pageerror ${e.message}`.slice(0, 300)));
  mp.on("console", (m) => { if (m.type() === "error") errors.push(`mobile console.error ${m.text()}`.slice(0, 300)); });
  mp.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) bad.push(`mobile ${r.status()} ${r.url().slice(BASE.length)}`); });
  await mp.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await mp.waitForFunction(() => document.body.dataset.auraSlamReady === "true", undefined, { timeout: 600_000 });
  await mp.locator("#aura-btn-play").click().catch(() => undefined);
  await mp.waitForTimeout(3500);
  await frame(mp, "06_mobile");
  const touch = await mp.evaluate(() => {
    const vis = (id: string) => { const e = document.getElementById(id) as HTMLElement | null; if (!e) return null; const r = e.getBoundingClientRect(); return { hidden: e.hidden, w: Math.round(r.width), h: Math.round(r.height), text: (e.textContent ?? "").trim().slice(0, 20) }; };
    return { controls: vis("touch-controls"), hit: vis("touch-hit"), lob: vis("touch-lob"), joystick: vis("touch-joystick"), scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
  });
  results.mobileTouch = touch;
  checks.mobileHit = !!touch.hit && !touch.hit.hidden && touch.hit.w > 0;
  checks.mobileLob = !!touch.lob && !touch.lob.hidden && touch.lob.w > 0;
  checks.mobileNoHScroll = touch.scrollW <= touch.innerW + 1;
  await mctx.close();

  // ?diag=1 re-check on a fresh load, safety guard did not fire.
  results.guardLines = guard;
  checks.guardDidNotFire = guard.length === 0;
  results.assetCount = assets.length;
  results.assetsNon200 = assets.filter((a) => !a.startsWith("200 "));
  checks.assetsAll200 = assets.length > 0 && (results.assetsNon200 as string[]).length === 0;
  results.badResponses = bad;
  results.errors = errors;
  checks.noBadResponses = bad.length === 0;
  checks.noConsoleErrors = errors.length === 0;
  results.checks = checks;
  emit("RESULTS", results);
  expect(Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
});
