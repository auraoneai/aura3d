import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * heatsink-port - PRD §7.2 Phase B, browser half (docs/workflows/threejs-parity-gaps.md, task R-20).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives `examples/heatsink-port`
 * through `window.__AURA_HEATSINK__`:
 *   - the lab boots on WebGL2 with no engine error and no parity-not-implemented error,
 *   - the countdown and race frames contain real road/sky pixels (not a flat clear colour),
 *   - the original's recorded 6000-step input script, replayed through the live port in Chrome, ends where the
 *     original's reference run ended,
 *   - port frames at the same simulation steps as the original's frames (the blind judge's input) are written to the
 *     log as `@@HEATSINK_FRAME <step> <base64 jpeg>`, read straight from the canvas (the HUD is DOM, so it is not in them), the same way the original's frames are taken.
 */

const REPORT_ROOT = resolve("tests/reports/heatsink-port");
const LAB = "/examples/heatsink-port/";
const REFERENCE = "tests/browser/data/heatsink-reference-replay.json";
/** the same steps tools/crayon-capture/heatsink-frames.ts photographs on the original */
const FRAME_STEPS = (process.env.HEATSINK_FRAME_STEPS ?? "450,750,1140,1170,1200,1230,1500,1920,2250,2550,3000,3270,3660,3750,4500,5340").split(",").map(Number);

interface Region { readonly nonBackground: number; readonly lumaMean: number; readonly lumaStd: number; readonly colors: number }
interface HeatsinkApi {
  ready(): boolean;
  stepFrames(n: number, input?: unknown): unknown;
  replayStart(text: string): number;
  replayTo(target: number, lead?: number, grab?: boolean): { state: string; step: number; raceTime: number; lapIdx: number; player: Record<string, number | boolean> };
  pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  info(): { memory?: { geometries?: number; programs?: number } } | null;
  diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null;
  routeHealth(): { status: string; parityIds: readonly string[] } | null;
  nodeCount(): number;
  hud(): Record<string, unknown> | null;
}

