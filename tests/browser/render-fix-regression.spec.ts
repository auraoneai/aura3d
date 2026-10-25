import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Render fixes for Cumulus Dash (canvas backing vs renderer viewport at device scale above 1), Duneglide (HUD readout in
 * QA stepping) and Saltwind Highway (hero textures settle). Remote only (tools/remote-acr/run.sh, software WebGL2).
 * Frames: `@@SC <slug> <name> <i> <n> <b64>`; numbers: `@@FIXRC <tag> <json>`.
 */

const emit = (slug: string, name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SC ${slug} ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};
const say = (tag: string, data: unknown): void => { process.stdout.write(`@@FIXRC ${tag} ${JSON.stringify(data)}\n`); };
const raf = (page: Page, n: number) =>
  page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const waitHook = async (page: Page, hook: string): Promise<boolean> => {
  try { await page.waitForFunction((h) => (window as unknown as Record<string, { ready?: boolean }>)[h]?.ready === true, hook, { timeout: 1_500_000, polling: 1000 }); return true; } catch { return false; }
};

interface RegionStats { readonly meanLuma: number; readonly darkFraction: number; readonly whiteFraction: number }
/** Decodes a PNG screenshot in the page and measures a region given as fractions of the frame. */
const region = (page: Page, png: Buffer, box: [number, number, number, number]): Promise<RegionStats> =>
  page.evaluate(async ({ b64, r }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const x0 = Math.floor(r[0] * img.width), y0 = Math.floor(r[1] * img.height), x1 = Math.ceil(r[2] * img.width), y1 = Math.ceil(r[3] * img.height);
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let sum = 0, dark = 0, white = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i]!, G = d[i + 1]!, B = d[i + 2]!;
      const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      sum += l;
      if (l < 10) dark += 1;
      if (Math.min(R, G, B) > 205 && Math.max(R, G, B) - Math.min(R, G, B) < 18) white += 1;
    }
    return { meanLuma: sum / n, darkFraction: dark / n, whiteFraction: white / n };
  }, { b64: png.toString("base64"), r: box });

const canvasInfo = (page: Page) => page.evaluate(() => {
  const c = document.querySelector("canvas")!;
  const r = c.getBoundingClientRect();
  return { width: c.width, height: c.height, rect: [Math.round(r.width), Math.round(r.height)], inner: [window.innerWidth, window.innerHeight], dpr: window.devicePixelRatio };
});

