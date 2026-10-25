import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * saiyan-snake-way-port art capture (remote only: tools/remote-acr/run.sh, never local Playwright).
 *
 * Drives the port through `window.__AURA_SERPENTINE_SKY_RUN__` at the same game states the original's recorded
 * run reaches (replay prefixes of tests/browser/data/saiyan-snake-way-reference-replay.json) plus presentation
 * states a replay never visits (jump, slide, flight, fall, leap), and prints each frame as chunked
 * `@@SSW_ART <tag> <name> <i> <n> <base64>` log lines with a `@@SSW_METRIC` line of structural metrics.
 * Each lab in `LABS` (before / after) is captured in turn.
 */

/** The "after" lab is the port; a copy of the pre-pass port at examples/ssw-before-tmp (when present) gives the "before" set on the same engine. */
const LABS: readonly (readonly [string, string])[] = [
  ...(existsSync(resolve("examples/ssw-before-tmp/index.html")) ? ([["before", "/examples/ssw-before-tmp/"]] as const) : []),
  ["after", "/examples/saiyan-snake-way-port/"]
];
const FIXTURE = "tests/browser/data/saiyan-snake-way-reference-replay.json";
const W = 960;
const H = 540;

interface Segment { kind: "idle" | "tap" | "hold"; frames: number; key?: string; keys?: string[] }
interface Checkpoint { frame: number; auraRung: number }
interface Fixture { totalSteps: number; segments: Segment[]; checkpoints: Checkpoint[] }
interface Api {
  ready: boolean;
  start(): unknown;
  stepFrames(n: number, input?: { taps?: string[]; held?: string[] }): unknown;
  runSegments(segments: Segment[], maxSteps?: number): { steps: number };
  setState?(patch: Record<string, unknown>): unknown;
  outro?(seconds: number): unknown;
  frame(w?: number, h?: number, q?: number): Promise<string>;
  pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  diagnostics(): { drawCalls?: number; triangles?: number; errors?: readonly unknown[] } | null;
  meta(): { nodeCount: number; entityNodes: number };
}

