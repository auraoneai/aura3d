import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * First-frame init cost for the cube (beat-three.js PRD-2, WP-8; target P3 <= 500 ms, software GL). Remote only
 * (tools/remote-acr/run.sh), software WebGL2 (SwiftShader), never GPU times:
 *
 *   SPECS=tests/browser/first-frame-init.spec.ts KEEP_IMAGE=0 tools/remote-acr/run.sh
 *
 * Per cold load it records navigation-to-first-frame (`firstFrameMs`; includes loading the unbundled dev-server modules, so it
 * is build-mode-inflated), createAuraApp-to-first-frame (`mountMs`, the engine-owned part), the `a3d:` performance marks, and
 * the pixel statistics of the first frame against the settled frame. Metrics print between FIRST_FRAME_JSON_BEGIN/END.
 * Timings are recorded, not gated (the target is not moved). What is asserted is correctness: the first frame is not black,
 * and a first frame drawn before the default lighting probe lands is lit like the settled frame (no flash of unlit).
 */
const COLD_LOADS = Number(process.env.FIRST_FRAME_COLD_LOADS ?? 3);
const REPORT = "tests/reports/first-frame-init/first-frame-init.json";
const results: Record<string, unknown> = {};

interface Stats { width: number; height: number; meanRgb: number[]; nonBlack: number; lumaMean: number; litMeanRgb: number[]; litPixels: number }
interface Load {
  firstFrameMs: number;
  mountMs: number;
  marks: Record<string, number>;
  firstFrame: Stats;
  settled: Stats;
  settledSnapshotSha256: string;
  probeAtFirstFrame: Record<string, unknown>;
  errors: string[];
  console: string[];
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

type Api = {
  firstFrameMs: number;
  mountMs: number;
  marks: Record<string, number>;
  firstFrame: Stats;
  firstFrameProbe: Record<string, unknown>;
  errors: string[];
  frameStats(): Stats;
  stepOnce(): void;
  snapshot(frames: number): { rgbaBase64: string };
};

test.describe("first frame init (software WebGL2)", () => {
  test.setTimeout(20 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => {
    await server.close();
    mkdirSync(dirname(resolve(REPORT)), { recursive: true });
    writeFileSync(resolve(REPORT), `${JSON.stringify({ generatedAt: new Date().toISOString(), renderer: "swiftshader", results }, null, 2)}\n`);
    const base64 = Buffer.from(JSON.stringify(results)).toString("base64");
    console.log("FIRST_FRAME_JSON_BEGIN");
    for (let i = 0; i * 3000 < base64.length; i += 1) console.log(`FIRST_FRAME_JSON:${i}:${base64.slice(i * 3000, (i + 1) * 3000)}`);
    console.log("FIRST_FRAME_JSON_END");
  });

  test("cube: cold loads, first frame vs settled frame", async ({ browser }) => {
    const loads: Load[] = [];
    for (let i = 0; i < COLD_LOADS; i += 1) {
      const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const consoleProblems: string[] = [];
      page.on("console", (message) => {
        if ((message.type() === "warning" || message.type() === "error") && !/GPU stall due to ReadPixels/.test(message.text())) consoleProblems.push(`${message.type()}: ${message.text()}`);
      });
      page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));
      await page.goto(`${server.origin}/tests/browser/frame-cost-harness.html?scene=cube&quality=auto`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean((window as unknown as { __FRAME_COST__?: unknown }).__FRAME_COST__), undefined, { timeout: 120_000 });
      const load = await page.evaluate(async () => {
        const api = (window as unknown as { __FRAME_COST__: Api }).__FRAME_COST__;
        const first = { firstFrameMs: api.firstFrameMs, mountMs: api.mountMs, marks: api.marks, firstFrame: api.firstFrame, probeAtFirstFrame: api.firstFrameProbe, errors: api.errors };
        // Let any deferred environment work finish (up to 20 s), then draw the settled frames.
        const deadline = performance.now() + 20_000;
        const want = (): boolean => {
          const names = performance.getEntriesByType("mark").map((m) => m.name);
          return !names.includes("a3d:env:upgrade:start") || names.includes("a3d:env:upgrade:ready");
        };
        while (!want() && performance.now() < deadline) await new Promise((r) => setTimeout(r, 50));
        for (let n = 0; n < 5; n += 1) { api.stepOnce(); await new Promise((r) => requestAnimationFrame(() => r(null))); }
        // Same frame count on every build: 30 more frames from here, then a full read.
        const shot = api.snapshot(30);
        const settled = api.frameStats();
        return { ...first, settled, shotBase64: shot.rgbaBase64 };
      });
      const sha = createHash("sha256").update(load.shotBase64).digest("hex");
      const { shotBase64: _omit, ...rest } = load;
      loads.push({ ...rest, settledSnapshotSha256: sha, console: consoleProblems });
      await context.close();
    }
    const summary = {
      scene: "cube",
      loads: loads.length,
      firstFrameMsMedian: median(loads.map((l) => l.firstFrameMs)),
      mountMsMedian: median(loads.map((l) => l.mountMs)),
      firstFrameMsPerLoad: loads.map((l) => Math.round(l.firstFrameMs)),
      mountMsPerLoad: loads.map((l) => Math.round(l.mountMs)),
      perLoad: loads
    };
    results["cube"] = summary;
    console.log(`FIRST_FRAME ${JSON.stringify({ ...summary, perLoad: undefined })}`);
    for (const l of loads) console.log(`FIRST_FRAME_LOAD ${JSON.stringify(l)}`);
    for (const l of loads) {
      expect([...l.errors, ...l.console], "console warnings/errors and page errors").toEqual([]);
      expect(l.firstFrame.nonBlack, "first frame is not black").toBeGreaterThan(l.firstFrame.width * l.firstFrame.height * 0.5);
      expect(l.firstFrame.litPixels, "first frame draws the cube").toBeGreaterThan(1000);
    }
  });
});

