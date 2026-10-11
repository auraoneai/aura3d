/*
 * capture_review_divergence (PRD-09, Phase 0). Record-only: for every route that
 * reads a ?capture flag it captures the shipped default view and the review view,
 * records postprocess.actualPasses per mode, and writes an updated baseline.json
 * plus per-route PNG pairs under A3D_DIVERGENCE_DIR for artifact upload.
 */
import { expect, test, type Page } from "@playwright/test";
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

// T0.4 / 09-P0: postPass is recorded at the DEFAULT url for every baseline
// route (18), not only the capture-flag ones — unaffected routes get a
// default-only capture.
const affectedIds = new Set(affected.map((r) => r.route));
const defaultOnly = Object.values(baseline.routes)
  .filter((r) => !affectedIds.has(r.route))
  .map((r) => ({ route: r.route, appDir: r.appDir, readyExpr: games.games.find((g) => g.appDir === r.route)?.readyExpr }))
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
  writeFileSync(join(outDir, "postpass.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    // Provenance for the committed copy (09-P0 cites the run id).
    run: process.env.GITHUB_RUN_ID ? { provider: "github", runId: process.env.GITHUB_RUN_ID, sha: process.env.GITHUB_SHA ?? null, runner: process.env.RUNNER_OS ?? null } : null,
    postPass,
    diagnostics
  }, null, 2) + "\n");
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
  // A real value needs a mounted app that reports postprocess diagnostics;
  // no live app (or no postprocess section) is a failure, never `false`.
  const reported = diag.filter((d: any) => d && (d.postprocess !== null || d.runtimePost !== null));
  expect(reported.length, `${route}#${mode}: no live app reported app.diagnostics().postprocess`).toBeGreaterThan(0);
  const passes = reported.some((d: any) => (d?.postprocess?.actualPasses ?? d?.runtimePost?.actualPasses ?? 0) > 0);
  // postPass is the shipped (default url) value only; review-mode passes stay
  // in `diagnostics` for the divergence record.
  if (mode === "default") postPass[route] = passes;
  const shot = await page.screenshot({ fullPage: false });
  const file = join(outDir, `${route}-${mode}.png`);
  writeFileSync(file, shot);
  return { file, diag };
}

test.describe("capture_review_divergence", () => {
  // Red-flag guard (P-22): an empty affected set means baseline.json never
  // captured capture-flag routes — that is a failure, not a reason to skip
  // silently. Unconditional: fails loudly locally and on CI.
  test("baseline lists at least one capture-flag route", () => {
    expect(affected.length, "capture-divergence baseline.json produced zero capture-flag routes").toBeGreaterThan(0);
  });

  for (const r of affected) {
    test(`${r.route}: default vs ?capture=${r.param}`, async ({ page }, testInfo) => {
      const def = await captureMode(page, r.route, r.appDir, null, r.readyExpr);
      const rev = await captureMode(page, r.route, r.appDir, r.param, r.readyExpr);
      await testInfo.attach(`${r.route}-default.png`, { path: def.file, contentType: "image/png" });
      await testInfo.attach(`${r.route}-${r.param}.png`, { path: rev.file, contentType: "image/png" });
    });
  }

  for (const r of defaultOnly) {
    test(`${r.route}: default postPass (no capture flag)`, async ({ page }, testInfo) => {
      const def = await captureMode(page, r.route, r.appDir, null, r.readyExpr);
      await testInfo.attach(`${r.route}-default.png`, { path: def.file, contentType: "image/png" });
    });
  }

  // Runs last (tests in a file run in order, workers: 1): every baseline route
  // must carry a real boolean postPass, so postpass.json has no nulls.
  test("postPass recorded for every baseline route", () => {
    const missing = Object.keys(baseline.routes).filter((id) => typeof postPass[id] !== "boolean");
    expect(missing, "routes without a recorded default-url postPass").toEqual([]);
  });
});
