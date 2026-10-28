import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * PRD-2 WP-3 shadow filter tiers: remote A/B (tools/remote-acr/run.sh; software WebGL2, never a GPU timing).
 *
 *  - forest timing: the forest-10k frame plan (tests/browser/forest-10k.spec.ts) with the PCF tap tier left on its default (dense
 *    instanced casters -> 8 taps, opted in with `?densetaps=on`) and with the tier pinned to 32 (`?shadowtaps=32`, the pre-tier behaviour). One test per line so the
 *    runs are selected as `<spec>:<line>` and run on separate runners.
 *  - visual: shadow-heavy showcase routes and the forest, captured with the tier pinned to 32 twice (noise floor), with the default
 *    tier, and with the tier forced to 8, compared with the visual-regression metric of direct-path-parity.spec.ts (mean abs diff
 *    <= 2/255, interior max <= 6/255, silhouettes capped separately).
 *
 * Output: `SHADOWTIER_AB <json>` lines plus PERFCOST_CHUNK blobs (tests/browser/perf-frame-cost/extract.mjs rebuilds the JSON).
 */
const PLAN_FRAMES = 44;
const WALL_LIMIT_MS = 300_000;
const FOREST_QUERY = "scene=forest&trees=8000&rocks=2000";
const SETTLE_MS = Number(process.env.A3D_SHADOW_TIER_AB_SETTLE_MS ?? 3000);

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, median: s[Math.floor(s.length / 2)] ?? 0, min: s[0] ?? 0, max: s[s.length - 1] ?? 0, mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 };
};

const emit = (name: string, value: unknown): void => {
  const json = JSON.stringify(value);
  mkdirSync(resolve("tests/reports/shadow-filter-tier-ab"), { recursive: true });
  writeFileSync(resolve(`tests/reports/shadow-filter-tier-ab/${name}.json`), json);
  console.log(`SHADOWTIER_AB ${json}`);
  const b64 = Buffer.from(json).toString("base64");
  const size = 3000, n = Math.ceil(b64.length / size);
  for (let i = 0; i < n; i++) console.log(`PERFCOST_CHUNK shadowtier-${name} ${i} ${n} ${b64.slice(i * size, (i + 1) * size)}`);
};

type Probe = { frame(dt: number): { cpuMs: number; totalMs: number } };

