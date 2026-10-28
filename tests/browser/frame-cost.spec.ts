import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Frame cost, draw calls and first-frame time for the cube and the PBR stand-in scene (beat-three.js PRD, WP-P1.4;
 * targets P1-P4 and Q2). Remote only (tools/remote-acr/run.sh): the runner is software WebGL2 (SwiftShader), so
 * these are software-rasteriser times, never GPU times.
 *
 *   SPECS=tests/browser/frame-cost.spec.ts tools/remote-acr/run.sh
 *
 * Metrics are printed between FRAME_COST_JSON_BEGIN/END lines in the run log. Set FRAME_COST_GATE=0 to record without
 * asserting the targets (used to take baselines); the console-empty assertion always applies.
 */
const GATE = process.env.FRAME_COST_GATE !== "0";
const FRAMES = Number(process.env.FRAME_COST_FRAMES ?? 60);
const COLD_LOADS = Number(process.env.FRAME_COST_COLD_LOADS ?? 3);
const REPORT = "tests/reports/frame-cost/frame-cost.json";
const results: Record<string, unknown> = {};

/** Targets from the PRD (software GL). `pbr` P4 applies to the PBR viewer; here it is judged on the stand-in scene. */
const TARGETS = {
  cube: { totalMsMedian: 5, cpuMsMedian: 0.5, firstFrameMs: 500, drawCalls: 1 },
  pbr: { drawCalls: 25 }
} as const;

const GL_HOOK = `(() => {
  const c = { draws: 0, blits: 0, msaa: [] };
  window.__GLC__ = c;
  const proto = WebGL2RenderingContext.prototype;
  for (const [name] of [["drawArrays"], ["drawElements"], ["drawArraysInstanced"], ["drawElementsInstanced"], ["drawRangeElements"]]) {
    const orig = proto[name];
    if (!orig) continue;
    proto[name] = function (...a) { c.draws++; return orig.apply(this, a); };
  }
  const bf = proto.blitFramebuffer;
  proto.blitFramebuffer = function (...a) { c.blits++; return bf.apply(this, a); };
  const rm = proto.renderbufferStorageMultisample;
  proto.renderbufferStorageMultisample = function (t, samples, fmt, w, h) {
    const key = samples + "x " + fmt + " " + w + "x" + h;
    if (!c.msaa.includes(key) && c.msaa.length < 24) c.msaa.push(key);
    return rm.call(this, t, samples, fmt, w, h);
  };
})();`;

interface Run { firstFrameMs: number; mountMs: number; cpuMs: number[]; totalMs: number[]; draws: number; blits: number; msaa: string[]; renderPath: unknown; errors: string[]; console: string[] }

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