test.describe("render fixes", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const dsf of [1, 2] as const) {
    test(`Cumulus Dash fills the frame at device scale ${dsf} and follows a window resize`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: dsf });
      const page = await ctx.newPage();
      await page.goto(`${server.origin}/examples/kid-goku-beyond-the-clouds-port/?manual=1&quality=low`, { waitUntil: "domcontentloaded" });
      expect(await waitHook(page, "__AURA_KID_GOKU__")).toBe(true);
      await page.evaluate(() => { const a = (window as unknown as Record<string, any>).__AURA_KID_GOKU__; a.begin(); a.settle(20, true); a.play(120, { steer: 0, jump: false, pole: false, nimbus: false, brake: false }); a.settle(2, false); });
      await raf(page, 4);
      const expectedRatio = Math.min(dsf, 1.5);
      const info = await canvasInfo(page);
      say(`cumulus.dsf${dsf}`, info);
      expect(info.width).toBeGreaterThanOrEqual(Math.floor(720 * expectedRatio) - 2);
      expect(info.width).toBeLessThanOrEqual(Math.ceil(720 * expectedRatio) + 2);
      const shot = await page.screenshot({ type: "png" });
      emit("cumulus", `dsf${dsf}`, await page.screenshot({ type: "jpeg", quality: 88 }));
      // the old crop left the top and right thirds of the frame black at device scale 2
      const topRight = await region(page, shot, [0.72, 0.02, 0.98, 0.3]);
      const bottomRight = await region(page, shot, [0.72, 0.7, 0.98, 0.98]);
      say(`cumulus.dsf${dsf}.regions`, { topRight, bottomRight });
      expect(topRight.darkFraction).toBeLessThan(0.2);
      expect(bottomRight.darkFraction).toBeLessThan(0.5);

      await page.setViewportSize({ width: 960, height: 540 });
      await raf(page, 8);
      const resized = await canvasInfo(page);
      say(`cumulus.dsf${dsf}.resized`, resized);
      expect(resized.rect[0]).toBe(960);
      expect(resized.rect[1]).toBe(540);
      expect(resized.width).toBeGreaterThanOrEqual(Math.floor(960 * expectedRatio) - 2);
      await page.evaluate(() => { const a = (window as unknown as Record<string, any>).__AURA_KID_GOKU__; a.settle(2, false); });
      await raf(page, 4);
      const shot2 = await page.screenshot({ type: "png" });
      emit("cumulus", `dsf${dsf}-resized`, await page.screenshot({ type: "jpeg", quality: 88 }));
      const topRight2 = await region(page, shot2, [0.72, 0.02, 0.98, 0.3]);
      say(`cumulus.dsf${dsf}.resized.regions`, { topRight2 });
      expect(topRight2.darkFraction).toBeLessThan(0.2);
      await ctx.close();
    });
  }

  test("Duneglide HUD shows the real speed after QA stepping", async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${server.origin}/examples/silt-and-signal-port/?manual=1&start=1&chapter=0&objective=2`, { waitUntil: "domcontentloaded" });
    expect(await waitHook(page, "__AURA_SILT__")).toBe(true);
    const FLYB = "{ throttle: 1, steer: 0.4, lift: 0, brake: false, boost: true, interact: false }";
    await page.evaluate((d) => { const api = (window as unknown as Record<string, any>).__AURA_SILT__; return new Function("api", d)(api); }, `api.stepFrames(200, ${FLYB}); api.render(); api.render();`);
    await raf(page, 4);
    const read = await page.evaluate(() => {
      const s = (window as unknown as Record<string, any>).__AURA_SILT__.state;
      const v = typeof s === "function" ? s() : s;
      return { hud: Number(document.getElementById("speed")?.textContent), sim: Math.abs(v.flight.speed) };
    });
    say("duneglide.hud", read);
    emit("duneglide", "flight-boost", await page.screenshot({ type: "jpeg", quality: 88 }));
    expect(read.sim).toBeGreaterThan(10);
    expect(Math.abs(read.hud - read.sim)).toBeLessThanOrEqual(1);
    await page.close();
  });

  test("Saltwind Highway hero textures settle", async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${server.origin}/examples/roadster-hours-port/?manual=1`, { waitUntil: "domcontentloaded" });
    expect(await waitHook(page, "__AURA_ROADSTER_HOURS__")).toBe(true);
    await page.evaluate(() => { const a = (window as unknown as Record<string, any>).__AURA_ROADSTER_HOURS__; a.begin(); a.setAutopilot(true); a.stepSteps(700); a.renderNow(); });
    await raf(page, 4);
    const early = await page.screenshot({ type: "png" });
    emit("saltwind", "early", await page.screenshot({ type: "jpeg", quality: 88 }));
    const carBox: [number, number, number, number] = [0.44, 0.56, 0.56, 0.74];
    const earlyCar = await region(page, early, carBox);
    const t0 = Date.now();
    let status: { textured: number; pending: number; total: number; byNode: Record<string, string> } | undefined;
    let heroReady = false;
    while (Date.now() - t0 < 40 * 60_000) {
      status = await page.evaluate(() => { const a = (window as unknown as Record<string, any>).__AURA_ROADSTER_HOURS__; a.renderNow(); return a.textures(); });
      if (status && status.byNode["car-body"] === "textured") { heroReady = true; break; }
      await page.waitForTimeout(5000);
    }
    say("saltwind.settle", { heroReady, seconds: Math.round((Date.now() - t0) / 1000), textured: status?.textured, pending: status?.pending, total: status?.total, hero: status?.byNode["car-body"] });
    await page.evaluate(() => { const a = (window as unknown as Record<string, any>).__AURA_ROADSTER_HOURS__; a.renderNow(); a.renderNow(); });
    await raf(page, 4);
    const late = await page.screenshot({ type: "png" });
    emit("saltwind", "late", await page.screenshot({ type: "jpeg", quality: 88 }));
    const lateCar = await region(page, late, carBox);
    say("saltwind.car", { earlyCar, lateCar });
    expect(heroReady).toBe(true);
    expect(lateCar.whiteFraction).toBeLessThan(Math.max(0.5, earlyCar.whiteFraction - 0.25));
    await page.close();
  });
});
