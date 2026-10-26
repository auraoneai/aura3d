import { test, type BrowserContext, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { emit } from "./shotsd-lib";

// Gameplay particle audit (remote only, software WebGL2, this checkout through the dev server, missing binaries fetched from production):
// drive a real round / bout / match with ?vfxdebug=1 and print every live runtime emitter, its age and particle count after each event.
test.setTimeout(3_000_000);

async function fillFromProduction(context: BrowserContext, origin: string): Promise<void> {
  await context.route(/\.(glb|gltf|ktx2|png|jpe?g|webp|wav|mp3|ogg|bin|woff2?)(\?.*)?$/i, async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.continue();
    const local = await route.fetch().catch(() => null);
    if (local && local.status() < 400) return route.fulfill({ response: local });
    const remote = await route.fetch({ url: `https://aura3d.auraone.ai${url.pathname}${url.search}` }).catch(() => null);
    if (remote) return route.fulfill({ response: remote });
    return route.continue();
  });
}

async function vfx(page: Page, slug: string, label: string): Promise<void> {
  const snap = await page.evaluate(() => {
    const f = (window as unknown as { __AURA_VFX_DEBUG__?: () => unknown }).__AURA_VFX_DEBUG__;
    return f ? f() : null;
  }).catch(() => null) as null | { time: number; live: number; transients: { id: string; age: number; live: number; emissionRate: number }[]; scene: string[]; notes: { code: string; nodeId: string }[] };
  if (!snap) { console.log("HF432_VFX", slug, label, "NO_DEBUG_HOOK"); return; }
  const oldest = snap.transients.reduce((m, t) => Math.max(m, t.age), 0);
  const emitting = snap.transients.filter((t) => t.emissionRate > 0 && t.live > 0).map((t) => `${t.id}@${t.age}s`);
  console.log("HF432_VFX", slug, label, JSON.stringify({ t: Number(snap.time.toFixed(1)), live: snap.live, transients: snap.transients.length, oldestAge: oldest, emitting, scene: snap.scene.length, notes: [...new Set(snap.notes.map((n) => n.code))] }));
}

async function boot(page: Page, origin: string, route: string): Promise<void> {
  // A page-side poller records the peak live count and every emitter that is still alive more than 2.5 s after it was spawned, between reports.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, any>;
    w.__vfxPoll = { maxLive: 0, maxTransients: 0, survivors: {} as Record<string, number>, spawnedIds: {} as Record<string, number> };
    setInterval(() => {
      const f = w.__AURA_VFX_DEBUG__;
      if (!f) return;
      const snap = f();
      const p = w.__vfxPoll;
      p.maxLive = Math.max(p.maxLive, snap.live);
      p.maxTransients = Math.max(p.maxTransients, snap.transients.length);
      for (const t of snap.transients) {
        p.spawnedIds[t.id.replace(/\d+$/, "")] = (p.spawnedIds[t.id.replace(/\d+$/, "")] ?? 0) + 0;
        if (t.age > 2.5 && t.live > 0) p.survivors[t.id] = Math.max(p.survivors[t.id] ?? 0, t.age);
      }
    }, 200);
  });
  await page.goto(`${origin}${route}?vfxdebug=1`, { waitUntil: "load", timeout: 180_000 });
  await page.waitForFunction(() => Boolean(document.querySelector("canvas")), undefined, { timeout: 240_000 });
  await page.waitForTimeout(14_000);
}

async function poll(page: Page, slug: string, label: string): Promise<void> {
  const p = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const r = w.__vfxPoll ? { maxLive: w.__vfxPoll.maxLive, maxTransients: w.__vfxPoll.maxTransients, survivors: w.__vfxPoll.survivors } : null;
    if (w.__vfxPoll) { w.__vfxPoll.maxLive = 0; w.__vfxPoll.maxTransients = 0; w.__vfxPoll.survivors = {}; }
    return r;
  }).catch(() => null);
  console.log("HF432_POLL", slug, label, JSON.stringify(p));
}

test("hf432 links round", async ({ browser }) => {
  const server = await startExampleDevServer();
  const context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  await fillFromProduction(context, server.origin);
  const page = await context.newPage();
  await boot(page, server.origin, "/apps/showcase-aura-links-3d/");
  const state = () => page.evaluate(() => {
    const e = (window as unknown as Record<string, any>)["__AURA3D_SHOWCASE_AURA_LINKS_3D__"];
    return e ? { phase: e.phase, strokes: e.strokes, lie: e.lie, status: e.ball?.status ?? null } : null;
  }).catch(() => null);
  for (let stroke = 1; stroke <= 9; stroke++) {
    for (let i = 0; i < 60; i++) { const s = await state(); if (s?.phase === "aim") break; await page.waitForTimeout(1_000); }
    const before = await state();
    await page.keyboard.press("Space"); await page.waitForTimeout(1_100);
    await page.keyboard.press("Space"); await page.waitForTimeout(500);
    await page.keyboard.press("Space");
    await page.waitForTimeout(2_500);
    for (let i = 0; i < 90; i++) { const s = await state(); if (s?.phase === "aim" || s?.phase === "holeout" || s?.phase === "scorecard") break; await page.waitForTimeout(1_000); }
    const after = await state();
    await vfx(page, "links", `stroke${stroke}-landed lie=${before?.lie}->${after?.lie} phase=${after?.phase}`);
    await poll(page, "links", `stroke${stroke}`);
    await page.waitForTimeout(10_000);
    await vfx(page, "links", `stroke${stroke}-idle10`);
    emit("links", "round", `stroke${stroke}`, await page.screenshot({ type: "jpeg", quality: 80, timeout: 120_000 }));
  }
  await context.close();
  await server.close();
});

const SAMPLED: ReadonlyArray<readonly [string, string, string | undefined, string[]]> = [
  ["fc", "/apps/showcase-aura-fc-3d/", undefined, ["KeyE", "Space", "KeyD", "KeyJ", "KeyK"]],
  ["iron-crown", "/apps/showcase-iron-crown/", "#ic-autopilot", ["KeyJ", "KeyK", "KeyL", "KeyD"]],
  ["hoops", "/apps/showcase-aura-hoops-3d/", undefined, ["KeyE", "Space", "KeyD", "KeyW"]],
  ["diamond", "/apps/showcase-aura-diamond-3d/", undefined, ["Space", "KeyE", "KeyD"]]
];
for (const [slug, route, auto, keys] of SAMPLED) {
  test(`hf432 ${slug} sampled`, async ({ browser }) => {
    const server = await startExampleDevServer();
    const context = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    await fillFromProduction(context, server.origin);
    const page = await context.newPage();
    await boot(page, server.origin, route);
    if (auto) await page.locator(auto).first().evaluate((n) => (n as HTMLElement).click()).catch(() => undefined);
    for (let step = 0; step < 14; step++) {
      for (const k of keys) { await page.keyboard.down(k); await page.waitForTimeout(280); await page.keyboard.up(k); await page.waitForTimeout(350); }
      await page.waitForTimeout(3_000);
      await vfx(page, slug, `step${step}`);
      await poll(page, slug, `step${step}`);
      if (step % 4 === 3) emit(slug, "round", `step${step}`, await page.screenshot({ type: "jpeg", quality: 80, timeout: 120_000 }));
    }
    await page.waitForTimeout(10_000);
    await vfx(page, slug, "idle10-after");
    await context.close();
    await server.close();
  });
}