async function load(page: Page, origin: string, scene: string, quality: string): Promise<Run> {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    // "GPU stall due to ReadPixels" is Chromium's note on the harness's own blocking readPixels (the gl.finish stand-in), not the app.
    if ((message.type() === "warning" || message.type() === "error") && !/GPU stall due to ReadPixels/.test(message.text())) {
      consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
  await page.addInitScript(GL_HOOK);
  await page.goto(`${origin}/tests/browser/frame-cost-harness.html?scene=${scene}&quality=${quality}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as { __FRAME_COST__?: unknown }).__FRAME_COST__), undefined, { timeout: 120_000 });
  return page.evaluate((frames) => {
    const api = (window as unknown as { __FRAME_COST__: { ready: boolean; firstFrameMs: number; mountMs: number; errors: string[]; renderPath: unknown; measure(n: number): { cpuMs: number[]; totalMs: number[] }; stepOnce(): void; drawCalls(): number } }).__FRAME_COST__;
    const glc = (window as unknown as { __GLC__: { draws: number; blits: number; msaa: string[] } }).__GLC__;
    const measured = api.measure(frames);
    // One more frame with a zeroed counter: all passes (shadow, background, output) of a single steady frame.
    glc.draws = 0; glc.blits = 0;
    api.stepOnce();
    return { firstFrameMs: api.firstFrameMs, mountMs: api.mountMs, ...measured, draws: glc.draws, blits: glc.blits, msaa: glc.msaa, renderPath: api.renderPath, errors: api.errors, console: [] };
  }, FRAMES).then((run) => ({ ...run, console: consoleProblems }));
}

test.describe("frame cost (software WebGL2)", () => {
  test.setTimeout(30 * 60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => {
    await server.close();
    mkdirSync(dirname(resolve(REPORT)), { recursive: true });
    writeFileSync(resolve(REPORT), `${JSON.stringify({ generatedAt: new Date().toISOString(), renderer: "swiftshader", results }, null, 2)}\n`);
    const base64 = Buffer.from(JSON.stringify(results)).toString("base64");
    console.log("FRAME_COST_JSON_BEGIN");
    for (let i = 0; i * 3000 < base64.length; i += 1) console.log(`FRAME_COST_JSON:${i}:${base64.slice(i * 3000, (i + 1) * 3000)}`);
    console.log("FRAME_COST_JSON_END");
  });

  for (const scene of ["cube", "pbr"] as const) {
    test(`${scene}: auto quality`, async ({ browser }) => {
      const firstFrames: number[] = [];
      const mounts: number[] = [];
      const problems: string[] = [];
      let last: Run | undefined;
      for (let i = 0; i < COLD_LOADS; i += 1) {
        const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        last = await load(page, server.origin, scene, "auto");
        firstFrames.push(last.firstFrameMs);
        mounts.push(last.mountMs);
        await context.close();
        // Q2: nothing on the console, and no page errors, on any cold load.
        problems.push(...last.errors.map((m) => `page error: ${m}`), ...last.console);
      }
      const run = last!;
      const summary = {
        scene,
        quality: "auto",
        renderPath: run.renderPath,
        firstFrameMsMedian: median(firstFrames),
        mountMsMedian: median(mounts),
        totalMsMedian: median(run.totalMs),
        cpuMsMedian: median(run.cpuMs),
        drawCalls: run.draws,
        blits: run.blits,
        msaaTargets: run.msaa,
        consoleProblems: problems
      };
      results[`${scene}/auto`] = summary;
      console.log(`FRAME_COST ${JSON.stringify(summary)}`);
      expect(problems, `${scene} console warnings/errors and page errors (Q2)`).toEqual([]);
      if (scene === "cube") expect((run.renderPath as { path?: string } | null)?.path).toBe("direct");
      if (!GATE) return;
      if (scene === "cube") {
        expect(summary.totalMsMedian, "P1 steady-state frame (ms)").toBeLessThanOrEqual(TARGETS.cube.totalMsMedian);
        expect(summary.cpuMsMedian, "P2 CPU inside frame() (ms)").toBeLessThanOrEqual(TARGETS.cube.cpuMsMedian);
        // The in-repo harness loads ~hundreds of unbundled dev-server modules, so time since navigation is not the bench's
        // bundled figure; the engine-owned part (createAuraApp to first frame) is what this gate measures.
        expect(summary.mountMsMedian, "P3 createAuraApp to first frame (ms)").toBeLessThanOrEqual(TARGETS.cube.firstFrameMs);
        expect(summary.drawCalls, "P4 draw calls").toBeLessThanOrEqual(TARGETS.cube.drawCalls);
      } else {
        expect(summary.drawCalls, "P4 draw calls (PBR stand-in)").toBeLessThanOrEqual(TARGETS.pbr.drawCalls);
      }
    });
  }

  test("cube: quality production keeps the HDR multisampled path", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const run = await load(page, server.origin, "cube", "production");
    await context.close();
    const summary = {
      scene: "cube",
      quality: "production",
      renderPath: run.renderPath,
      totalMsMedian: median(run.totalMs),
      cpuMsMedian: median(run.cpuMs),
      drawCalls: run.draws,
      blits: run.blits,
      msaaTargets: run.msaa
    };
    results["cube/production"] = { ...summary, consoleProblems: [...run.errors, ...run.console] };
    console.log(`FRAME_COST ${JSON.stringify(results["cube/production"])}`);
    expect((run.renderPath as { path?: string } | null)?.path).toBe("hdr-msaa");
    expect([...run.errors, ...run.console], "console warnings/errors and page errors").toEqual([]);
  });
});

interface ProfileNode { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; }
interface CpuProfile { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }

/** Top self-time functions of a V8 sampling profile (ms and % of non-idle time). */
function topSelfTimes(profile: CpuProfile, limit = 18): { fn: string; selfMs: number; pct: number }[] {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map<string, number>();
  let busy = 0;
  profile.samples.forEach((id, i) => {
    const node = byId.get(id);
    const dt = (profile.timeDeltas[i] ?? 0) / 1000;
    if (!node || node.callFrame.functionName === "(idle)") return;
    const file = node.callFrame.url.split("/").slice(-2).join("/");
    const key = `${node.callFrame.functionName || "(anonymous)"} @ ${file}:${node.callFrame.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + dt);
    busy += dt;
  });
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([fn, selfMs]) => ({ fn, selfMs: Math.round(selfMs * 10) / 10, pct: Math.round((selfMs / Math.max(busy, 1)) * 1000) / 10 }));
}

