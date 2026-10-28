import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Forest 10k (beat-three.js PRD, target P6). Remote only (tools/remote-acr/run.sh, software WebGL2): the bench's 18,000-instance
 * forest (8,000 trees as trunk + canopy instances, 2,000 rocks, shadow, fog, 640x360, production profile) built from WORKSPACE source
 * through the example dev server, driven through the same frame plan tools/bench-vs-threejs uses for this scene (1 cold load):
 * first frame, 4 warm, 1 counted, 4 warm, capture, 10 gap, capture, then measure() = 10 warm + 12 measured = 44 frames.
 *
 * Result: `wallMs` (page open -> last frame of the plan), per-frame stats, console errors. Emitted as `FOREST10K_RESULT <json>` and as
 * `PERFCOST_CHUNK` lines (tests/browser/perf-frame-cost/extract.mjs rebuilds the JSON). Timings are software-rasteriser timings,
 * not GPU timings.
 *
 * Gates asserted here: completes inside 5 minutes (P6, first half) and no console errors/warnings (Q2). The "<= 3x three.js 4x MSAA"
 * half is decided by tools/bench-vs-threejs/gate.mjs from `wallMs` / `frameMs.median` in this result.
 */
const PLAN_FRAMES = 44;
const WALL_LIMIT_MS = 300_000;
const URL_QUERY = "scene=forest&trees=8000&rocks=2000";

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, median: s[Math.floor(s.length / 2)] ?? 0, min: s[0] ?? 0, max: s[s.length - 1] ?? 0, mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 };
};

const emit = (name: string, value: unknown): void => {
  const json = JSON.stringify(value);
  mkdirSync("tests/reports/forest-10k", { recursive: true });
  writeFileSync(`tests/reports/forest-10k/${name}.json`, json);
  console.log(`FOREST10K_RESULT ${json}`);
  const b64 = Buffer.from(json).toString("base64");
  const size = 3000, n = Math.ceil(b64.length / size);
  for (let i = 0; i < n; i++) console.log(`PERFCOST_CHUNK ${name} ${i} ${n} ${b64.slice(i * size, (i + 1) * size)}`);
};

test.describe("forest 10k", () => {
  test.setTimeout(1_800_000);

  test("18,000 instances complete the bench frame plan within 5 minutes with an empty console", async ({ browser }) => {
    const server = await startExampleDevServer();
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    const consoleIssues: string[] = [];
    try {
      const page = await context.newPage();
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") consoleIssues.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
      page.on("pageerror", (e) => consoleIssues.push(`pageerror: ${String(e.message).slice(0, 300)}`));

      const t0 = Date.now();
      await page.goto(`${server.origin}/tests/browser/perf-frame-cost/index.html?${URL_QUERY}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as unknown as { __PROBE__?: unknown }).__PROBE__), undefined, { timeout: WALL_LIMIT_MS });
      const probe = await page.evaluate(() => {
        const p = (window as unknown as { __PROBE__: { ready: boolean; error?: string; setup?: { createMs: number; readyMs: number } } }).__PROBE__;
        return { ready: p.ready, error: p.error, setup: p.setup };
      });
      expect(probe.ready, probe.error).toBe(true);
      const setupMs = Date.now() - t0;

      const dt = 1 / 60;
      const step = () => page.evaluate((d) => (window as unknown as { __PROBE__: { frame(x: number): { cpuMs: number; totalMs: number } } }).__PROBE__.frame(d), dt);
      const frames: Array<{ cpuMs: number; totalMs: number }> = [];
      let overBudget = false;
      for (let i = 0; i < PLAN_FRAMES; i++) {
        if (Date.now() - t0 > WALL_LIMIT_MS * 2) { overBudget = true; break; }
        frames.push(await step());
      }
      const wallMs = Date.now() - t0;
      const first = frames[0];
      // The bench's measured window is the last 12 frames of the plan (after measure()'s 10 warm-up frames).
      const measured = frames.slice(-12);
      const result = {
        scene: "forest-aura-workspace",
        instances: 18_000,
        planFrames: PLAN_FRAMES,
        framesRun: frames.length,
        wallMs,
        setupMs,
        setup: probe.setup,
        firstFrameMs: first?.totalMs ?? null,
        frameMs: stats(measured.map((f) => f.totalMs)),
        cpuMs: stats(measured.map((f) => f.cpuMs)),
        allFrameMs: frames.map((f) => Math.round(f.totalMs)),
        consoleIssues: consoleIssues.slice(0, 20),
        overBudget,
        environment: "software WebGL2 (SwiftShader); not a GPU measurement",
        generatedUtc: new Date().toISOString()
      };
      emit("forest-10k", result);

      expect(overBudget).toBe(false);
      expect(frames.length).toBe(PLAN_FRAMES);
      expect(wallMs).toBeLessThanOrEqual(WALL_LIMIT_MS);
      expect(consoleIssues).toEqual([]);
    } finally {
      await context.close();
      await server.close();
    }
  });
});
