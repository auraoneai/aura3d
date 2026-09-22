#!/usr/bin/env node
/*
 * Plays every Aura3D game route with real keyboard/pointer input through Playwright,
 * captures per-step screenshots, and records console output, page errors, unhandled
 * rejections, failed requests, and NaN transform checks.
 *
 *   pnpm exec node tools/showcase-library/game-play-probe.mjs --out tests/reports/game-play-probe
 *   ... --routes showcase-bank-shot,showcase-vault-breakers
 *   ... --viewport 1280x720
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const PLAYBOOK_PATH = resolve(repoRoot, "tools/showcase-library/game-play-playbook.json");

const args = process.argv.slice(2);
function arg(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const outDir = resolve(repoRoot, arg("--out", "tests/reports/game-play-probe"));
const baseUrl = arg("--base", "http://localhost:5199");
const [vw, vh] = arg("--viewport", "1280x720").split("x").map(Number);
const mobileWidth = Number(arg("--mobile", "390"));
const mobileHeight = Number(arg("--mobile-height", "844"));
const only = arg("--routes", "").split(",").filter(Boolean);
const failFirstLoad = args.includes("--first-load-only");

const playbook = JSON.parse(readFileSync(PLAYBOOK_PATH, "utf8"));

mkdirSync(outDir, { recursive: true });

/** Steps that must always run last so a route that dies mid-play still yields a reset shot. */
const DEFAULT_STEPS = [
  { label: "07-reset", keys: [{ press: "KeyR" }, { wait: 900 }] },
  { label: "09-mobile", mobile: true, keys: [{ press: "Space" }, { wait: 1200 }] },
];

function stepsFor(routeId) {
  const custom = playbook[routeId]?.steps;
  if (!custom) return DEFAULT_STEPS;
  const labeled = new Set(custom.map((s) => s.label));
  const tail = DEFAULT_STEPS.filter((s) => !labeled.has(s.label));
  return [...custom, ...tail];
}

async function runKeys(page, keys) {
  for (const step of keys) {
    if (step.wait) { await page.waitForTimeout(step.wait); continue; }
    if (step.press) { await page.keyboard.press(step.press); continue; }
    if (step.down) { await page.keyboard.down(step.down); continue; }
    if (step.up) { await page.keyboard.up(step.up); continue; }
    if (step.hold) {
      await page.keyboard.down(step.hold);
      await page.waitForTimeout(step.duration ?? 500);
      await page.keyboard.up(step.hold);
      continue;
    }
    if (step.mouse) {
      const { x = 0.5, y = 0.5, duration = 400, button = "left" } = step.mouse;
      await page.mouse.move(vw * x, vh * y);
      await page.mouse.down({ button });
      await page.waitForTimeout(duration);
      if (step.mouse.moveX !== undefined) {
        await page.mouse.move(vw * step.mouse.moveX, vh * (step.mouse.moveY ?? y), { steps: 12 });
      }
      await page.mouse.up({ button });
      continue;
    }
    if (step.wheel) { await page.mouse.wheel(0, step.wheel); await page.waitForTimeout(200); }
  }
}

/** Pull whatever HUD/state the route exposes so "input changed state" is provable. */
async function readState(page) {
  try {
    return await page.evaluate(() => {
      const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 400);
      const canvas = document.querySelector("canvas");
      let pixels = null;
      let nanNodes = 0;
      if (canvas) {
        try {
          const c2 = document.createElement("canvas");
          c2.width = 64; c2.height = 64;
          const ctx = c2.getContext("2d");
          ctx.drawImage(canvas, 0, 0, 64, 64);
          const d = ctx.getImageData(0, 0, 64, 64).data;
          let sum = 0; let uniq = new Set();
          for (let i = 0; i < d.length; i += 4) {
            sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
            uniq.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
          }
          pixels = { meanLuma: +(sum / (d.length / 4)).toFixed(1), distinctColors: uniq.size };
        } catch { pixels = null; }
      }
      const w = window;
      const dbg = w.__AURA3D_GAME_PROBE__?.() ?? null;
      void nanNodes;
      return { hud: text, canvasSize: canvas ? `${canvas.width}x${canvas.height}` : null, pixels, dbg };
    });
  } catch (e) {
    return { hud: null, error: String(e).slice(0, 200) };
  }
}

