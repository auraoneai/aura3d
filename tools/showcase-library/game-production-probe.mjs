#!/usr/bin/env node
/*
 * Builds each game route with its real production bundler and plays the built output,
 * rather than trusting the Vite dev server.
 *
 * Section 42 requires re-opening games after the final build "rather than assuming
 * development mode represents the built result", and section 40 lists "No blank frame"
 * as a release gate. Nothing in the repository previously exercised a built bundle:
 * every browser spec runs against a dev server, so a route that renders in dev and
 * presents a black canvas after bundling passes all of them.
 *
 *   node tools/showcase-library/game-production-probe.mjs
 *   node tools/showcase-library/game-production-probe.mjs --routes showcase-rooftop-buckets
 *   ... --skip-build   (probe existing dist/ output only)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => (has(f) ? args[args.indexOf(f) + 1] : d);
const outDir = resolve(repoRoot, val("--out", "tests/reports/game-production-probe"));
const only = val("--routes", "").split(",").filter(Boolean);
const portBase = Number(val("--port", "4310"));
const blankLumaThreshold = Number(val("--blank-luma", "4"));

mkdirSync(outDir, { recursive: true });

const playbook = JSON.parse(
  readFileSync(resolve(repoRoot, "tools/showcase-library/game-play-playbook.json"), "utf8"),
);
const gameIds = Object.keys(playbook).filter((k) => !k.startsWith("$") && k !== "aura-clash-showcase");

function log(...a) { process.stderr.write(`${a.join(" ")}\n`); }

/**
 * Name the cause instead of reporting "black, no errors".
 *
 * Two silent failure modes were diagnosed by hand in this repo and both look identical in a
 * screenshot: a route entry whose top-level `await` deadlocks the bundled chunk graph (the module
 * halts before the scene mounts, and the dev server's different module graph hides it), and typed
 * assets that are absent from the bundle because the route's vite config omits the shared
 * publicDir. Neither produces a console error.
 */
function diagnoseBlank(id, entry) {
  const causes = [];
  const entryFile = resolve(repoRoot, "apps", id, "src", "main.ts");
  if (existsSync(entryFile)) {
    const lines = readFileSync(entryFile, "utf8").split("\n");
    const tla = [];
    for (const [index, line] of lines.entries()) {
      if (/^(await\s|const\s.+=\s*await\s|let\s.+=\s*await\s|var\s.+=\s*await\s)/.test(line)) tla.push(index + 1);
    }
    if (tla.length) {
      causes.push(`top-level await in src/main.ts at line(s) ${tla.join(", ")} — a TLA in the entry can deadlock the bundled chunk graph under vite build, halting the module before the scene mounts`);
    }
  }
  if (entry.assetsServedAsHtml?.length) {
    causes.push(`${entry.assetsServedAsHtml.length} typed asset request(s) were answered with the SPA index.html — the file is missing from the bundle; check that apps/${id}/vite.config.ts sets publicDir to the shared ../../public`);
  }
  if (!causes.length) causes.push("no statically detectable cause; inspect the renderer backend in the route's published evidence (backend 'scene-plan' with 0 drawCalls means the production renderer never mounted)");
  return causes;
}

function buildRoute(id, index) {
  const appDir = resolve(repoRoot, "apps", id);
  if (!existsSync(resolve(appDir, "package.json"))) return { ok: false, reason: "no package.json" };
  const port = portBase + index;
  try {
    execFileSync("pnpm", ["exec", "vite", "build"], { cwd: appDir, stdio: "pipe", timeout: 600_000 });
    return { ok: true, port };
  } catch (e) {
    return { ok: false, reason: String(e.stdout ?? e.message).slice(-400), port };
  }
}