test.describe("frame cost: CPU profiles (unminified dev-server modules, direct path)", () => {
  test.setTimeout(10 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("cube: first-frame and steady-frame profiles", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
    await page.goto(`${server.origin}/tests/browser/frame-cost-harness.html?scene=cube&quality=auto`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __FRAME_COST__?: unknown }).__FRAME_COST__), undefined, { timeout: 120_000 });
    const first = (await cdp.send("Profiler.stop")).profile as unknown as CpuProfile;
    await cdp.send("Profiler.start");
    await page.evaluate((frames) => (window as unknown as { __FRAME_COST__: { measure(n: number): unknown } }).__FRAME_COST__.measure(frames), FRAMES);
    const steady = (await cdp.send("Profiler.stop")).profile as unknown as CpuProfile;
    const report = { firstFrame: topSelfTimes(first), steadyFrames: topSelfTimes(steady) };
    results["cube/auto/profile"] = report;
    console.log(`FRAME_COST_PROFILE ${JSON.stringify(report)}`);
    await context.close();
  });
});

/** Every WebGL2 call of one steady frame, by name: the native cost behind "(program)" in the CPU profile is proportional to this. */
const GL_CENSUS_HOOK = `(() => {
  const counts = {};
  const trace = [];
  window.__GL_CENSUS__ = { counts, trace, on: false };
  const proto = WebGL2RenderingContext.prototype;
  const describe = (v) => (v === null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : typeof v === "object" ? (v.constructor && v.constructor.name) || "object" : typeof v);
  for (const name of Object.getOwnPropertyNames(proto)) {
    let fn;
    try { fn = proto[name]; } catch { continue; }
    if (typeof fn !== "function" || name === "constructor") continue;
    proto[name] = function (...a) {
      if (window.__GL_CENSUS__.on) {
        counts[name] = (counts[name] || 0) + 1;
        trace.push(name + "(" + a.slice(0, 4).map(describe).join(",") + ")");
      }
      return fn.apply(this, a);
    };
  }
})();`;

test.describe("frame cost: GL call census (direct path)", () => {
  test.setTimeout(10 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("cube: GL calls in one steady frame", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript(GL_CENSUS_HOOK);
    await page.goto(`${server.origin}/tests/browser/frame-cost-harness.html?scene=cube&quality=auto`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __FRAME_COST__?: unknown }).__FRAME_COST__), undefined, { timeout: 120_000 });
    const census = await page.evaluate(() => {
      const api = (window as unknown as { __FRAME_COST__: { stepOnce(): void } }).__FRAME_COST__;
      const state = (window as unknown as { __GL_CENSUS__: { counts: Record<string, number>; trace: string[]; on: boolean } }).__GL_CENSUS__;
      for (let i = 0; i < 60; i += 1) api.stepOnce();
      for (const key of Object.keys(state.counts)) delete state.counts[key];
      state.trace.length = 0;
      state.on = true;
      api.stepOnce();
      state.on = false;
      return { counts: { ...state.counts }, trace: [...state.trace] };
    });
    const total = Object.values(census.counts).reduce((a, b) => a + b, 0);
    console.log(`GL_CENSUS ${JSON.stringify({ total, calls: Object.entries(census.counts).sort((a, b) => b[1] - a[1]) })}`);
    console.log(`GL_TRACE ${JSON.stringify(census.trace)}`);
    await context.close();
  });
});
