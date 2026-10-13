/*
 * look-perf.spec.ts (PRD-09 09-MIG look-signature + 16.1-8 perf). Record-only
 * companion to capture-divergence.spec.ts, served from the same built site.
 *
 * 1. Look signatures: every baseline route boots its shadow-migrated v2 build
 *    via `?a3d-qr=route-<id>` (createGame), once at the default URL and once
 *    with `?capture=review`; the opted-in `look` evidence section returns
 *    `game.lookSignature()` (SHA-256 of the canonical render manifest). Written
 *    to <out>/look-signature/<route>.json with `equal` (PRD-09 §20).
 * 2. Perf (pilots bank-shot, courier-rush, aura-clash): 600 rAF intervals at
 *    the same 1920x1080 canvas for the legacy default URL (baseline) and the
 *    v2 build, CDP Performance.getMetrics LayoutCount/LayoutDuration deltas
 *    over the window, and the v2 `spans.session` CPU span. Reports are built
 *    with `buildPerfReport` (the `aura3d perf-report` command's builder) and
 *    written to <out>/perf/<route>.performance-report.json.
 */
import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain .mjs helper, no typings
import { startBuiltSiteServer } from "./serve-built-site.mjs";
import { buildPerfReport } from "../../../packages/aura3d-cli/src/commands/prd09/perf-report";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const outDir = process.env.A3D_DIVERGENCE_DIR ?? join(repoRoot, "tests", "qr", "prd09", ".out");
const baselinePath = join(repoRoot, "docs", "project", "aura3d-quality-rebuild", "migration", "baseline.json");

const PILOTS = ["showcase-bank-shot", "showcase-courier-rush", "aura-clash-showcase"];
const FRAMES = 600;
const READY_TIMEOUT_MS = 45_000;

interface Route { route: string; appDir: string; flag: string | null }

