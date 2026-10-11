#!/usr/bin/env node
/**
 * PRD-10 Track 0 (a) ready-time probe. For each scene × flag set it loads the
 * quality-rebuild page on the vite dev server, so frame URLs are source paths,
 * records a CPU profile from navigation to READY/ERROR, and writes:
 *   - wall time to READY, engine `a3d:mount:*` marks, and rAF frame stats
 *     (count, mean interval, mean/max callback ms);
 *   - CPU self time per source bucket, with lane 10 (world) singled out and
 *     native GL time charged to its JS caller (attribution.mjs).
 *
 *   node benchmarks/quality-rebuild/scenes/prd10/ready/ready-probe.mjs \
 *     --scenes 09-outdoor-environment,17-large-environment --flags "none;world" \
 *     --out benchmarks/quality-rebuild/scenes/prd10/ready/out [--timeout 240000]
 *
 * GPU flags come from QR_BENCH_CHROME_ARGS, the same contract as capture.mjs.
 * The probe never masks: a timeout is recorded as `capture-timeout` along with
 * the profile up to that point, and the exit code is 0 only when every run wrote
 * a result.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { attributeProfile, frameStats } from "./attribution.mjs";

function parseArgs(argv) {
  const out = { scenes: ["09-outdoor-environment", "17-large-environment"], flags: ["none", "world"], out: "benchmarks/quality-rebuild/scenes/prd10/ready/out", timeout: 240_000, interval: 2000 };
  for (let i = 0; i < argv.length; i += 1) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (k === "--scenes") { out.scenes = v.split(",").filter(Boolean); i += 1; }
    else if (k === "--flags") { out.flags = v.split(";").map((s) => s.trim()).filter(Boolean); i += 1; }
    else if (k === "--out") { out.out = v; i += 1; }
    else if (k === "--timeout") { out.timeout = Number(v); i += 1; }
    else if (k === "--interval") { out.interval = Number(v); i += 1; }
  }
  return out;
}

function launchArgs() {
  const common = ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--force-color-profile=srgb"];
  const override = (process.env.QR_BENCH_CHROME_ARGS ?? "").split(/\s+/).filter(Boolean);
  return [...new Set([...common, ...override])];
}

/** rAF trace: wraps requestAnimationFrame so each fire records its time and callback cost. */
const RAF_TRACE = () => {
  const frames = [];
  window.__PRD10_RAF__ = frames;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    const start = performance.now();
    try { cb(t); } finally { frames.push({ t: start, cbMs: performance.now() - start }); }
  });
};

async function probeOne(browser, baseUrl, scene, flags, args) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(RAF_TRACE);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: args.interval });
  const flagsQuery = `&a3d-qr=${encodeURIComponent(flags || "none")}`;
  const url = `${baseUrl}/index.html?engine=aura3d&scene=${scene}${flagsQuery}&timeout=${args.timeout}`;
  const result = { scene, flags, status: "error" };
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e).slice(0, 600)));
  await cdp.send("Profiler.start");
  const t0 = Date.now();
  try {
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    result.loadEventMs = Date.now() - t0;
    await page.waitForFunction(() => Boolean(window.__QR_READY__ || window.__QR_ERROR__), undefined, { timeout: args.timeout, polling: 250 });
    const state = await page.evaluate(() => ({ ready: Boolean(window.__QR_READY__), error: window.__QR_ERROR__ ? String(window.__QR_ERROR__).slice(0, 600) : null, draws: window.__QR_READY__?.drawCalls ?? null }));
    result.status = state.error ? "error" : "ready";
    result.error = state.error;
    result.drawCalls = state.draws;
  } catch (error) {
    result.status = /timeout/i.test(String(error)) ? "capture-timeout" : "page-error";
    result.error = String(error).split("\n")[0];
  }
  result.wallMs = Date.now() - t0;
  const { profile } = await cdp.send("Profiler.stop");
  const pageData = await page.evaluate(() => ({
    marks: performance.getEntriesByType("mark").map((m) => ({ name: m.name, t: Math.round(m.startTime) })),
    raf: window.__PRD10_RAF__ ?? []
  })).catch(() => ({ marks: [], raf: [] }));
  result.marks = pageData.marks;
  result.frames = frameStats(pageData.raf);
  result.cpu = attributeProfile(profile);
  result.pageErrors = pageErrors;
  await context.close();
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });
  const server = await createServer({ configFile: resolve("benchmarks/quality-rebuild/vite.config.ts"), server: { port: 0, host: "127.0.0.1" }, logLevel: "warn" });
  await server.listen();
  const address = server.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ channel: "chromium", headless: true, args: launchArgs() });
  const results = [];
  let gpu = "unknown";
  try {
    // Warm the dev server's transform cache so the first measured run is not a cold compile.
    const warm = await browser.newPage();
    await warm.goto(`${baseUrl}/index.html`, { waitUntil: "load", timeout: 300_000 });
    gpu = await warm.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : "no-webgl2";
    });
    await warm.close();
    console.log(`[prd10-ready] GPU: ${gpu}`);
    for (const scene of args.scenes) {
      // One untimed warm-up per scene compiles its module graph in vite.
      await probeOne(browser, baseUrl, scene, "none", { ...args, timeout: Math.min(args.timeout, 60_000) }).catch(() => undefined);
      for (const flags of args.flags) {
        const r = await probeOne(browser, baseUrl, scene, flags, args);
        results.push(r);
        console.log(`[prd10-ready] ${scene} [${flags}] ${r.status} wall=${r.wallMs}ms busy=${r.cpu.busyMs}ms lane10=${r.cpu.lane10Ms}ms (${(r.cpu.lane10ShareOfBusy * 100).toFixed(1)}%) frames=${r.frames.count} cb=${r.frames.meanCallbackMs}ms`);
        writeFileSync(join(args.out, "ready-probe.json"), JSON.stringify({ gpu, launchArgs: launchArgs(), results }, null, 2));
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  writeFileSync(join(args.out, "ready-probe.json"), JSON.stringify({ gpu, launchArgs: launchArgs(), results }, null, 2));
  writeFileSync(join(args.out, "ready-probe.md"), `GPU: ${gpu}\n\n${renderMarkdown(results)}`);
  if (results.length !== args.scenes.length * args.flags.length) process.exit(1);
}

function renderMarkdown(results) {
  const lines = ["| scene | flags | status | wall s | busy s | lane-10 s (share) | frames | mean cb ms | top buckets |", "|---|---|---|---|---|---|---|---|---|"];
  for (const r of results) {
    const topBuckets = Object.entries(r.cpu.buckets).filter(([k]) => k !== "(idle)").slice(0, 4).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(", ");
    lines.push(`| ${r.scene} | ${r.flags} | ${r.status} | ${(r.wallMs / 1000).toFixed(1)} | ${(r.cpu.busyMs / 1000).toFixed(1)} | ${(r.cpu.lane10Ms / 1000).toFixed(2)} (${(r.cpu.lane10ShareOfBusy * 100).toFixed(1)}%) | ${r.frames.count} | ${r.frames.meanCallbackMs} | ${topBuckets} |`);
  }
  lines.push("", "Top self-time functions per run:");
  for (const r of results) {
    lines.push("", `- ${r.scene} [${r.flags}]: ${r.cpu.topFunctions.slice(0, 8).map((f) => `${f.fn} ${f.ms}ms`).join("; ")}`);
    if (r.cpu.topLane10Functions.length) lines.push(`  - lane 10: ${r.cpu.topLane10Functions.slice(0, 6).map((f) => `${f.fn} ${f.ms}ms`).join("; ")}`);
  }
  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