test.describe("saiyan-snake-way art capture", () => {
  test.setTimeout(1_500_000);
  let server: ExampleDevServer;
  const fixture = JSON.parse(readFileSync(resolve(FIXTURE), "utf8")) as Fixture;

  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const [TAG, LAB] of LABS) test(`captures the ${TAG} frames`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width: W, height: H });

    const boot = async (query: string): Promise<void> => {
      await page.goto(`${server.origin}${LAB}?${query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const w = window as unknown as { __AURA_SERPENTINE_SKY_RUN__?: { ready: boolean }; __AURA_SERPENTINE_SKY_RUN_ERROR__?: string };
        return w.__AURA_SERPENTINE_SKY_RUN__?.ready === true || Boolean(w.__AURA_SERPENTINE_SKY_RUN_ERROR__);
      }, undefined, { timeout: 900_000 });
      const bootError = await page.evaluate(() => (window as unknown as { __AURA_SERPENTINE_SKY_RUN_ERROR__?: string }).__AURA_SERPENTINE_SKY_RUN_ERROR__ ?? null);
      expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();
    };
    const api = <T>(fn: (o: Api) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__AURA_SERPENTINE_SKY_RUN__)`) as Promise<T>;
    const emit = (name: string, base64: string): void => {
      const size = 4000;
      const n = Math.ceil(base64.length / size);
      for (let i = 0; i < n; i++) console.log(`@@SSW_ART ${TAG} ${name} ${i} ${n} ${base64.slice(i * size, (i + 1) * size)}`);
    };
    const world = async (name: string): Promise<void> => {
      const data = await api((o) => o.frame(960, 540, 0.8));
      emit(name, data.split(",")[1] as string);
      const metric = await page.evaluate(async () => {
        const o = (window as unknown as { __AURA_SERPENTINE_SKY_RUN__: Api }).__AURA_SERPENTINE_SKY_RUN__;
        const { width, height, data } = await o.pixels();
        const luma = (i: number): number => 0.2126 * (data[i] as number) + 0.7152 * (data[i + 1] as number) + 0.0722 * (data[i + 2] as number);
        let sum = 0, sumSq = 0, edges = 0;
        const bins = new Set<number>();
        const hist = new Array<number>(16).fill(0);
        const thirds = [0, 0, 0].map(() => [0, 0, 0, 0]);
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const i = (y * width + x) * 4;
            const l = luma(i);
            sum += l; sumSq += l * l;
            hist[Math.min(15, Math.floor(l / 16))]!++;
            bins.add(((data[i] as number) >> 4) << 8 | ((data[i + 1] as number) >> 4) << 4 | ((data[i + 2] as number) >> 4));
            const gx = luma(i + 4) - luma(i - 4);
            const gy = luma(i + width * 4) - luma(i - width * 4);
            if (Math.abs(gx) + Math.abs(gy) > 48) edges++;
            const band = Math.min(2, Math.floor((y / height) * 3));
            const t = thirds[band] as number[];
            t[0]! += data[i] as number; t[1]! += data[i + 1] as number; t[2]! += data[i + 2] as number; t[3]!++;
          }
        }
        const n = (width - 2) * (height - 2);
        const mean = sum / n;
        return {
          lumaMean: +mean.toFixed(2), lumaStd: +Math.sqrt(Math.max(0, sumSq / n - mean * mean)).toFixed(2), colors: bins.size, edgeDensity: +(edges / n).toFixed(4),
          hist: hist.map((v) => +(v / n).toFixed(4)), thirds: thirds.map((t) => [Math.round(t[0]! / t[3]!), Math.round(t[1]! / t[3]!), Math.round(t[2]! / t[3]!)])
        };
      });
      console.log(`@@SSW_METRIC ${TAG} ${name} ${JSON.stringify(metric)}`);
    };
    const ui = async (name: string): Promise<void> => {
      const buf = await page.screenshot({ type: "jpeg", quality: 78 });
      emit(name, buf.toString("base64"));
    };
    const replay = (frames: number): Promise<{ steps: number }> => api(`(o) => o.runSegments(${JSON.stringify(fixture.segments)}, ${frames})` as unknown as (o: Api) => { steps: number });

    // ---- world frames: manual stepping from the recorded run ----
    await boot("manual=1&autostart=1");
    const hasPatch = await api((o) => typeof o.setState === "function");
    await api((o) => { o.start(); o.stepFrames(30); return 0; });
    await world("w-start");
    const surgeFrame = fixture.checkpoints.reduce((best, c) => (c.auraRung > best.auraRung ? c : best), fixture.checkpoints[0] as Checkpoint).frame;
    await replay(600); await world("w-run");
    await replay(1800); await world("w-traffic");
    await replay(surgeFrame); await world("w-surge");
    await replay(3300); await world("w-coils");
    await replay(4800); await world("w-late");
    await replay(fixture.totalSteps); await world("w-end");

    // ---- presentation states a replay never visits ----
    if (hasPatch) {
      await replay(900);
      await api((o) => { o.setState!({ grounded: false, vy: 9, y: 3.2 }); return 0; }); await world("w-jump");
      await api((o) => { o.setState!({ grounded: true, vy: 0, y: 0, sliding: 0.5 }); return 0; }); await world("w-slide");
      await api((o) => { o.setState!({ sliding: 0, puff: 6, y: 9, grounded: false, speed: 70 }); return 0; }); await world("w-flight");
      await replay(2600);
      await api((o) => { o.setState!({ auraRung: 4, auraVis: 1, surge: "on", speed: 90 }); return 0; }); await world("w-surge-fast");
      await api((o) => { o.setState!({ phase: "fall", fallWhy: "OFF THE ROAD" }); o.outro!(1.1); return 0; }); await world("w-fall");
      await replay(fixture.totalSteps);
      await api((o) => { o.setState!({ phase: "leap", atEnd: false }); o.outro!(1.0); return 0; }); await world("w-leap");
    }
    const draw = await api((o) => ({ d: o.diagnostics(), m: o.meta() }));
    console.log(`@@SSW_PERF ${TAG} ${JSON.stringify({ drawCalls: draw.d?.drawCalls ?? null, triangles: draw.d?.triangles ?? null, nodes: draw.m.nodeCount, errors: draw.d?.errors?.length ?? null })}`);

    // ---- UI screens (page screenshots include the DOM overlays) ----
    await boot("manual=1");
    await ui("ui-title");
    await boot("manual=1&autostart=1");
    await api((o) => { o.start(); o.stepFrames(40); return 0; });
    await ui("ui-hud");
    await replay(surgeFrame);
    await ui("ui-hud-surge");
    if (hasPatch) {
      await api((o) => { o.setState!({ phase: "over", ended: "TOO LATE", score: 48210 }); o.outro!(3); return 0; });
      await page.waitForTimeout(600);
      await ui("ui-results");
    }
    expect(errors.filter((e) => /GLSL|shader|CUSTOM_TEXTURE|parity-not-implemented|redefinition/i.test(e))).toEqual([]);
  });
});
