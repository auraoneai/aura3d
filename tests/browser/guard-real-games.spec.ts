import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import * as esbuild from "esbuild";

/**
 * Real-game check of the draw-sampling black-frame guard (remote only: tools/remote-acr/run.sh, software WebGL2).
 * The deployed 4.1.2 bundles still contain the old guard, so the NEW guard is bundled here and injected before any page
 * script runs; it sets `__AURA3D_HEAL_INSTALLED__`, which makes the games' own (old) guard a no-op. Healthy games must not
 * navigate, and a variant that forces black output (colour writes masked on every draw) must reload exactly once.
 * Software WebGL2 draws these games at several seconds per frame, so the injected guard judges sooner than the production
 * defaults (every frame after 2 ready frames, 3 black samples): a stricter test for healthy pages, a faster one for black.
 */
const BASE = (process.env.LIVE_BASE ?? "https://aura3d.auraone.ai").replace(/\/$/, "");
const GAMES = ["showcase-cross-hop", "showcase-iron-crown", "showcase-bunker-zero"];
const WAIT_MS = 150_000;

async function guardScript(): Promise<string> {
  const entry = resolve(process.cwd(), "packages/debug/src/safety/index.ts");
  const out = await esbuild.build({
    stdin: { contents: `import { installBlackFrameGuard } from ${JSON.stringify(entry)}; installBlackFrameGuard({ watch: { minFramesAfterReady: 2, sampleEvery: 1, samplesNeeded: 3, minBlackMs: 0, blackFramesBudget: 0 } });`, resolveDir: process.cwd(), loader: "ts" },
    bundle: true,
    format: "iife",
    write: false,
    target: "es2020"
  });
  return out.outputFiles[0]!.text;
}

const FORCE_BLACK = `(() => {
  for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
    for (const fn of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
      const o = proto[fn];
      if (!o) continue;
      proto[fn] = function (...a) { this.colorMask(false, false, false, true); return o.apply(this, a); };
    }
    const clear = proto.clear;
    proto.clear = function (m) { this.colorMask(true, true, true, true); this.clearColor(0, 0, 0, 1); const r = clear.call(this, m); return r; };
  }
})();`;

test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);

for (const game of GAMES) {
  test(`healthy real game, new guard on: ${game} is never reloaded`, async ({ page }) => {
    const navs: string[] = [];
    const logs: string[] = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url().replace(BASE, "")); });
    page.on("console", (m) => { if (/SAFETY_|COMPAT_MODE|black/i.test(m.text())) logs.push(m.text().slice(0, 240)); });
    await page.setViewportSize({ width: 640, height: 360 });
    await page.addInitScript({ content: await guardScript() });
    await page.goto(`${BASE}/apps/${game}/`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(WAIT_MS);
    const snap = await page.evaluate(() => {
      const heal = (window as unknown as { __AURA3D_HEAL__?: { rung: number; observation?: () => unknown } }).__AURA3D_HEAL__;
      return { url: location.pathname + location.search, rung: heal?.rung, obs: heal?.observation?.() };
    });
    let img = "";
    try { img = (await page.screenshot({ type: "jpeg", quality: 60, timeout: 90_000 })).toString("base64"); } catch { img = ""; }
    process.stdout.write(`@@GUARDREAL ${game} navs=${JSON.stringify(navs)} logs=${JSON.stringify(logs)} ${JSON.stringify(snap)}\n`);
    if (img) process.stdout.write(`@@GUARDIMG ${game}-healthy ${img}\n`);
    expect(navs, "the page never navigated to a heal rung").toEqual([`/apps/${game}/`]);
    expect(snap.rung).toBe(0);
    const obs = snap.obs as { samples: number; blackSamples: number } | undefined;
    expect(obs?.samples ?? 0, "the guard sampled drawn frames").toBeGreaterThan(0);
    expect(obs?.blackSamples ?? 0, "no sample of a healthy frame read black").toBe(0);
  });
}

test("broken real game (colour writes masked, draws continue): the new guard still fires exactly once", async ({ page }) => {
  const navs: string[] = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url().replace(BASE, "")); });
  await page.setViewportSize({ width: 640, height: 360 });
  await page.addInitScript({ content: FORCE_BLACK });
  await page.addInitScript({ content: await guardScript() });
  await page.goto(`${BASE}/apps/showcase-cross-hop/`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForURL(/a3d-qr=game/, { timeout: 600_000 });
  process.stdout.write(`@@GUARDREAL broken navs=${JSON.stringify(navs)}\n`);
  expect(navs[0]).toBe("/apps/showcase-cross-hop/");
  expect(navs[1]).toContain("a3d-qr=game%2C-vfxFog");
  expect(navs[1]).not.toContain("-post");
});