const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as { routes: Record<string, { route: string; appDir: string }> };
const routes: Route[] = Object.values(baseline.routes)
  .filter((r) => {
    const appDir = r.appDir.replace(/^apps\//, "");
    return existsSync(join(repoRoot, "apps", appDir, "src", "v2"));
  })
  .map((r) => {
    // baseline.json appDir is repo-relative ("apps/<dir>"); strip it so the
    // main.ts path and the /apps/<dir>/ URL are not doubled.
    const appDir = r.appDir.replace(/^apps\//, "");
    const main = join(repoRoot, "apps", appDir, "src", "main.ts");
    const m = existsSync(main) ? /ROUTE_FLAG = "A3D_QR_ROUTE_([A-Z0-9_]+)"/.exec(readFileSync(main, "utf8")) : null;
    return { route: r.route, appDir, flag: m ? `route-${m[1].toLowerCase().replace(/_/g, "-")}` : null };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

let origin = "";
let closeServer: (() => void) | null = null;
const run = process.env.GITHUB_RUN_ID
  ? { provider: "github", runId: process.env.GITHUB_RUN_ID, sha: process.env.GITHUB_SHA ?? null, runner: process.env.RUNNER_OS ?? null }
  : null;

test.beforeAll(async () => {
  mkdirSync(join(outDir, "look-signature"), { recursive: true });
  mkdirSync(join(outDir, "perf"), { recursive: true });
  const { server, origin: o } = await startBuiltSiteServer();
  closeServer = () => server.close();
  origin = o;
});

test.afterAll(() => closeServer?.());

async function openV2(page: Page, r: Route, extra: string): Promise<string> {
  expect(r.flag, `${r.route}: cannot collect v2 evidence without a v2 route flag`).toBeTruthy();
  const url = `${origin}/apps/${r.appDir}/?a3d-qr=${r.flag}${extra}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (globalThis as any).__AURA3D_GAME__?.state === "playing", null, { timeout: READY_TIMEOUT_MS });
  return url;
}

/** Opt in at read time (never via the URL) and poll the `look` section. */
async function readLook(page: Page): Promise<{ id: string; signature: string | null; error: string | null; revision: number } | null> {
  const handle = await page.waitForFunction(() => {
    const g = globalThis as any;
    g.__AURA3D_EVIDENCE_OPT_IN__ = true;
    const reg = g.__AURA3D_GAME_EVIDENCE__ ?? {};
    for (const id of Object.keys(reg)) {
      const look = reg[id]?.sections?.look;
      if (look && (look.signature || look.error)) return { id, ...look };
    }
    return null;
  }, null, { timeout: 15_000, polling: 300 });
  return (await handle.jsonValue()) as never;
}

/** 600 rAF intervals + CDP layout metrics delta over the same window. */
async function sampleFrames(page: Page): Promise<{ frameIntervals: number[]; forcedLayout: { events: number; totalMs: number } }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const metric = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const get = (n: string) => metrics.find((m: { name: string }) => m.name === n)?.value ?? 0;
    return { count: get("LayoutCount"), seconds: get("LayoutDuration") };
  };
  const before = await metric();
  const frameIntervals = await page.evaluate((n) => new Promise<number[]>((done) => {
    const out: number[] = [];
    let last = -1;
    const step = (t: number) => {
      if (last >= 0) out.push(t - last);
      last = t;
      if (out.length >= n) done(out); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), FRAMES);
  const after = await metric();
  await cdp.detach();
  return {
    frameIntervals,
    forcedLayout: { events: after.count - before.count, totalMs: (after.seconds - before.seconds) * 1000 }
  };
}

test.describe("prd09 look signatures (v2 default vs ?capture=review)", () => {
  test("every baseline route declares a v2 route flag", () => {
    expect(routes.filter((r) => r.flag === null).map((r) => r.route)).toEqual([]);
  });

  for (const r of routes) {
    test(`${r.route}: look signature default vs review`, async ({ page }) => {
      const modes: Record<string, unknown> = {};
      const defUrl = await openV2(page, r, "");
      const def = await readLook(page);
      modes.default = { url: defUrl.replace(origin, ""), ...def };
      const revUrl = await openV2(page, r, "&capture=review");
      const rev = await readLook(page);
      modes.review = { url: revUrl.replace(origin, ""), ...rev };
      const equal = Boolean(def?.signature) && def?.signature === rev?.signature;
      writeFileSync(join(outDir, "look-signature", `${r.route}.json`), JSON.stringify({
        route: r.route,
        flag: r.flag,
        generatedAt: new Date().toISOString(),
        run,
        modes,
        scenarios: "NOT RUN: no per-route scenario registry is enumerated by this spec",
        equal
      }, null, 2) + "\n");
      expect(def?.signature, `${r.route}: default look signature`).toMatch(/^[0-9a-f]{64}$/);
      expect(rev?.signature, `${r.route}: review look signature`).toMatch(/^[0-9a-f]{64}$/);
    });
  }
});

test.describe("prd09 perf (16.1-8, pilots)", () => {
  for (const id of PILOTS) {
    test(`${id}: 600-frame rAF legacy baseline vs v2`, async ({ page }) => {
      const r = routes.find((x) => x.route === id);
      expect(r?.flag, `${id}: pilot has a v2 route flag`).toBeTruthy();
      await page.goto(`${origin}/apps/${r!.appDir}/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (globalThis as any).__AURA3D_LIVE_APPS__?.all?.().length > 0, null, { timeout: READY_TIMEOUT_MS });
      await page.waitForTimeout(1500);
      const legacy = await sampleFrames(page);
      const legacyReport = buildPerfReport(`${id}#legacy`, { route: id, perf: legacy });

      await openV2(page, r!, "");
      await page.waitForTimeout(1500);
      const v2 = await sampleFrames(page);
      const spans = await page.evaluate(() => {
        const g = globalThis as any;
        g.__AURA3D_EVIDENCE_OPT_IN__ = true;
        const reg = g.__AURA3D_GAME_EVIDENCE__ ?? {};
        const id0 = Object.keys(reg)[0];
        return id0 ? (reg[id0].sections?.spans ?? null) : null;
      });
      const telemetry = { route: id, perf: { ...v2, ...(spans ? { cpuSpans: spans } : {}) } };
      const report = buildPerfReport(id, telemetry, legacyReport.perf.p50Ms);
      const viewport = page.viewportSize();
      writeFileSync(join(outDir, "perf", `${id}.telemetry.json`), JSON.stringify({ legacy, v2: telemetry.perf }) + "\n");
      writeFileSync(join(outDir, "perf", `${id}.performance-report.json`), JSON.stringify({
        ...report,
        run,
        viewport,
        methods: {
          frames: `${FRAMES} requestAnimationFrame intervals in-page`,
          baseline: "same route, legacy default URL (flag off), same page/viewport, sampled first",
          forcedLayout: "CDP Performance.getMetrics LayoutCount/LayoutDuration delta over the window (all layouts, not attributed to @aura3d/game stacks)",
          cpuSpans: "performance.now() around session.tick (createGame spans.session); tween/juice/hud/sound spans not instrumented",
          instanceTransforms: "NOT RUN: no pilot drives FxPrimitivePool.setInstanceTransforms (createGame fx layer is GameFxLayerImpl)"
        },
        legacy: legacyReport.perf
      }, null, 2) + "\n");
      expect(report.perf.samples).toBe(FRAMES);
    });
  }
});
