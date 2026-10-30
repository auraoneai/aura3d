import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane E3, wave 3. Remote only (tools/remote-acr/run.sh). Two checks on Cumulus Dash (`cloud-runner-port`):
 *  - G25 / CR-E8: the instanced hero trees cast sun shadows on the tree line after SI-1. Variants rewrite served modules:
 *      lane         the branch as is
 *      si1off       `forwardCascadePosition` forced back to the node-centre pick (the pre-SI-1 behaviour)
 *      treesnocast  the two hero-tree instance sets with `castShadow: false` (what the frame looks like with no tree shadows)
 *  - G13 / DD-10: `diagnostics().renderer.shadows` reports the PRD-02 cascades the forward pass samples.
 *      oldcount     the device's shadow-target counter without the `prd02-cascade-` label (the pre-fix count)
 * Output: `E3W3_META <json>` and `E3W3_JPG <variant>-<shot> <i>/<n> <b64>`. Steady state: 30 s after mount, then two renders per point.
 */
const LAB = "/examples/kid-goku-beyond-the-clouds-port/?manual=1";
const CHUNK = 16000;
const POINTS = [60, 520];
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
type Api = Record<string, any>;
declare global { interface Window { __AURA_KID_GOKU__?: Api; __AURA_CUMULUS_DASH__?: Api; __AURA3D_LIVE_APPS__?: { all(): Array<{ diagnostics?: () => any }> } } }

interface Variant { readonly name: string; readonly tag: string; readonly rewrites: readonly [RegExp, readonly [RegExp, string][]][] }
const VARIANTS: readonly Variant[] = [
  { name: "lane", tag: "@w3A", rewrites: [] },
  { name: "si1off", tag: "@w3A", rewrites: [[/packages\/rendering\/src\/forward\/Lighting\.ts/, [[/cascades\.length\s*>\s*1\s*&&\s*forwardInstancedCascadeReceiver\(item\)/, "false"]]]] },
  { name: "treesnocast", tag: "@w3B", rewrites: [[/kid-goku-beyond-the-clouds-port\/world\.ts/, [[/name:\s*"hero-trees-round",\s*\.\.\.heroSet,/, 'name: "hero-trees-round", ...heroSet, castShadow: false,'], [/name:\s*"hero-trees-pine",\s*\.\.\.heroSet,/, 'name: "hero-trees-pine", ...heroSet, castShadow: false,']]]] },
  { name: "oldcount", tag: "@w3B", rewrites: [[/packages\/rendering\/src\/WebGL2Device\.ts/, [[/\|\^prd02-cascade-\/i/, "/i"]]]] }
];

async function measure(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const api = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!;
    api.render(1 / 60);
    const b64: string = await api.capture();
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const w = bmp.width, h = bmp.height, d = ctx.getImageData(0, 0, w, h).data;
    const grid = new Float64Array(16), gridN = new Float64Array(16);
    let sum = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      sum += l;
      const cell = Math.min(3, Math.floor((y / h) * 4)) * 4 + Math.min(3, Math.floor((x / w) * 4));
      grid[cell]! += l; gridN[cell]! += 1;
    }
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return { mean: r2(sum / (w * h)), grid: Array.from(grid, (g, k) => r2(g / gridN[k]!)) };
  });
}

function shadowRows(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const app = window.__AURA3D_LIVE_APPS__?.all()?.[0];
    const d = app?.diagnostics?.() ?? null;
    const row = d?.renderer?.shadows ?? null;
    const sun = (d?.shadows?.shadows ?? []).find((s: { light?: string }) => s.light === "sun") ?? null;
    return {
      renderer: row ? { enabled: row.enabled, requested: row.requested, mapRendered: row.mapRendered, mapSampled: row.mapSampled, nativeShadowMapBindings: row.nativeShadowMapBindings, shadowRenderTargetsAllocated: row.shadowRenderTargetsAllocated, observedCascades: Array.isArray(row.observed?.cascades) ? row.observed.cascades.length : null } : null,
      sun: sun ? { cascadeCount: sun.cascadeCount, skippedCascades: sun.skippedCascades, sampled: sun.sampled } : null
    };
  });
}

test.describe("audit e3 wave 3: Cumulus Dash tree line and renderer shadow row", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const v of VARIANTS) {
    test(`w3 ${v.name} ${v.tag}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`E3W3_ERR ${v.name} ${e.message.slice(0, 300)}`));
      const applied: boolean[] = [];
      for (const [file, edits] of v.rewrites) {
        await page.route(file, async (route) => {
          const res = await route.fetch();
          let body = await res.text();
          for (const [re, to] of edits) { applied.push(re.test(body)); body = body.replace(re, to); }
          await route.fulfill({ response: res, body });
        });
      }
      await page.setViewportSize({ width: 960, height: 540 });
      await page.goto(`${server.origin}${LAB}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)?.ready === true, undefined, { timeout: 900_000, polling: 1000 });
      log(`E3W3_META ${JSON.stringify({ variant: v.name, applied })}`);
      await page.evaluate(() => { const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!; a.place(60); a.settle(2); });
      await page.waitForTimeout(30_000);
      for (const s of POINTS) {
        await page.evaluate((at) => { const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!; a.place(at); a.settle(3); }, s);
        await measure(page);
        const later = await measure(page);
        log(`E3W3_META ${JSON.stringify({ variant: v.name, shot: `s-${s}`, later, shadows: await shadowRows(page) })}`);
        const b64 = await page.evaluate(async () => (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!.frame(960, 540, 0.85) as Promise<string>);
        const n = Math.ceil(b64.length / CHUNK);
        for (let i = 0; i < n; i++) log(`E3W3_JPG ${v.name}-s-${s} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
      }
      log(`E3W3_DONE ${v.name}`);
    });
  }
});