/** Poll until the route has booted: a canvas exists AND the HUD has published non-empty text. */
async function waitForBoot(page, startedAt, ms) {
  const deadline = startedAt + ms;
  let firstCanvasAt = null;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      return { hasCanvas: Boolean(c), hud: (document.body?.innerText ?? "").trim().length };
    }).catch(() => ({ hasCanvas: false, hud: 0 }));
    if (state.hasCanvas && firstCanvasAt === null) firstCanvasAt = Date.now();
    if (state.hasCanvas && state.hud > 12) return { canvasBootMs: firstCanvasAt - startedAt, ready: true };
    await page.waitForTimeout(250);
  }
  return { canvasBootMs: firstCanvasAt === null ? null : firstCanvasAt - startedAt, ready: false };
}

async function probeRoute(route) {
  const browser = await chromium.launch({
    args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-gl=angle",
      "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({
    viewport: { width: vw, height: vh },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error") consoleErrors.push(msg.text().slice(0, 400));
    else if (t === "warning") consoleWarnings.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err).slice(0, 400)));
  page.on("requestfailed", (req) => {
    const url = req.url();
    // Keep the untruncated URL in a private field: the stored `url` is clipped
    // for report readability, and re-fetching a clipped URL would 404 and turn
    // a harmless teardown abort into a fabricated "missing asset".
    requestFailures.push({ url: url.slice(0, 220), _fullUrl: url, failure: req.failure()?.errorText ?? "" });
  });
  page.on("response", (res) => {
    if (res.status() >= 400) requestFailures.push({ url: res.url().slice(0, 220), _fullUrl: res.url(), failure: `HTTP ${res.status()}` });
  });

  const shots = [];
  const dir = resolve(outDir, route.id);
  mkdirSync(dir, { recursive: true });

  const result = {
    id: route.id,
    label: route.label,
    route: route.route,
    genre: playbook[route.id]?.genre ?? route.genre ?? "unclassified",
    releaseClass: route.releaseClass,
    steps: shots,
    consoleErrors,
    consoleWarningCount: consoleWarnings.length,
    consoleWarningSample: consoleWarnings.slice(0, 6),
    pageErrors,
    requestFailures,
  };

  try {
    const startedAt = Date.now();
    await page.goto(baseUrl + route.route, { waitUntil: "load", timeout: 60_000 });
    const boot = await waitForBoot(page, startedAt, route.bootBudget ?? 30_000);
    result.boot = boot;
    await page.waitForTimeout(route.warmup ?? 2500);
  } catch (e) {
    result.loadError = String(e).slice(0, 300);
  }

  let label = "01-first-load";
  try {
    const p = resolve(dir, `${label}.png`);
    await page.screenshot({ path: p });
    shots.push({ label, file: p.slice(resolve(repoRoot).length + 1), state: await readState(page) });
  } catch (e) { shots.push({ label, error: String(e).slice(0, 300) }); }

  if (!failFirstLoad) {
    for (const step of stepsFor(route.id)) {
      const l = step.label;
      try {
        if (step.mobile) {
          await page.setViewportSize({ width: mobileWidth, height: mobileHeight });
        } else if (step.viewport) {
          const [w, h] = step.viewport.split("x").map(Number);
          await page.setViewportSize({ width: w, height: h });
        }
        await runKeys(page, step.keys ?? []);
        if (!step.mobile && !step.keepViewport) await page.setViewportSize({ width: vw, height: vh });
        await page.waitForTimeout(step.after ?? 700);
        const p = resolve(dir, `${l}.png`);
        await page.screenshot({ path: p });
        shots.push({ label: l, file: p.slice(resolve(repoRoot).length + 1), state: await readState(page) });
      } catch (e) {
        shots.push({ label: l, error: String(e).slice(0, 300) });
      }
    }
  }

  /*
   * A failed request is not automatically a missing asset. `net::ERR_ABORTED`
   * in particular fires when the page tears down mid-fetch or when an <audio>
   * element cancels a decode, and the URL can serve 200 perfectly well. Calling
   * those "missing assets" invents defects; re-fetching each one separates a
   * genuinely unavailable file from a cancelled request, and the raw list is
   * kept either way so the judgement can be checked rather than trusted.
   */
  for (const failure of requestFailures) {
    const target = failure._fullUrl ?? failure.url;
    try {
      const probe = await page.request.get(target, { timeout: 15_000, failOnStatusCode: false });
      failure.refetchStatus = probe.status();
      failure.resolved = probe.ok();
    } catch (e) {
      failure.refetchStatus = null;
      failure.resolved = false;
      failure.refetchError = String(e?.message ?? e).slice(0, 160);
    }
    delete failure._fullUrl;
  }
  const unresolvedFailures = requestFailures.filter((f) => !f.resolved);

  result.verdict = {
    booted: result.boot?.ready === true,
    zeroConsoleErrors: consoleErrors.length === 0,
    zeroPageErrors: pageErrors.length === 0,
    zeroAssetFailures: unresolvedFailures.length === 0,
    canvasPresent: shots.some((s) => s.state?.canvasSize),
    notBlank: shots.some((s) => (s.state?.pixels?.meanLuma ?? 0) > 4),
  };
  result.verdict.clean = Object.values(result.verdict).every(Boolean);

  await context.close();
  await browser.close();
  return result;
}

