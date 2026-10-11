/**
 * Lane 11 capture runner (prd11). Drives the lane scene pages on a local vite
 * dev server and records, per scene x engine x flag set:
 *   - the `__QR_READY__` payload (status, drawCalls, errors)
 *   - `__PRD11_APP__.diagnostics().frame` (C-28 frame telemetry, aura3d only)
 *   - a WebGL2 probe block (renderer string, timerQuery availability)
 *   - a WebGPU adapter probe (non-gating smoke signal for the webgpu lane flag)
 *
 * Usage: node scenes/prd11/capture.mjs [--flags tiers|none] [--out <dir>]
 *        [--scenes <id,id>] [--engines aura3d,three] [--webgpu-probe]
 *
 * Env mirrors the harness: QR_BENCH_CHROME_ARGS, QR_BENCH_CHANNEL
 * (headless-shell for GitLab saas-macos runners).
 */

import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const benchRoot = resolve(here, "../..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const outDir = arg("out", join(here, "out"));
const flagsArg = (arg("flags", "tiers") || "none").split(",").filter(Boolean);
const engines = (arg("engines", "aura3d,three") || "").split(",").filter(Boolean);
const sceneIds = (arg("scenes", "prd11-tier-ladder") || "").split(",").filter(Boolean);
const wantWebgpuProbe = process.argv.includes("--webgpu-probe");

const launchArgs = () => (process.env.QR_BENCH_CHROME_ARGS ?? "--use-angle=metal --enable-gpu --ignore-gpu-blocklist").split(/\s+/).filter(Boolean);

async function startProfile(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  await cdp.send("Profiler.start");
  return cdp;
}

/** Top 30 functions by self time (ms) from a CDP CPU profile. */
async function stopProfile(cdp) {
  const stopped = await Promise.race([
    cdp.send("Profiler.stop"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Profiler.stop timeout")), 60_000))
  ]);
  const { nodes, samples, timeDeltas } = stopped.profile;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const self = new Map();
  for (let i = 0; i < samples.length; i += 1) {
    const node = byId.get(samples[i]);
    if (!node) continue;
    const frame = node.callFrame;
    const key = `${frame.functionName || "(anonymous)"} ${String(frame.url).replace(/^.*\/(packages|node_modules|benchmarks)\//, "$1/")}:${frame.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (timeDeltas[i] ?? 0) / 1000);
  }
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([fn, ms]) => ({ fn, selfMs: Math.round(ms) }));
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const server = await createServer({
    configFile: join(benchRoot, "vite.config.ts"),
    root: benchRoot,
    logLevel: "error",
    server: { port: 5199, strictPort: false }
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === "object" && address ? address.port : 5199;
  const baseUrl = `http://127.0.0.1:${port}`;

  const channel = process.env.QR_BENCH_CHANNEL === "headless-shell" ? undefined : (process.env.QR_BENCH_CHANNEL || "chromium");
  const browser = await chromium.launch({ channel, headless: true, args: launchArgs() });

  const report = {
    schema: "prd11-lane-capture/1.0",
    generatedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      node: process.version,
      ci: Boolean(process.env.CI),
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
      gitlabPipeline: process.env.CI_PIPELINE_ID ?? null,
      browserChannel: process.env.QR_BENCH_CHANNEL || "chromium",
      browserVersion: browser.version(),
      launchArgs: launchArgs()
    },
    probe: null,
    webgpu: null,
    scenes: []
  };

  try {
    // Probe: every lane CI job that renders logs the WebGL2 renderer + timerQuery (PRD-11 §18).
    const probePage = await browser.newPage();
    await probePage.setContent(`<canvas id=c width=64 height=64></canvas><script>
      const gl=document.getElementById('c').getContext('webgl2');
      const info=gl&&gl.getExtension('WEBGL_debug_renderer_info');
      const tq=gl&&gl.getExtension('EXT_disjoint_timer_query_webgl2');
      window.__probe={webgl2:!!gl,renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):null,vendor:info?gl.getParameter(info.UNMASKED_VENDOR_WEBGL):null,maxSamples:gl?gl.getParameter(gl.MAX_SAMPLES):0,maxTextureSize:gl?gl.getParameter(gl.MAX_TEXTURE_SIZE):0,timerQuery:!!tq,timestamp:tq?('TIMESTAMP_EXT' in tq):null};
    </script>`);
    report.probe = await probePage.evaluate(() => window.__probe);
    await probePage.close();
    console.log(`[prd11-capture] probe: ${JSON.stringify(report.probe)}`);

    if (wantWebgpuProbe) {
      const page = await browser.newPage();
      report.webgpu = await page.evaluate(async () => {
        if (!("gpu" in navigator)) return { available: false, reason: "navigator.gpu absent" };
        try {
          const adapter = await navigator.gpu.requestAdapter();
          if (!adapter) return { available: false, reason: "requestAdapter returned null" };
          const info = adapter.info ?? {};
          return { available: true, vendor: info.vendor ?? null, architecture: info.architecture ?? null, description: info.description ?? null };
        } catch (error) {
          return { available: false, reason: String(error?.message ?? error) };
        }
      });
      await page.close();
      console.log(`[prd11-capture] webgpu: ${JSON.stringify(report.webgpu)}`);
    }

    for (const sceneId of sceneIds) {
      for (const flags of flagsArg) {
        const entry = { scene: sceneId, flags, engines: {} };
        for (const engine of engines) {
          const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
          // `scene=` selects the adapter; without it every id captured tier-ladder.
          const url = `${baseUrl}/scenes/prd11/index.html?engine=${engine}&scene=${sceneId}&a3d-qr=${flags}`;
          const consoleErrors = [];
          page.on("pageerror", (error) => consoleErrors.push(String(error)));
          const started = Date.now();
          // Track 0 ready-time attribution: wall-clock phases on the runner side,
          // plus the adapter's own marks (window.__PRD11_PROGRESS__), also on timeout.
          const phases = { gotoMs: null, rafHz: null, readyMs: null };
          const progress = () => page.evaluate(() => window.__PRD11_PROGRESS__ ?? null).catch(() => null);
          // QR_PRD11_PROFILE=1: V8 sampling profile of the aura3d page, summarised
          // as top self-time functions — attributes where a minutes-long
          // app.step goes (GPU run 38118205812: first step ~245 s, none and tiers alike).
          const profiler = engine === "aura3d" && process.env.QR_PRD11_PROFILE === "1"
            ? await startProfile(page).catch(() => null)
            : null;
          try {
            await page.goto(url, { waitUntil: "load", timeout: 60_000 });
            phases.gotoMs = Date.now() - started;
            // rAF cadence right after load: headless GPU runners can throttle
            // rAF (lane 07 saw ~200 s ready even flag-off), which stretches any
            // frame-count wait. Measured per page so arms stay comparable.
            phases.rafHz = await page.evaluate(() => new Promise((resolve) => {
              let frames = 0;
              const t0 = performance.now();
              const tick = () => {
                frames += 1;
                if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
                else resolve(Math.round((frames * 1000) / (performance.now() - t0)));
              };
              requestAnimationFrame(tick);
              setTimeout(() => resolve(frames), 5000);
            })).catch(() => null);
            await page.waitForFunction(() => Boolean(window.__QR_READY__), undefined, { timeout: 120_000, polling: 500 });
            phases.readyMs = Date.now() - started;
            // Let frame telemetry accumulate >=35 samples before reading.
            await page.waitForFunction(() => {
              const app = window.__PRD11_APP__;
              if (!app) return false;
              try {
                return (app.diagnostics().frame?.frames ?? 0) >= 35;
              } catch { return false; }
            }, undefined, { timeout: 60_000, polling: 500 }).catch(() => undefined);
            const ready = await page.evaluate(() => window.__QR_READY__ ?? null);
            const frame = engine === "aura3d" ? await page.evaluate(() => {
              const app = window.__PRD11_APP__;
              if (!app) return null;
              try { return app.diagnostics().frame ?? null; } catch { return null; }
            }) : null;
            entry.engines[engine] = { status: ready?.errors?.length ? "error" : "ready", wallMs: Date.now() - started, phases, progress: await progress(), payload: ready, frame, consoleErrors };
            console.log(`[prd11-capture] ${sceneId} ${flags} ${engine}: ${entry.engines[engine].status} (${Date.now() - started} ms)`);
          } catch (error) {
            entry.engines[engine] = { status: "error", wallMs: Date.now() - started, phases, progress: await progress(), error: String(error?.message ?? error), consoleErrors };
            console.log(`[prd11-capture] ${sceneId} ${flags} ${engine}: error ${String(error?.message ?? error).split("\n")[0]}`);
          } finally {
            if (profiler && entry.engines[engine]) {
              entry.engines[engine].profileTop = await stopProfile(profiler).catch((error) => [{ error: String(error?.message ?? error) }]);
            }
            await page.close();
          }
        }
        report.scenes.push(entry);
        writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`[prd11-capture] report: ${join(outDir, "report.json")}`);
}

main().catch((error) => {
  console.error(`[prd11-capture] fatal: ${error?.stack ?? error}`);
  process.exitCode = 1;
});
