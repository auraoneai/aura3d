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

interface Run { firstFrameMs: number; cpuMs: number[]; totalMs: number[]; draws: number; blits: number; msaa: string[]; renderPath: unknown; errors: string[]; console: string[] }

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

async function load(page: Page, origin: string, scene: string, quality: string): Promise<Run> {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
  await page.addInitScript(GL_HOOK);
  await page.goto(`${origin}/tests/browser/frame-cost-harness.html?scene=${scene}&quality=${quality}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as { __FRAME_COST__?: unknown }).__FRAME_COST__), undefined, { timeout: 120_000 });
  return page.evaluate((frames) => {
    const api = (window as unknown as { __FRAME_COST__: { ready: boolean; firstFrameMs: number; errors: string[]; renderPath: unknown; measure(n: number): { cpuMs: number[]; totalMs: number[] }; stepOnce(): void; drawCalls(): number } }).__FRAME_COST__;
    const glc = (window as unknown as { __GLC__: { draws: number; blits: number; msaa: string[] } }).__GLC__;
    const measured = api.measure(frames);
    // One more frame with a zeroed counter: all passes (shadow, background, output) of a single steady frame.
    glc.draws = 0; glc.blits = 0;
    api.stepOnce();
    return { firstFrameMs: api.firstFrameMs, ...measured, draws: glc.draws, blits: glc.blits, msaa: glc.msaa, renderPath: api.renderPath, errors: api.errors, console: [] };
  }, FRAMES).then((run) => ({ ...run, console: consoleProblems }));
}

test.describe("frame cost (software WebGL2)", () => {
  test.setTimeout(30 * 60_000);
  let server: ExampleDevServer;
  const results: Record<string, unknown> = {};

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
      let last: Run | undefined;
      for (let i = 0; i < COLD_LOADS; i += 1) {
        const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        last = await load(page, server.origin, scene, "auto");
        firstFrames.push(last.firstFrameMs);
        await context.close();
        // Q2: nothing on the console, and no page errors, on any cold load.
        expect(last.errors, `${scene} page errors`).toEqual([]);
        expect(last.console, `${scene} console warnings/errors`).toEqual([]);
      }
      const run = last!;
      const summary = {
        scene,
        quality: "auto",
        renderPath: run.renderPath,
        firstFrameMsMedian: median(firstFrames),
        totalMsMedian: median(run.totalMs),
        cpuMsMedian: median(run.cpuMs),
        drawCalls: run.draws,
        blits: run.blits,
        msaaTargets: run.msaa
      };
      results[`${scene}/auto`] = summary;
      console.log(`FRAME_COST ${JSON.stringify(summary)}`);
      if (scene === "cube") expect((run.renderPath as { path?: string } | null)?.path).toBe("direct");
      if (!GATE) return;
      if (scene === "cube") {
        expect(summary.totalMsMedian, "P1 steady-state frame (ms)").toBeLessThanOrEqual(TARGETS.cube.totalMsMedian);
        expect(summary.cpuMsMedian, "P2 CPU inside frame() (ms)").toBeLessThanOrEqual(TARGETS.cube.cpuMsMedian);
        expect(summary.firstFrameMsMedian, "P3 time to first frame (ms)").toBeLessThanOrEqual(TARGETS.cube.firstFrameMs);
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
    results["cube/production"] = summary;
    console.log(`FRAME_COST ${JSON.stringify(summary)}`);
    expect((run.renderPath as { path?: string } | null)?.path).toBe("hdr-msaa");
    expect(run.console, "console warnings/errors").toEqual([]);
  });
});
