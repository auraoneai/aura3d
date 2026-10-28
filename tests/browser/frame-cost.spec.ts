import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
/** Frames in the steady-state CPU profile: a sampled profile of a ~1 ms frame needs hundreds of frames to be more than noise. */
const PROFILE_FRAMES = Number(process.env.FRAME_COST_PROFILE_FRAMES ?? 400);
const COLD_LOADS = Number(process.env.FRAME_COST_COLD_LOADS ?? 5);
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

interface Run { firstFrameMs: number; mountMs: number; cpuMs: number[]; cpuSteadyMs: number[]; totalMs: number[]; draws: number; blits: number; msaa: string[]; renderPath: unknown; errors: string[]; console: string[] }

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
    const api = (window as unknown as { __FRAME_COST__: { ready: boolean; firstFrameMs: number; mountMs: number; errors: string[]; renderPath: unknown; measure(n: number, warmup?: number): { cpuMs: number[]; totalMs: number[] }; stepOnce(): void; drawCalls(): number } }).__FRAME_COST__;
    const glc = (window as unknown as { __GLC__: { draws: number; blits: number; msaa: string[] } }).__GLC__;
    const measured = api.measure(frames);
    // Same measurement after 100 further warm-up frames: past the sampled getError window and the JIT tier-up, so the cost of a settled frame.
    const settled = api.measure(frames, 100);
    // One more frame with a zeroed counter: all passes (shadow, background, output) of a single steady frame.
    glc.draws = 0; glc.blits = 0;
    api.stepOnce();
    return { firstFrameMs: api.firstFrameMs, mountMs: api.mountMs, ...measured, cpuSteadyMs: settled.cpuMs, draws: glc.draws, blits: glc.blits, msaa: glc.msaa, renderPath: api.renderPath, errors: api.errors, console: [] };
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
      const cpuMedians: number[] = [];
      const cpuSettledMedians: number[] = [];
      const mounts: number[] = [];
      const problems: string[] = [];
      let last: Run | undefined;
      for (let i = 0; i < COLD_LOADS; i += 1) {
        const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        last = await load(page, server.origin, scene, "auto");
        firstFrames.push(last.firstFrameMs);
        cpuMedians.push(median(last.cpuMs));
        cpuSettledMedians.push(median(last.cpuSteadyMs));
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
        // `cpuMsMedian` / `cpuMsSettledMedian` are the median of the 60 measured frames of the LAST cold load only (the P2
        // gate figure, unchanged). The `...OfLoads` fields are the true median across the per-load medians below.
        cpuMsMedian: median(run.cpuMs),
        cpuMsSettledMedian: median(run.cpuSteadyMs),
        cpuMsMedianOfLoads: median(cpuMedians),
        cpuMsSettledMedianOfLoads: median(cpuSettledMedians),
        // One entry per cold load. The runner is shared and its load varies by tens of percent between runs, so the lowest
        // median across loads is the least-contended estimate of the cost.
        cpuMsMediansPerLoad: cpuMedians,
        cpuMsSettledMediansPerLoad: cpuSettledMedians,
        cpuMsMinMedian: Math.min(...cpuMedians),
        cpuMsSettledMinMedian: Math.min(...cpuSettledMedians),
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

interface ProfileNode { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[]; }
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

/**
 * Inclusive time per function (each function counted once per sample, so recursion does not double count) and a pruned call
 * tree, both in ms and as % of non-idle time. This is what shows which part of frame() the CPU goes to; self time alone
 * scatters it over hundreds of small functions.
 */
function inclusiveReport(profile: CpuProfile, limit = 70, treeMinPct = 0.8, treeDepth = 16): { inclusive: { fn: string; ms: number; pct: number }[]; tree: string[] } {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const label = (n: ProfileNode): string => {
    const file = n.callFrame.url.split("/").slice(-1)[0] ?? "";
    return `${n.callFrame.functionName || "(anonymous)"} @ ${file}:${n.callFrame.lineNumber + 1}`;
  };
  const inclusive = new Map<string, number>();
  const nodeTotal = new Map<number, number>();
  let busy = 0;
  profile.samples.forEach((id, i) => {
    const dt = (profile.timeDeltas[i] ?? 0) / 1000;
    const leaf = byId.get(id);
    if (!leaf || leaf.callFrame.functionName === "(idle)") return;
    busy += dt;
    const seen = new Set<string>();
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      const node = byId.get(cur)!;
      nodeTotal.set(cur, (nodeTotal.get(cur) ?? 0) + dt);
      const key = label(node);
      if (!seen.has(key)) { seen.add(key); inclusive.set(key, (inclusive.get(key) ?? 0) + dt); }
    }
  });
  const pct = (ms: number): number => Math.round((ms / Math.max(busy, 1)) * 1000) / 10;
  const tree: string[] = [];
  const walk = (id: number, depth: number): void => {
    const node = byId.get(id)!;
    const total = nodeTotal.get(id) ?? 0;
    if (pct(total) < treeMinPct || depth > treeDepth) return;
    tree.push(`${"  ".repeat(depth)}${Math.round(total * 10) / 10}ms ${pct(total)}% ${label(node)}`);
    for (const child of [...(node.children ?? [])].sort((a, b) => (nodeTotal.get(b) ?? 0) - (nodeTotal.get(a) ?? 0))) walk(child, depth + 1);
  };
  const root = profile.nodes.find((n) => !parent.has(n.id));
  if (root) walk(root.id, 0);
  return {
    inclusive: [...inclusive.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([fn, ms]) => ({ fn, ms: Math.round(ms * 10) / 10, pct: pct(ms) })),
    tree
  };
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
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    await cdp.send("Profiler.start");
    await page.goto(`${server.origin}/tests/browser/frame-cost-harness.html?scene=cube&quality=auto`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __FRAME_COST__?: unknown }).__FRAME_COST__), undefined, { timeout: 120_000 });
    const first = (await cdp.send("Profiler.stop")).profile as unknown as CpuProfile;
    // Settle past the sampled getError warm-up (first 30 frames) and lazy first-use work, so the steady profile is steady frames only.
    await page.evaluate(() => { const api = (window as unknown as { __FRAME_COST__: { stepOnce(): void } }).__FRAME_COST__; for (let i = 0; i < 60; i += 1) api.stepOnce(); });
    await cdp.send("Profiler.start");
    await page.evaluate((frames) => (window as unknown as { __FRAME_COST__: { measure(n: number): unknown } }).__FRAME_COST__.measure(frames), PROFILE_FRAMES);
    const steady = (await cdp.send("Profiler.stop")).profile as unknown as CpuProfile;
    const report = { firstFrame: topSelfTimes(first), steadyFrames: topSelfTimes(steady, 40) };
    results["cube/auto/profile"] = report;
    console.log(`FRAME_COST_PROFILE ${JSON.stringify(report)}`);
    const steadyInclusive = inclusiveReport(steady);
    console.log(`FRAME_COST_PROFILE_INCLUSIVE ${JSON.stringify(steadyInclusive.inclusive)}`);
    for (const line of steadyInclusive.tree) console.log(`FRAME_COST_PROFILE_TREE ${line}`);
    await context.close();
  });
});

