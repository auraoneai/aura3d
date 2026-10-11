/**
 * glb-mount-phases.spec.ts — lane-05 Track 0 (#375) ready-time attribution
 * for GLB scenes (03-damaged-helmet, 08-skinned-character) on the GPU runner.
 *
 * This loads the real benchmark page, the same URL contract as
 * benchmarks/quality-rebuild/capture.mjs, from the benchmark vite dev server,
 * and streams every `a3d:*` / `qr:harness:*` performance mark, every long
 * task and a 250 ms main-thread heartbeat to the console as it happens. A page
 * whose main thread later wedges, which is why capture.mjs's post-timeout
 * `getEntriesByType` returned nothing on run 38118855565, still leaves the
 * timeline up to the stall. The report names the last phase reached and the
 * longest heartbeat gap.
 *
 * Gate: the scene publishes __QR_READY__ within the §2.5 30 s budget. That
 * fails today, by design (Track 0). The JSON under tests/reports is the output.
 */
import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SCENES = (process.env.PRD05_PHASE_SCENES ?? "03-damaged-helmet,08-skinned-character").split(",").filter(Boolean);
const FLAG_SETS = (process.env.PRD05_PHASE_FLAG_SETS ?? "none").split(";").filter(Boolean);
const READY_BUDGET_MS = 30_000;
const OBSERVE_MS = Number(process.env.PRD05_PHASE_OBSERVE_MS ?? "150000");
const PORT = 5299;

let server: ChildProcess | undefined;

async function waitForServer(url: string, deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`benchmark dev server did not answer at ${url} within ${deadlineMs} ms`);
}

test.beforeAll(async () => {
  server = spawn("pnpm", ["exec", "vite", "--config", "benchmarks/quality-rebuild/vite.config.ts", "--port", String(PORT), "--strictPort"], {
    stdio: "inherit",
    env: process.env
  });
  await waitForServer(`http://127.0.0.1:${PORT}/index.html`, 120_000);
});

test.afterAll(() => {
  server?.kill("SIGTERM");
});

// Injected before any page script: streams marks, long tasks and a heartbeat.
const INIT = `(() => {
  const t0 = performance.now();
  const emit = (kind, name, t, d) => console.log("[qrphase]" + JSON.stringify({ kind, name, t: Math.round(t), d: d === undefined ? undefined : Math.round(d) }));
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.name.startsWith("a3d:") || e.name.startsWith("qr:harness:")) emit("mark", e.name, e.startTime); }).observe({ type: "mark", buffered: true });
  } catch (e) { emit("error", "mark-observer:" + e, performance.now()); }
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) emit("longtask", e.name, e.startTime, e.duration); }).observe({ type: "longtask", buffered: true });
  } catch (e) { emit("error", "longtask-observer:" + e, performance.now()); }
  let last = performance.now();
  setInterval(() => { const now = performance.now(); if (now - last > 1000) emit("gap", "heartbeat", last, now - last); last = now; }, 250);
  emit("mark", "qrphase:init", performance.now() - t0);
})();`;

for (const flags of FLAG_SETS) {
  for (const scene of SCENES) {
    test(`QR05-DIAG GLB mount phases: ${scene} [${flags}]`, async ({ page }) => {
      test.setTimeout(OBSERVE_MS + 60_000);
      const events: { kind: string; name: string; t: number; d?: number }[] = [];
      const pageErrors: string[] = [];
      page.on("console", (msg) => {
        const text = msg.text();
        if (text.startsWith("[qrphase]")) events.push(JSON.parse(text.slice("[qrphase]".length)));
      });
      page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 600)));
      await page.addInitScript({ content: INIT });
      const flagsQuery = flags !== "none" ? `&a3d-qr=${encodeURIComponent(flags)}` : "";
      const started = Date.now();
      await page.goto(`http://127.0.0.1:${PORT}/index.html?engine=aura3d&scene=${scene}${flagsQuery}&timeout=${OBSERVE_MS}`, { waitUntil: "load", timeout: 60_000 });
      let readyMs: number | null = null;
      let outcome = "timeout";
      try {
        await page.waitForFunction(() => (window as any).__QR_READY__ !== undefined || (window as any).__QR_ERROR__ !== undefined, undefined, { timeout: OBSERVE_MS, polling: 500 });
        readyMs = Date.now() - started;
        outcome = (await page.evaluate(() => (window as any).__QR_ERROR__ !== undefined)) ? "error" : "ready";
      } catch {
        outcome = "timeout";
      }
      const marks = events.filter((e) => e.kind === "mark");
      const gaps = events.filter((e) => e.kind === "gap").sort((a, b) => (b.d ?? 0) - (a.d ?? 0));
      const longtasks = events.filter((e) => e.kind === "longtask").sort((a, b) => (b.d ?? 0) - (a.d ?? 0));
      const report = {
        scene, flags, outcome, readyMs, observeMs: OBSERVE_MS,
        lastMark: marks.at(-1) ?? null,
        longestGap: gaps[0] ?? null,
        topLongTasks: longtasks.slice(0, 10),
        marks, gaps: gaps.slice(0, 20), pageErrors
      };
      mkdirSync(resolve("tests/reports"), { recursive: true });
      writeFileSync(resolve(`tests/reports/prd05-glb-mount-phases.${scene}.${flags.replace(/[^A-Za-z0-9_-]/g, "_")}.json`), `${JSON.stringify(report, null, 2)}\n`);
      expect(outcome, `${scene} [${flags}] did not publish __QR_READY__; last mark ${JSON.stringify(report.lastMark)}`).toBe("ready");
      expect(readyMs!, `${scene} [${flags}] ready time vs the §2.5 budget`).toBeLessThanOrEqual(READY_BUDGET_MS);
    });
  }
}