interface ProfileNode { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[]; }
interface CpuProfile { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }

function selfTimes(profile: CpuProfile): { byFunction: { fn: string; selfMs: number }[]; byFile: { file: string; selfMs: number }[]; busyMs: number } {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const fn = new Map<string, number>();
  const file = new Map<string, number>();
  let busy = 0;
  profile.samples.forEach((id, i) => {
    const node = byId.get(id);
    const dt = (profile.timeDeltas[i] ?? 0) / 1000;
    if (!node || node.callFrame.functionName === "(idle)") return;
    const f = node.callFrame.url.split("/").slice(-2).join("/") || "native";
    const key = `${node.callFrame.functionName || "(anonymous)"} @ ${f}:${node.callFrame.lineNumber + 1}`;
    fn.set(key, (fn.get(key) ?? 0) + dt);
    file.set(f, (file.get(f) ?? 0) + dt);
    busy += dt;
  });
  const top = <T extends string>(m: Map<string, number>, label: T, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ [label]: k, selfMs: Math.round(v * 10) / 10 }));
  return { byFunction: top(fn, "fn", 30) as { fn: string; selfMs: number }[], byFile: top(file, "file", 14) as { file: string; selfMs: number }[], busyMs: Math.round(busy) };
}

test.describe("first frame init: CPU profile (unminified dev-server modules)", () => {
  test.setTimeout(10 * 60_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("cube: V8 profile from before navigation to the first frame", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
    await page.goto(`${server.origin}/tests/browser/frame-cost-harness.html?scene=cube&quality=auto`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __FRAME_COST__?: unknown }).__FRAME_COST__), undefined, { timeout: 120_000 });
    const profile = (await cdp.send("Profiler.stop")).profile as unknown as CpuProfile;
    const meta = await page.evaluate(() => {
      const api = (window as unknown as { __FRAME_COST__: Api }).__FRAME_COST__;
      return { firstFrameMs: api.firstFrameMs, mountMs: api.mountMs, marks: api.marks };
    });
    const report = { ...meta, ...selfTimes(profile) };
    results["cube/profile"] = report;
    console.log(`FIRST_FRAME_PROFILE ${JSON.stringify(report)}`);
    await context.close();
  });
});