test.describe("frame cost: JS vs GL-call split (cube, direct path)", () => {
  test.setTimeout(10 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  /**
   * The cube frame's CPU time with and without the cost of its WebGL calls. After 100 settle frames the state-setting, bind,
   * uniform and draw calls are replaced by no-ops (queries and object creation stay real), so what remains is the JS the
   * engine runs to decide what to submit. The difference is what the calls themselves cost on this runner. Reported, not gated.
   */
  test("cube: frame() CPU with real GL calls vs with the submission calls stubbed", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${server.origin}/tests/browser/frame-cost-harness.html?scene=cube&quality=auto`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __FRAME_COST__?: unknown }).__FRAME_COST__), undefined, { timeout: 120_000 });
    const split = await page.evaluate((frames) => {
      const api = (window as unknown as { __FRAME_COST__: { measure(n: number, warmup?: number): { cpuMs: number[] } } }).__FRAME_COST__;
      const med = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
      const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      const real = api.measure(frames, 100).cpuMs;
      const proto = WebGL2RenderingContext.prototype as unknown as Record<string, unknown>;
      const stubbed = /^(draw|uniform|bindBuffer|bindBufferBase|bindTexture|bindSampler|bindVertexArray|bindFramebuffer|enable|disable|depth|colorMask|cullFace|clear|viewport|scissor|useProgram|activeTexture|bufferSubData|blend|stencil|polygonOffset)/;
      const originals = new Map<string, unknown>();
      for (const name of Object.getOwnPropertyNames(proto)) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        if (typeof descriptor?.value === "function" && stubbed.test(name) && !/^(getUniform|clearBuffer)/.test(name)) originals.set(name, descriptor.value);
      }
      const setStubbed = (on: boolean): void => {
        for (const [name, original] of originals) proto[name] = on ? function () { return undefined; } : original;
      };
      // The first pair is the old single comparison (real, then stubbed), which favours the second measurement: the JIT is
      // warmer by then. The remaining rounds alternate real and stubbed on the same page so drift and tier-up cancel; the
      // summary medians use rounds 2.. only.
      setStubbed(true);
      const none = api.measure(frames, 100).cpuMs;
      const rounds: { real: number; stubbed: number }[] = [{ real: med(real), stubbed: med(none) }];
      for (let round = 0; round < 4; round += 1) {
        setStubbed(false);
        const realRound = api.measure(frames, 20).cpuMs;
        setStubbed(true);
        const stubbedRound = api.measure(frames, 20).cpuMs;
        rounds.push({ real: med(realRound), stubbed: med(stubbedRound) });
      }
      setStubbed(false);
      const later = rounds.slice(1);
      return {
        stubbedMethods: originals.size,
        realMedian: med(real), realMean: mean(real), stubbedMedian: med(none), stubbedMean: mean(none),
        rounds,
        interleavedRealMedian: med(later.map((r) => r.real)),
        interleavedStubbedMedian: med(later.map((r) => r.stubbed))
      };
    }, FRAMES * 3);
    results["cube/auto/glSplit"] = split;
    console.log(`FRAME_COST_GL_SPLIT ${JSON.stringify(split)}`);
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

/** Mean absolute channel difference (0..255) between two RGBA frames over all pixels, and over "interior" pixels only. */
function compareFrames(a: Buffer, b: Buffer, width: number, height: number): { mean: number; interior: number; max: number; edgePixels: number; differingPixels: number } {
  const edge = new Uint8Array(width * height);
  const channelGap = (x0: number, y0: number, x1: number, y1: number): number => {
    let gap = 0;
    for (const img of [a, b]) for (let c = 0; c < 3; c += 1) gap = Math.max(gap, Math.abs(img[(y0 * width + x0) * 4 + c]! - img[(y1 * width + x1) * 4 + c]!));
    return gap;
  };
  // An edge pixel: a neighbour (right or below) in either frame differs by more than 24/255 in any channel. The pair and the
  // pixels within 2-3 px of it are excluded from "interior", so the MSAA-versus-single-sample silhouette difference is not counted.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const steep = (x + 1 < width && channelGap(x, y, x + 1, y) > 24) || (y + 1 < height && channelGap(x, y, x, y + 1) > 24);
      if (!steep) continue;
      for (let dy = -2; dy <= 3; dy += 1) {
        for (let dx = -2; dx <= 3; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px >= 0 && py >= 0 && px < width && py < height) edge[py * width + px] = 1;
        }
      }
    }
  }
  let total = 0; let interiorTotal = 0; let interiorCount = 0; let max = 0; let differing = 0; let edgePixels = 0;
  for (let p = 0; p < width * height; p += 1) {
    let sum = 0;
    for (let c = 0; c < 3; c += 1) {
      const d = Math.abs(a[p * 4 + c]! - b[p * 4 + c]!);
      sum += d;
      if (d > max) max = d;
    }
    total += sum / 3;
    if (sum > 0) differing += 1;
    if (edge[p]) edgePixels += 1; else { interiorTotal += sum / 3; interiorCount += 1; }
  }
  const r = (v: number): number => Math.round(v * 1000) / 1000;
  return { mean: r(total / (width * height)), interior: r(interiorTotal / Math.max(1, interiorCount)), max, edgePixels, differingPixels: differing };
}

test.describe("frame pixels: auto vs production, and per-build hashes", () => {
  test.setTimeout(10 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  /**
   * One frame of the same scene at `quality: "auto"` (direct path) and `quality: "production"` (HDR multisampled path), after the
   * same number of frames (same cube yaw). Prints a sha256 of each frame: running this spec on two builds and comparing the
   * hashes shows whether the output changed byte for byte (production is the one that must not change; the auto hash is reported
   * for the same comparison on the direct path). The auto-versus-production mean and interior difference is gated at 2/255 for the cube.
   */
  for (const sceneName of ["cube", "lit"] as const) {
    test(`${sceneName}: auto vs production frames`, async ({ browser }) => {
      const grab = async (quality: "auto" | "production") => {
        const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const problems: string[] = [];
        page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
        await page.goto(`${server.origin}/tests/browser/frame-cost-harness.html?scene=${sceneName}&quality=${quality}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean((window as unknown as { __FRAME_COST__?: unknown }).__FRAME_COST__), undefined, { timeout: 120_000 });
        const shot = await page.evaluate(() => (window as unknown as { __FRAME_COST__: { snapshot(n: number): { width: number; height: number; rgbaBase64: string } } }).__FRAME_COST__.snapshot(20));
        await context.close();
        expect(problems).toEqual([]);
        return { ...shot, rgba: Buffer.from(shot.rgbaBase64, "base64") };
      };
      const auto = await grab("auto");
      const production = await grab("production");
      expect(auto.rgba.length).toBe(auto.width * auto.height * 4);
      expect(production.rgba.length).toBe(auto.rgba.length);
      const sha = (buf: Buffer): string => createHash("sha256").update(buf).digest("hex");
      const diff = compareFrames(auto.rgba, production.rgba, auto.width, auto.height);
      const summary = { scene: sceneName, width: auto.width, height: auto.height, autoSha256: sha(auto.rgba), productionSha256: sha(production.rgba), autoVsProduction: diff };
      results[`${sceneName}/pixels`] = summary;
      console.log(`FRAME_PIXELS ${JSON.stringify(summary)}`);
      // A blank frame would trivially "match": the frame must contain more than one colour.
      const first = auto.rgba.subarray(0, 3).toString("hex");
      let varied = false;
      for (let p = 1; p < auto.width * auto.height && !varied; p += 1) varied = auto.rgba.subarray(p * 4, p * 4 + 3).toString("hex") !== first;
      expect(varied, "auto frame is not a single flat colour").toBe(true);
      if (GATE && sceneName === "cube") {
        expect(diff.mean, "auto vs production mean abs difference (/255)").toBeLessThanOrEqual(2);
        expect(diff.interior, "auto vs production interior abs difference (/255)").toBeLessThanOrEqual(2);
      }
    });
  }
});