test.describe("heatsink-port (Phase B)", () => {
  test.setTimeout(1_500_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });
  test.afterAll(async () => { await server.close(); });

  test("boots on WebGL2, renders the track, replays the original's run and emits comparison frames", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width: 800, height: 450 });
    await page.goto(`${server.origin}${LAB}?manual=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_HEATSINK__?: { ready(): boolean }; __AURA_HEATSINK_ERROR__?: string };
        return w.__AURA_HEATSINK__?.ready() === true || Boolean(w.__AURA_HEATSINK_ERROR__);
      },
      undefined,
      { timeout: 540_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_HEATSINK_ERROR__?: string }).__AURA_HEATSINK_ERROR__ ?? null);
    if (bootError) console.log("HEATSINK_BOOT_ERROR", bootError, JSON.stringify(errors.slice(0, 8)));
    expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();

    const api = <T>(fn: (o: HeatsinkApi) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__AURA_HEATSINK__)`) as Promise<T>;
    const stats = (): Promise<{ whole: Region; lowerCenter: Region; top: Region }> =>
      page.evaluate(async () => {
        const o = (window as unknown as { __AURA_HEATSINK__: HeatsinkApi }).__AURA_HEATSINK__;
        const { width, height, data } = await o.pixels();
        const bg = [0x02, 0x04, 0x0a];
        const region = (x0: number, y0: number, x1: number, y1: number): Region => {
          let n = 0, nonBg = 0, sum = 0, sumSq = 0;
          const seen = new Set<number>();
          for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++) {
            for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) {
              const i = (y * width + x) * 4;
              const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
              const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              sum += luma; sumSq += luma * luma; n++;
              if (Math.abs(r - bg[0]!) + Math.abs(g - bg[1]!) + Math.abs(b - bg[2]!) > 40) nonBg++;
              seen.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
            }
          }
          const mean = sum / n;
          return { nonBackground: nonBg / n, lumaMean: mean, lumaStd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), colors: seen.size };
        };
        return { whole: region(0, 0, 1, 1), lowerCenter: region(0.3, 0.55, 0.7, 0.95), top: region(0, 0, 1, 0.35) };
      });

    // ---- countdown frame ----
    await api((o) => { o.stepFrames(60); return 0; });
    const countdownStats = await stats();
    console.log("HEATSINK_STATS countdown", JSON.stringify(countdownStats));

    // ---- recorded run: replay the original's input script, photograph fixed steps ----
    const ref = JSON.parse(readFileSync(resolve(REFERENCE), "utf8")) as { script: { text: string; totalSteps: number }; reference: { snapshots: { step: number; player: Record<string, number>; game: { raceTime: number; lapIdx: number } }[] } };
    const total = await page.evaluate(`window.__AURA_HEATSINK__.replayStart(${JSON.stringify(ref.script.text)})`) as number;
    expect(total).toBe(ref.script.totalSteps);
    const frameStats: Record<number, { whole: Region; lowerCenter: Region; top: Region }> = {};
    const states: Record<number, { s: number; v: number; heat: number; burstT: number }> = {};
    for (const step of FRAME_STEPS) {
      const st = await page.evaluate(`window.__AURA_HEATSINK__.replayTo(${step}, 30, true)`) as { player: Record<string, number>; shot: { w: number; h: number; lit: number; url: string } | null };
      expect(st.shot, `canvas capture at step ${step}`).not.toBeNull();
      console.log(`@@HEATSINK_FRAME ${step} ${(st.shot as { url: string }).url.split(",")[1]}`);
      console.log(`HEATSINK_FRAME_INFO ${step} ${(st.shot as { w: number }).w}x${(st.shot as { h: number }).h} lit=${(st.shot as { lit: number }).lit.toFixed(2)}`);
      frameStats[step] = await stats();
      states[step] = { s: st.player.s as number, v: st.player.v as number, heat: st.player.heat as number, burstT: st.player.burstT as number };
    }
    console.log("HEATSINK_FRAME_STATES", JSON.stringify(states));
    console.log("HEATSINK_FRAME_STATS", JSON.stringify(frameStats));

    // ---- finish the replay and compare with the original's last snapshot ----
    const final = await page.evaluate(`window.__AURA_HEATSINK__.replayTo(${total}, 0)`) as { step: number; raceTime: number; lapIdx: number; player: Record<string, number> };
    const last = ref.reference.snapshots[ref.reference.snapshots.length - 1]!;
    console.log("HEATSINK_REPLAY_FINAL", JSON.stringify({ step: final.step, raceTime: final.raceTime, lapIdx: final.lapIdx, s: final.player.s, v: final.player.v, dist: final.player.dist }), JSON.stringify({ step: last.step, raceTime: last.game.raceTime, lapIdx: last.game.lapIdx, s: last.player.s, v: last.player.v, dist: last.player.dist }));

    const diag = await api((o) => {
      const d = o.diagnostics() as { drawCalls?: number; errors?: readonly unknown[] } | null;
      const i = o.info() as { memory?: { geometries?: number; programs?: number } } | null;
      return { drawCalls: d?.drawCalls ?? 0, errorCount: d?.errors?.length ?? null, geometries: i?.memory?.geometries ?? null, programs: i?.memory?.programs ?? null, nodes: o.nodeCount(), routeHealth: o.routeHealth() };
    });
    console.log("HEATSINK_DIAG", JSON.stringify(diag), JSON.stringify(errors.slice(0, 6)).slice(0, 600));

    writeFileSync(resolve(`${REPORT_ROOT}/heatsink-port.json`), `${JSON.stringify({
      schema: "aura3d-heatsink-port/1.0",
      generatedAt: new Date().toISOString(),
      claimBoundary: "Proves the Aura3D port boots on WebGL2, renders its road, sky and drone, and that replaying the original's recorded inputs ends at the original's recorded state. It does not claim pixel parity; the original-vs-port comparison is the blind model judgement in evidence/heatsink-port/README.md.",
      countdownStats, frameStats, states, diag, final, errors
    }, null, 2)}\n`);

    expect(errors.filter((e) => /parity-not-implemented|Failed to resolve|shader|GLSL|compile/i.test(e)), errors.join("\n")).toEqual([]);
    expect(diag.drawCalls).toBeGreaterThan(5);
    expect(diag.errorCount ?? 0).toBe(0);
    expect(diag.routeHealth?.status).toBe("ready");
    expect(diag.routeHealth?.parityIds).toEqual(["SG-03", "SG-05", "SH-02", "R-23", "R-24"]);
    expect(diag.nodes).toBeGreaterThan(20);

    expect(countdownStats.whole.colors, JSON.stringify(countdownStats.whole)).toBeGreaterThan(40);
    expect(countdownStats.whole.lumaStd, JSON.stringify(countdownStats.whole)).toBeGreaterThan(6);
    for (const [step, s] of Object.entries(frameStats)) {
      expect(s.whole.colors, `step ${step} ${JSON.stringify(s.whole)}`).toBeGreaterThan(40);
      expect(s.lowerCenter.nonBackground, `step ${step} ${JSON.stringify(s.lowerCenter)}`).toBeGreaterThan(0.4);
    }

    expect(final.step).toBe(ref.script.totalSteps);
    expect(final.lapIdx).toBe(last.game.lapIdx);
    expect(Math.abs(final.raceTime - last.game.raceTime)).toBeLessThan(1e-6);
    for (const k of ["s", "x", "dist", "v", "ab", "heat", "shield", "theta"]) expect(Math.abs((final.player[k] as number) - (last.player[k] as number)), k).toBeLessThan(1e-6);
  });
});