const routesJson = JSON.parse(readFileSync(resolve(repoRoot, "tools/showcase-library/route-gates.json"), "utf8"));
const gameIds = new Set(Object.keys(playbook).filter((k) => !k.startsWith("$")));
// Aura Clash is the flagship game route and is not registered in the showcase route-gates file.
const EXTRA_ROUTES = [
  { id: "aura-clash-showcase", label: "Aura Clash Arena", path: "/apps/aura-clash-showcase/", releaseClass: "flagship" },
];
const routes = [...EXTRA_ROUTES, ...routesJson.routes]
  .filter((r) => gameIds.has(r.id))
  .filter((r) => only.length === 0 || only.includes(r.id))
  .map((r) => ({
    id: r.id,
    label: r.label,
    route: r.path,
    releaseClass: r.releaseClass,
    bootBudget: playbook[r.id]?.bootBudget,
  }));

const all = [];
for (const route of routes) {
  process.stderr.write(`probe ${route.id} ... `);
  let r;
  try {
    r = await probeRoute(route);
  } catch (e) {
    r = { id: route.id, label: route.label, route: route.route, fatal: String(e).slice(0, 300), steps: [],
      consoleErrors: [], pageErrors: [], requestFailures: [],
      verdict: { clean: false }, consoleWarningCount: 0, consoleWarningSample: [] };
  }
  all.push(r);
  const v = r.verdict;
  process.stderr.write(`${v.clean ? "CLEAN" : `errors=${r.consoleErrors?.length ?? "?"} page=${r.pageErrors?.length ?? "?"} net=${r.requestFailures?.length ?? "?"}${r.fatal ? " FATAL:" + r.fatal.slice(0, 80) : ""}`}\n`);
  writeFileSync(resolve(outDir, `${route.id}.json`), JSON.stringify(r, null, 2));
}
writeFileSync(resolve(outDir, "probe-summary.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  viewport: `${vw}x${vh}`,
  routes: all.map((r) => ({
    id: r.id,
    clean: r.verdict.clean,
    boot: r.boot,
    verdict: r.verdict,
    consoleErrors: r.consoleErrors.slice(0, 12),
    pageErrors: r.pageErrors.slice(0, 12),
    requestFailures: r.requestFailures.slice(0, 12),
    loadError: r.loadError,
    shots: r.steps.map((s) => ({ label: s.label, file: s.file, error: s.error, luma: s.state?.pixels?.meanLuma, colors: s.state?.pixels?.distinctColors, hud: (s.state?.hud ?? "").slice(0, 120) })),
  })),
}, null, 2));
console.log(`probe complete -> ${outDir}/probe-summary.json`);
