/*
 * capture_review_divergence (PRD-09, Phase 0). Record-only: for every route that
 * reads a ?capture flag it captures the shipped default view and the review view,
 * records postprocess.actualPasses per mode, and writes an updated baseline.json
 * plus per-route PNG pairs under A3D_DIVERGENCE_DIR for artifact upload.
 */
import { test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain .mjs helper, no typings
import { startBuiltSiteServer } from "./serve-built-site.mjs";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const outDir = process.env.A3D_DIVERGENCE_DIR ?? join(repoRoot, "tests", "qr", "prd09", ".out");
const baselinePath = join(repoRoot, "docs", "project", "aura3d-quality-rebuild", "migration", "baseline.json");
const gamesPath = join(repoRoot, "tools", "quality-rebuild-capture", "games.json");

interface BaselineRoute {
  route: string;
  appDir: string;
  captureFlag: string[];
  captureBranches: Record<string, number>;
  postPass: boolean | null;
  [k: string]: unknown;
}

const baseline = existsSync(baselinePath)
  ? (JSON.parse(readFileSync(baselinePath, "utf8")) as { routes: Record<string, BaselineRoute> })
  : { routes: {} };
const games = JSON.parse(readFileSync(gamesPath, "utf8")) as {
  defaults: { readyTimeoutMs: number; readyFallbackMs: number };
  games: { id: string; appDir: string; readyExpr?: string }[];
};

// Routes that read a capture flag (PRD-09 "affected routes"). Each is captured
// once without the flag (shipped view) and once with it (review view).
const affected = Object.values(baseline.routes)
  .filter((r) => r.captureFlag?.length || Object.values(r.captureBranches ?? {}).some((n) => n > 0))
  .map((r) => {
    const valued = r.captureFlag?.find((f) => f.includes("="));
    // aura-clash reads captureMode for replay framing, not review lenses.
    const param = r.route === "aura-clash-showcase" ? "combat-impact" : (valued?.split("=")[1] ?? "review");
    const game = games.games.find((g) => g.appDir === r.route);
    return { route: r.route, appDir: r.appDir, param, readyExpr: game?.readyExpr };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

const readyTimeoutMs = games.defaults?.readyTimeoutMs ?? 30_000;
const readyFallbackMs = games.defaults?.readyFallbackMs ?? 6_000;

let origin = "";
let closeServer: (() => void) | null = null;
const diagnostics: Record<string, unknown> = {};
const postPass: Record<string, boolean | null> = {};

test.beforeAll(async () => {
  mkdirSync(outDir, { recursive: true });
  const { server, origin: o } = await startBuiltSiteServer();
  closeServer = () => server.close();
  origin = o;
});

test.afterAll(() => {
  closeServer?.();
  for (const id of Object.keys(baseline.routes)) {
    if (id in postPass) baseline.routes[id].postPass = postPass[id];
  }
  writeFileSync(join(outDir, "baseline.json"), JSON.stringify(baseline, null, 2) + "\n");
  writeFileSync(join(outDir, "postpass.json"), JSON.stringify({ generatedAt: new Date().toISOString(), postPass, diagnostics }, null, 2) + "\n");
});

async function captureMode(page: Page, route: string, appDir: string, param: string | null, readyExpr: string | undefined) {
  const url = `${origin}/apps/${appDir}/${param ? `?capture=${param}` : ""}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForFunction(
      (expr) => {
        try {
          return (0, eval)(expr ?? "true") || (globalThis as any).__AURA3D_LIVE_APPS__?.all?.().length > 0;
        } catch {
          return (globalThis as any).__AURA3D_LIVE_APPS__?.all?.().length > 0;
        }
      },
      readyExpr ?? null,
      { timeout: readyTimeoutMs },
    );
  } catch {
    await page.waitForTimeout(readyFallbackMs);
  }
  await page.waitForTimeout(1200);
  const diag = await page.evaluate(() => {
    const apps = (globalThis as any).__AURA3D_LIVE_APPS__?.all?.() ?? [];
    return apps.map((a: any) => {
      try {
        const d = a.diagnostics?.();
        return { postprocess: d?.postprocess ?? null, runtimePost: d?.renderer?.runtime?.postprocess ?? null };
      } catch {
        return null;
      }
    });
  });
  const mode = param ?? "default";
  diagnostics[`${route}#${mode}`] = diag;
  const passes = diag.some((d: any) => (d?.postprocess?.actualPasses ?? d?.runtimePost?.actualPasses ?? 0) > 0);
  if (mode === "default" || postPass[route] !== true) postPass[route] = passes;
  const shot = await page.screenshot({ fullPage: false });
  const file = join(outDir, `${route}-${mode}.png`);
  writeFileSync(file, shot);
  return { file, diag };
}

test.describe("capture_review_divergence", () => {
  test.skip(affected.length === 0, "no capture-flag routes found in baseline.json");

  for (const r of affected) {
    test(`${r.route}: default vs ?capture=${r.param}`, async ({ page }, testInfo) => {
      const def = await captureMode(page, r.route, r.appDir, null, r.readyExpr);
      const rev = await captureMode(page, r.route, r.appDir, r.param, r.readyExpr);
      await testInfo.attach(`${r.route}-default.png`, { path: def.file, contentType: "image/png" });
      await testInfo.attach(`${r.route}-${r.param}.png`, { path: rev.file, contentType: "image/png" });
    });
  }
});