async function forestRun(browser: Browser, tag: string, extraQuery: string): Promise<void> {
  const server = await startExampleDevServer();
  const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const consoleIssues: string[] = [];
  try {
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() !== "error" && m.type() !== "warning") return;
      if (/GL Driver Message .*ReadPixels/.test(m.text())) return;
      consoleIssues.push(`${m.type()}: ${m.text().slice(0, 300)}`);
    });
    page.on("pageerror", (e) => consoleIssues.push(`pageerror: ${String(e.message).slice(0, 300)}`));
    const t0 = Date.now();
    await page.goto(`${server.origin}/tests/browser/perf-frame-cost/index.html?${FOREST_QUERY}${extraQuery}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __PROBE__?: unknown }).__PROBE__), undefined, { timeout: WALL_LIMIT_MS });
    const ready = await page.evaluate(() => (window as unknown as { __PROBE__: { ready: boolean; error?: string } }).__PROBE__);
    expect(ready.ready, ready.error).toBe(true);
    const frames: Array<{ cpuMs: number; totalMs: number }> = [];
    for (let i = 0; i < PLAN_FRAMES; i++) {
      frames.push(await page.evaluate((d) => (window as unknown as { __PROBE__: Probe }).__PROBE__.frame(d), 1 / 60));
    }
    const wallMs = Date.now() - t0;
    const measured = frames.slice(-12);
    const tapTier = await page.evaluate(() => (window as unknown as { __A3D_SHADOW_TAP_TIER__?: unknown }).__A3D_SHADOW_TAP_TIER__ ?? null);
    emit(tag, {
      kind: "forest-timing", tag, extraQuery, tapTier, wallMs, firstFrameMs: frames[0]?.totalMs ?? null,
      frameMs: stats(measured.map((f) => f.totalMs)), cpuMs: stats(measured.map((f) => f.cpuMs)),
      allFrameMs: frames.map((f) => Math.round(f.totalMs)), consoleIssues: consoleIssues.slice(0, 20),
      environment: "software WebGL2 (SwiftShader); not a GPU measurement", generatedUtc: new Date().toISOString()
    });
    expect(frames.length).toBe(PLAN_FRAMES);
    expect(consoleIssues).toEqual([]);
  } finally {
    await context.close();
    await server.close();
  }
}

interface Shot { png: Buffer; tapTier: unknown; errors: string[]; loaded: boolean }

async function shoot(browser: Browser, url: string, tapsInit: string | null, forestFrames = 0, denseOptIn = false): Promise<Shot> {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  if (tapsInit !== null) await context.addInitScript(`window.__A3D_SHADOW_TAPS__ = ${tapsInit};`);
  if (denseOptIn) await context.addInitScript('window.__A3D_DENSE_SHADOW_TAPS__ = "on";');
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  let loaded = true;
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    if ((response?.status() ?? 0) !== 200) { loaded = false; errors.push(`status ${response?.status()}`); }
  } catch (error) {
    loaded = false;
    errors.push(`navigation: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`);
  }
  if (forestFrames > 0) {
    await page.waitForFunction(() => Boolean((window as unknown as { __PROBE__?: unknown }).__PROBE__), undefined, { timeout: WALL_LIMIT_MS }).catch(() => { loaded = false; });
    for (let i = 0; i < forestFrames; i++) await page.evaluate((d) => (window as unknown as { __PROBE__: Probe }).__PROBE__.frame(d), 1 / 60).catch(() => { loaded = false; });
  } else {
    await page.waitForSelector("canvas", { timeout: 45_000 }).catch(() => { loaded = false; errors.push("no canvas"); });
    await page.waitForTimeout(SETTLE_MS);
  }
  const png = await page.screenshot({ fullPage: false }).catch(() => Buffer.alloc(0));
  const tapTier = await page.evaluate(() => (window as unknown as { __A3D_SHADOW_TAP_TIER__?: unknown }).__A3D_SHADOW_TAP_TIER__ ?? null).catch(() => null);
  await context.close();
  return { png, tapTier, errors, loaded };
}

/** direct-path-parity metric: mean abs diff over channels, largest non-silhouette diff, share of pixels > 6/255, silhouette max (silhouettes of `a`). */
async function compare(page: Page, a: Buffer, b: Buffer): Promise<{ meanAbs: number; interiorMax: number; over6Share: number; edgeMax: number } | null> {
  if (a.length === 0 || b.length === 0) return null;
  return page.evaluate(async ([pa, pb]) => {
    const load = (b64: string) => new Promise<HTMLImageElement>((ok, bad) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => bad(new Error("decode")); img.src = `data:image/png;base64,${b64}`; });
    const [ia, ib] = await Promise.all([load(pa!), load(pb!)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const read = (img: HTMLImageElement) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true })!; x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const A = read(ia), B = read(ib);
    const isEdge = (p: number): boolean => {
      const x = p % w, y = Math.floor(p / w);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        for (let c = 0; c < 3; c++) if (Math.abs(A[q * 4 + c]! - A[p * 4 + c]!) > 12) return true;
      }
      return false;
    };
    let sum = 0, interiorMax = 0, edgeMax = 0, over6 = 0;
    const n = w * h;
    for (let p = 0; p < n; p++) {
      let pm = 0;
      for (let c = 0; c < 3; c++) { const d = Math.abs(A[p * 4 + c]! - B[p * 4 + c]!); sum += d; if (d > pm) pm = d; }
      if (pm > 6) over6++;
      if (pm === 0) continue;
      if (isEdge(p)) { if (pm > edgeMax) edgeMax = pm; } else if (pm > interiorMax) interiorMax = pm;
    }
    return { meanAbs: sum / (n * 3), interiorMax, over6Share: over6 / n, edgeMax };
  }, [a.toString("base64"), b.toString("base64")] as const);
}

async function visualAudit(browser: Browser, routes: readonly string[], tag: string): Promise<void> {
  const server = await startExampleDevServer();
  const results: unknown[] = [];
  try {
    const scratch = await browser.newPage();
    await scratch.goto("about:blank");
    for (const route of routes) {
      const forest = route === "forest";
      const url = forest ? `${server.origin}/tests/browser/perf-frame-cost/index.html?${FOREST_QUERY}` : `${server.origin}/${route}/`;
      const frames = forest ? 3 : 0;
      // Interleaved so that load-order effects show up in the noise floor: 32, default, 32, forced 8, opt-in dense default twice.
      const pin32a = await shoot(browser, url, "32", frames);
      const dflt = await shoot(browser, url, null, frames);
      const pin32b = await shoot(browser, url, "32", frames);
      const forced8 = await shoot(browser, url, "8", frames);
      const dense = await shoot(browser, url, null, frames, true);
      const dense2 = await shoot(browser, url, null, frames, true);
      const measurable = [pin32a, pin32b, dflt, forced8, dense, dense2].every((s) => s.loaded && s.png.length > 0);
      const entry = {
        route, measurable,
        tiers: { pinned32: pin32a.tapTier, default: dflt.tapTier, forced8: forced8.tapTier, denseOptIn: dense.tapTier },
        noise32vs32: measurable ? await compare(scratch, pin32a.png, pin32b.png) : null,
        noiseDenseVsDense: measurable ? await compare(scratch, dense.png, dense2.png) : null,
        denseOptInVs32: measurable ? await compare(scratch, pin32a.png, dense.png) : null,
        defaultVs32: measurable ? await compare(scratch, pin32a.png, dflt.png) : null,
        forced8Vs32: measurable ? await compare(scratch, pin32a.png, forced8.png) : null,
        errors: [...pin32a.errors, ...dflt.errors, ...forced8.errors, ...dense.errors].slice(0, 6)
      };
      results.push(entry);
      console.log(`SHADOWTIER_AB ${JSON.stringify(entry)}`);
    }
  } finally {
    await server.close();
  }
  emit(`visual-${tag}`, { kind: "visual", generatedUtc: new Date().toISOString(), settleMs: SETTLE_MS, tolerance: { meanAbs: 2, interiorMax: 6 }, results });
}

test.describe("shadow filter tier A/B", () => {
  test.setTimeout(3_300_000);
  // One test per line on purpose: tools/remote-acr/run.sh selects a group with `<spec>:<line>`, so groups run in parallel on separate runners.
  test("forest dense tier 8 r1", async ({ browser }) => forestRun(browser, "forest-dense8-r1", "&densetaps=on"));
  test("forest dense tier 8 r2", async ({ browser }) => forestRun(browser, "forest-dense8-r2", "&densetaps=on"));
  test("forest dense tier 8 r3", async ({ browser }) => forestRun(browser, "forest-dense8-r3", "&densetaps=on"));
  test("forest pinned 32 r1", async ({ browser }) => forestRun(browser, "forest-taps32-r1", "&shadowtaps=32"));
  test("forest pinned 32 r2", async ({ browser }) => forestRun(browser, "forest-taps32-r2", "&shadowtaps=32"));
  test("forest pinned 32 r3", async ({ browser }) => forestRun(browser, "forest-taps32-r3", "&shadowtaps=32"));
  test("visual group 1", async ({ browser }) => visualAudit(browser, ["forest", "examples/rendering-large-scene", "examples/silt-and-signal-port"], "g1"));
  test("visual group 2", async ({ browser }) => visualAudit(browser, ["examples/roadster-hours-port", "examples/ninja-runner-port", "examples/drift-and-deliver-port"], "g2"));
  test("visual group 3", async ({ browser }) => visualAudit(browser, ["apps/showcase-vault-breakers", "apps/aura-clash-showcase", "apps/showcase-smart-city-control"], "g3"));
});
