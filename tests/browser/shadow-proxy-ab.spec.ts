import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, type Browser, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Shadow-proxy A/B audit (beat-three.js PRD, lane L-P2). Remote only (tools/remote-acr/run.sh). For every dense-instance example, app and
 * template route, loads the page three times at the same page age: shadow proxies OFF twice (the noise floor: animated scenes differ run to
 * run) and ON once, then compares the screenshots. A route is only "affected" when it actually built a proxy (`__A3D_SHADOW_PROXIES__`) AND
 * the ON-vs-OFF difference exceeds the OFF-vs-OFF noise. Routes that cannot load in the example dev server are reported as unmeasurable.
 *
 * Output: `SHADOWPROXY_AB <json>` plus tests/reports/shadow-proxy-ab/report.json (copied out through the run log by the same chunk lines as
 * the perf probe: PERFCOST_CHUNK shadow-proxy-ab ...).
 */
const DEFAULT_ROUTES = [
  "examples/rendering-large-scene",
  "examples/silt-and-signal-port",
  "examples/roadster-hours-port",
  "examples/ninja-runner-port",
  "examples/drift-and-deliver-port",
  "examples/instanced-texture-probe",
  "templates/arena-shooter",
  "apps/showcase-aura-links-3d",
  "apps/showcase-cross-hop",
  "apps/showcase-vault-breakers",
  "apps/showcase-blockfall-reactor",
  "apps/showcase-dot-dash-3d",
  "apps/aura-clash-showcase",
  "apps/showcase-smart-city-control"
];
const ROUTES = (process.env.A3D_SHADOW_PROXY_AB_ROUTES ?? "").split(",").map((r) => r.trim()).filter(Boolean);
const SETTLE_MS = Number(process.env.A3D_SHADOW_PROXY_AB_SETTLE_MS ?? 3000);

interface Capture { png: Buffer; proxies: unknown[]; denseCap: unknown; errors: string[]; loaded: boolean; drawCalls: unknown }