function startPreview(id, port) {
  const appDir = resolve(repoRoot, "apps", id);
  const child = spawn("pnpm", ["exec", "vite", "preview", "--port", String(port), "--strictPort"], {
    cwd: appDir, stdio: "ignore", detached: true,
  });
  const wait = async () => {
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(`http://localhost:${port}/apps/${id}/`);
        if (res.ok) return true;
      } catch { /* not up yet */ }
    }
    return false;
  };
  return { child, wait };
}

function stopPreview(handle) {
  try { if (handle.child?.pid) process.kill(-handle.child.pid, "SIGKILL"); } catch { /* gone */ }
}

const routes = only.length ? only : gameIds;
const results = [];

for (const [index, id] of routes.entries()) {
  const entry = { id, built: false, previewUrl: null, verdict: null };
  const port = portBase + index;
  let handle = null;
  try {
    if (!has("--skip-build")) {
      const startedAt = Date.now();
      const b = buildRoute(id, index);
      entry.buildSeconds = Math.round((Date.now() - startedAt) / 1000);
      if (!b.ok) { entry.buildError = b.reason; results.push(entry); log(`${id} BUILD FAIL`); continue; }
    }
    entry.built = true;
    handle = startPreview(id, port);
    const up = await handle.wait();
    if (!up) { entry.previewError = "preview did not come up"; results.push(entry); log(`${id} PREVIEW FAIL`); continue; }

    const url = `http://localhost:${port}/apps/${id}/`;
    entry.previewUrl = url;
    const browser = await chromium.launch({
      args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-gl=angle",
        "--autoplay-policy=no-user-gesture-required"],
    });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const consoleErrors = []; const pageErrors = []; const failedRequests = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
    page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 300)));
    page.on("response", (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url().slice(0, 160)}`); });
    page.on("requestfailed", (r) => failedRequests.push(`FAIL ${r.url().slice(0, 160)}`));
    /*
     * A typed asset that is missing from the bundle does not fail the request: the static
     * server answers with the SPA index.html at 200, so the old "no failed requests" verdict
     * called it clean while the GLTF parser died on `<!DOCTYPE`. Record it explicitly.
     */
    const assetHtmlResponses = [];
    page.on("response", (r) => {
      const url = r.url();
      if (!/\.(glb|gltf|wav|ogg|mp3|hdr|ktx2|png|jpg|json)(\?|$)/i.test(url)) return;
      if ((r.headers()["content-type"] || "").includes("text/html")) {
        assetHtmlResponses.push(url.replace(`http://localhost:${port}`, "").slice(0, 140));
      }
    });

    await page.goto(url, { waitUntil: "load", timeout: 90_000 });
    await page.waitForSelector("canvas", { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(14_000);

    const shotDir = resolve(outDir, id);
    mkdirSync(shotDir, { recursive: true });
    // A stalled compositor should not cost us the pixel verdict, which is the point.
    let shotBuffer = null;
    try {
      shotBuffer = await page.screenshot({ path: resolve(shotDir, "production-first-load.png"), animations: "disabled", timeout: 60_000 });
    } catch (e) {
      entry.screenshotWarning = String(e.message ?? e).slice(0, 160);
    }

    /*
     * Blankness is measured from the composited screenshot, not from drawImage(canvas).
     * A WebGL canvas without preserveDrawingBuffer reads back as solid black through
     * drawImage even while it is visibly rendering, so the readback path both
     * false-positives a working route and hides a genuinely blank one. Decoding the
     * PNG in-page measures the same pixels a reviewer would see.
     */
    let composited = null;
    if (shotBuffer) {
      try {
        composited = await page.evaluate(async (b64) => {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
          const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
          const off = document.createElement("canvas");
          off.width = 160; off.height = 90;
          const ctx = off.getContext("2d");
          ctx.drawImage(bitmap, 0, 0, off.width, off.height);
          const d = ctx.getImageData(0, 0, off.width, off.height).data;
          let sum = 0; const uniq = new Set();
          for (let i = 0; i < d.length; i += 4) {
            sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
            uniq.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
          }
          bitmap.close();
          return { meanLuma: +(sum / (d.length / 4)).toFixed(1), distinctColors: uniq.size };
        }, shotBuffer.toString("base64"));
      } catch (e) {
        entry.compositedWarning = String(e.message ?? e).slice(0, 160);
      }
    }

    const probe = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return { hasCanvas: false };
      const off = document.createElement("canvas");
      off.width = 64; off.height = 64;
      const ctx = off.getContext("2d");
      ctx.drawImage(c, 0, 0, 64, 64);
      const d = ctx.getImageData(0, 0, 64, 64).data;
      let sum = 0; const uniq = new Set();
      for (let i = 0; i < d.length; i += 4) {
        sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
        uniq.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
      }
      return {
        hasCanvas: true,
        buffer: `${c.width}x${c.height}`,
        css: `${Math.round(c.getBoundingClientRect().width)}x${Math.round(c.getBoundingClientRect().height)}`,
        meanLuma: +(sum / (d.length / 4)).toFixed(1),
        distinctColors: uniq.size,
        hud: (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 160),
      };
    });

    entry.probe = { ...probe, composited };
    /*
     * Fail closed. When the screenshot could not be captured the composited verdict is
     * unavailable, and the drawImage readback that would replace it reads a live WebGL
     * canvas as solid black. Treating "unknown" as pass let five routes report CLEAN on
     * a screenshot timeout, and let a meanLuma of 4.2 (a near-black frame) squeak past a
     * threshold of 4. An unmeasured frame is not a verified frame.
     */
    const pixelVerdictAvailable = Boolean(composited);
    const luma = composited?.meanLuma ?? 0;
    const colors = composited?.distinctColors ?? 0;
    entry.verdict = {
      canvasPresent: Boolean(probe?.hasCanvas),
      // A canvas whose backing buffer is 0x0, or whose pixels are a single uniform value,
      // is a blank frame even though the page reports no errors at all.
      bufferSized: Boolean(probe?.buffer) && !/^0x0$/.test(probe?.buffer ?? ""),
      notBlank: pixelVerdictAvailable && luma > blankLumaThreshold && colors > 3,
      zeroConsoleErrors: consoleErrors.length === 0,
      zeroPageErrors: pageErrors.length === 0,
      zeroFailedRequests: failedRequests.length === 0,
    };
    entry.verdict.clean = Object.values(entry.verdict).every(Boolean);
    entry.consoleErrors = consoleErrors.slice(0, 8);
    entry.pageErrors = pageErrors.slice(0, 8);
    entry.failedRequests = failedRequests.slice(0, 8);
    if (!entry.verdict.notBlank) {
      entry.assetsServedAsHtml = [...new Set(assetHtmlResponses)].slice(0, 12);
      entry.blankCauses = diagnoseBlank(id, entry);
      log(`  blank causes for ${id}: ${JSON.stringify(entry.blankCauses)}`);
    }
    await browser.close();
    log(`${id} ${entry.verdict.clean ? "CLEAN" : `PROBLEM ${JSON.stringify(entry.verdict)}`}`);
  } catch (e) {
    entry.error = String(e).slice(0, 300);
    log(`${id} ERROR ${entry.error}`);
  } finally {
    if (handle) stopPreview(handle);
  }
  results.push(entry);
  writeFileSync(resolve(outDir, "production-probe.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), blankLumaThreshold, routes: results,
  }, null, 2));
}

const clean = results.filter((r) => r.verdict?.clean).length;
const blank = results.filter((r) => r.verdict && !r.verdict.notBlank).map((r) => r.id);
const broken = results.filter((r) => !r.built || r.error || (r.verdict && !r.verdict.clean));
log(`\nproduction probe: ${clean}/${results.length} clean`);
if (blank.length) log(`BLANK CANVAS in production build: ${blank.join(", ")}`);
if (broken.length) log(`needs attention: ${broken.map((r) => r.id).join(", ")}`);
log(`report -> ${resolve(outDir, "production-probe.json")}`);