async function capture(browser: Browser, origin: string, route: string, proxyOff: boolean): Promise<Capture> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  if (proxyOff) await context.addInitScript('window.__A3D_SHADOW_PROXY__ = "off"; window.__A3D_DENSE_SHADOWS__ = "off";');
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  let loaded = true;
  try {
    const response = await page.goto(`${origin}/${route}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if ((response?.status() ?? 0) !== 200) { loaded = false; errors.push(`status ${response?.status()}`); }
  } catch (error) {
    loaded = false;
    errors.push(`navigation: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`);
  }
  await page.waitForFunction(() => {
    const ready = document.body?.dataset.aura3dReady === "true";
    const published = Object.entries(window).some(([key, value]) => {
      if (!key.startsWith("__") || typeof value !== "object" || value === null) return false;
      const status = (value as { status?: unknown }).status;
      return status === "ready" || status === "running";
    });
    return ready || published;
  }, undefined, { timeout: 30_000 }).catch(() => { errors.push("no ready signal (continuing: many apps publish none)"); });
  // Apps that publish no ready flag still render: wait for a canvas, then settle.
  await page.waitForSelector("canvas", { timeout: 45_000 }).catch(() => { loaded = false; errors.push("no canvas"); });
  await page.waitForTimeout(SETTLE_MS);
  const png = await page.screenshot({ fullPage: false }).catch(() => Buffer.alloc(0));
  const proxies = await page.evaluate(() => (window as unknown as { __A3D_SHADOW_PROXIES__?: unknown[] }).__A3D_SHADOW_PROXIES__ ?? []).catch(() => []);
  const denseCap = await page.evaluate(() => (window as unknown as { __A3D_DENSE_SHADOW_CAP__?: unknown }).__A3D_DENSE_SHADOW_CAP__ ?? null).catch(() => null);
  const drawCalls = await page.evaluate(() => {
    const hit = Object.entries(window).find(([key, value]) => key.startsWith("__") && typeof value === "object" && value !== null && "drawCalls" in value);
    return hit ? (hit[1] as { drawCalls?: unknown }).drawCalls : null;
  }).catch(() => null);
  await context.close();
  return { png, proxies, denseCap, errors, loaded, drawCalls };
}

/** Mean absolute channel difference (0..255) and the share of pixels differing by more than 8/255, decoded in a scratch page. */
async function diff(page: Page, a: Buffer, b: Buffer): Promise<{ meanAbs: number; changedShare: number } | null> {
  if (a.length === 0 || b.length === 0) return null;
  return page.evaluate(async ([pa, pb]) => {
    const load = (b64: string) => new Promise<HTMLImageElement>((ok, bad) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => bad(new Error("decode")); img.src = `data:image/png;base64,${b64}`; });
    const [ia, ib] = await Promise.all([load(pa!), load(pb!)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const read = (img: HTMLImageElement) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true })!; x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = read(ia), db = read(ib);
    let sum = 0, changed = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = (Math.abs(da[i]! - db[i]!) + Math.abs(da[i + 1]! - db[i + 1]!) + Math.abs(da[i + 2]! - db[i + 2]!)) / 3;
      sum += d;
      if (d > 8) changed++;
    }
    return { meanAbs: sum / (da.length / 4), changedShare: changed / (da.length / 4) };
  }, [a.toString("base64"), b.toString("base64")] as const);
}

async function auditRoutes(browser: Browser, routes: readonly string[], tag: string): Promise<void> {
  const server = await startExampleDevServer();
  const results: unknown[] = [];
  try {
    const scratch = await browser.newPage();
    await scratch.goto("about:blank");
    for (const route of routes) {
      const off1 = await capture(browser, server.origin, route, true);
      const off2 = await capture(browser, server.origin, route, true);
      const on = await capture(browser, server.origin, route, false);
      const noise = await diff(scratch, off1.png, off2.png);
      const effect = await diff(scratch, off1.png, on.png);
      const proxies = on.proxies;
      const budgets = proxies.length + (on.denseCap ? 1 : 0);
      const measurable = off1.loaded && on.loaded && off1.png.length > 0 && on.png.length > 0;
      const affected = budgets > 0 && effect !== null && noise !== null && (effect.meanAbs > noise.meanAbs * 1.5 + 0.05 || effect.changedShare > noise.changedShare * 1.5 + 0.0005);
      const verdict = !measurable ? "unmeasurable" : budgets === 0 ? "unaffected (no proxy, no cascade cap)" : affected ? "AFFECTED" : "budget applied, difference within noise";
      const entry = { route, verdict, proxies, denseCap: on.denseCap, noise, effect, errors: [...off1.errors, ...on.errors].slice(0, 6), drawCalls: { off: off1.drawCalls, on: on.drawCalls } };
      results.push(entry);
      console.log(`SHADOWPROXY_AB ${JSON.stringify(entry)}`);
    }
  } finally {
    await server.close();
  }
  const report = { generatedUtc: new Date().toISOString(), settleMs: SETTLE_MS, results };
  mkdirSync(resolve("tests/reports/shadow-proxy-ab"), { recursive: true });
  const json = JSON.stringify(report);
  writeFileSync(resolve(`tests/reports/shadow-proxy-ab/${tag}.json`), json);
  const b64 = Buffer.from(json).toString("base64");
  const size = 3000, n = Math.ceil(b64.length / size);
  for (let i = 0; i < n; i++) console.log(`PERFCOST_CHUNK shadow-proxy-ab-${tag} ${i} ${n} ${b64.slice(i * size, (i + 1) * size)}`);
}

test.describe("shadow proxy A/B", () => {
  test.setTimeout(3_300_000);
  // One test per line on purpose: tools/remote-acr/run.sh selects a group with `<spec>:<line>`, so groups run in parallel on separate runners.
  test("group 1: drift-and-deliver, instanced-texture-probe, arena-shooter", async ({ browser }) => auditRoutes(browser, ["examples/drift-and-deliver-port", "examples/instanced-texture-probe", "templates/arena-shooter"], "g1"));
  test("group 2: aura-links, cross-hop, vault-breakers", async ({ browser }) => auditRoutes(browser, ["apps/showcase-aura-links-3d", "apps/showcase-cross-hop", "apps/showcase-vault-breakers"], "g2"));
  test("group 3: blockfall-reactor, dot-dash, aura-clash", async ({ browser }) => auditRoutes(browser, ["apps/showcase-blockfall-reactor", "apps/showcase-dot-dash-3d", "apps/aura-clash-showcase"], "g3"));
  test("group 4: smart-city-control, rendering-large-scene", async ({ browser }) => auditRoutes(browser, ["apps/showcase-smart-city-control", "examples/rendering-large-scene"], "g4"));
  test("custom routes (A3D_SHADOW_PROXY_AB_ROUTES) or all", async ({ browser }) => auditRoutes(browser, ROUTES.length ? ROUTES : DEFAULT_ROUTES, "all"));
});
