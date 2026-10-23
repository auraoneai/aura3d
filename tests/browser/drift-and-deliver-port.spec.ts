import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { SCENARIOS, pageRunnerSource, type ReferenceReport, type ScenarioResult } from "../../tools/crayon-capture/drift-and-deliver-lib";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * drift-and-deliver-port: browser half (docs/workflows/threejs-parity-gaps.md, R-20 / R-25).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives
 * `examples/drift-and-deliver-port` through `window.__AURA_DRIFT_AND_DELIVER__`:
 *   - the lab boots on WebGL2 with no engine error,
 *   - the frames contain real city pixels (sky, ground, buildings) and change as the car drives,
 *   - the original's own capture runner (the same in-page source that recorded the reference from the
 *     real game) is run against the port in this browser: every scenario hash must equal the reference
 *     hash. The reference ran on the same x64 Linux runner family, so the match is exact, not a tolerance,
 *   - a coin picked up in the live page changes the score, count, streak and HUD.
 * Compact JPEG frames are written to the log as `DRIFT_PORT_FRAME <name> <base64>` because ACR runs
 * cannot return files.
 */

const REPORT_ROOT = resolve("tests/reports/drift-and-deliver-port");
const LAB = "/examples/drift-and-deliver-port/";
const reference = JSON.parse(readFileSync("tests/browser/data/drift-and-deliver-reference.json", "utf8")) as ReferenceReport;

interface Region { readonly lumaMean: number; readonly lumaStd: number; readonly colors: number; readonly blueOverRed: number }
interface Stats { readonly width: number; readonly height: number; readonly whole: Region; readonly top: Region; readonly lower: Region }

interface DriftApi {
  ready(): boolean;
  state(): { phase: string; state: number[]; score: number; collected: number; total: number; combo: number; boost: number; speedKmh: number; frames: number };
  stepFrames(n: number, keys?: Record<string, boolean>): { state: number[]; score: number; collected: number; combo: number; speedKmh: number };
  teleport(x: number, z: number, heading?: number): unknown;
  reset(): unknown;
  pickups(): { kind: string; x: number; z: number; taken: boolean }[];
  headlights(amount?: number): number;
  counts(): { blocks: number; buildings: number; trees: number; traffic: number; pickups: number; solids: number };
  nodeCount(): number;
  frame(w?: number, h?: number, q?: number): Promise<string>;
  pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  info(): { memory?: { geometries?: number; programs?: number } } | null;
  diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null;
  routeHealth(): { status: string; parityIds: readonly string[] } | null;
}

test.describe("drift-and-deliver-port", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("boots on WebGL2, renders the city, replays the original's reference exactly and collects pickups", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto(`${server.origin}${LAB}?manual=1&quality=low`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_DRIFT_AND_DELIVER__?: { ready(): boolean }; __AURA_DRIFT_AND_DELIVER_ERROR__?: string };
        return w.__AURA_DRIFT_AND_DELIVER__?.ready() === true || Boolean(w.__AURA_DRIFT_AND_DELIVER_ERROR__);
      },
      undefined,
      { timeout: 540_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_DRIFT_AND_DELIVER_ERROR__?: string }).__AURA_DRIFT_AND_DELIVER_ERROR__ ?? null);
    if (bootError) console.log("DRIFT_PORT_BOOT_ERROR", bootError, JSON.stringify(errors.slice(0, 8)));
    expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();

    const api = <T>(fn: (o: DriftApi) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__AURA_DRIFT_AND_DELIVER__)`) as Promise<T>;
    const frame = async (name: string): Promise<void> => {
      const data = await api((o) => o.frame(480, 270, 0.7));
      console.log(`DRIFT_PORT_FRAME ${name} ${data.split(",")[1]}`);
    };
    const stats = (): Promise<Stats> =>
      page.evaluate(async () => {
        const o = (window as unknown as { __AURA_DRIFT_AND_DELIVER__: DriftApi }).__AURA_DRIFT_AND_DELIVER__;
        const { width, height, data } = await o.pixels();
        const region = (x0: number, y0: number, x1: number, y1: number): Region => {
          let n = 0, sum = 0, sumSq = 0, red = 0, blue = 0;
          const seen = new Set<number>();
          for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++) {
            for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) {
              const i = (y * width + x) * 4;
              const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
              const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              sum += luma; sumSq += luma * luma; n++; red += r; blue += b;
              seen.add((r >> 4) << 8 | (g >> 4) << 4 | (b >> 4));
            }
          }
          const mean = sum / n;
          return { lumaMean: mean, lumaStd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), colors: seen.size, blueOverRed: blue / Math.max(1, red) };
        };
        return { width, height, whole: region(0, 0, 1, 1), top: region(0, 0, 1, 0.25), lower: region(0.25, 0.55, 0.75, 0.95) };
      });

    // ---- the lab itself ----
    const counts = await api((o) => o.counts());
    console.log("DRIFT_PORT_COUNTS", JSON.stringify(counts));
    expect(counts.blocks).toBe(225);
    expect(counts.pickups).toBe(174);
    expect(counts.traffic).toBe(84);
    expect(counts.buildings).toBeGreaterThan(1000);
    expect(counts.solids).toBe(counts.buildings);

    // ---- rendered frames ----
    await api((o) => { o.reset(); o.teleport(30, -300, 0); o.stepFrames(0); return 0; });
    const startStats = await stats();
    console.log("DRIFT_PORT_STATS start", JSON.stringify(startStats));
    await frame("start");
    expect(startStats.whole.lumaStd).toBeGreaterThan(10);
    expect(startStats.whole.colors).toBeGreaterThan(30);
    expect(startStats.top.lumaMean).toBeGreaterThan(60);
    const startState = await api((o) => o.state());

    await api((o) => { o.stepFrames(240, { w: true }); return 0; });
    await frame("driving");
    const drivingStats = await stats();
    console.log("DRIFT_PORT_STATS driving", JSON.stringify(drivingStats));
    const driving = await api((o) => o.state());
    expect(driving.state[1]!).toBeGreaterThan(startState.state[1]! + 50);
    expect(driving.speedKmh).toBeGreaterThan(80);
    expect(drivingStats.whole.lumaStd).toBeGreaterThan(10);
    expect(drivingStats.lower.lumaMean).toBeGreaterThan(20);
    expect(drivingStats.whole.colors).toBeGreaterThan(20);

    await api((o) => { o.stepFrames(120, { w: true, shift: true }); return 0; });
    await frame("boosting");
    const boosting = await api((o) => o.state());
    expect(boosting.boost).toBeLessThan(1);
    expect(boosting.speedKmh).toBeGreaterThan(driving.speedKmh);

    await api((o) => { o.stepFrames(20, { w: true, d: true, space: true }); return 0; });
    await frame("drifting");

    const nodes = await api((o) => o.nodeCount());
    // the car is now five runtime nodes (paint, detail, two lamps, beams): the wheels are part of the shell mesh
    expect(nodes).toBeGreaterThanOrEqual(5);

    // ---- headlight beams (the original's only ShaderMaterial, hand-ported to material.custom) ----
    await api((o) => { o.teleport(30, -200, 0); o.headlights(0); o.stepFrames(90); return 0; });
    const beamDiff = await page.evaluate(async () => {
      const o = (window as unknown as { __AURA_DRIFT_AND_DELIVER__: DriftApi }).__AURA_DRIFT_AND_DELIVER__;
      o.headlights(0); o.stepFrames(0);
      const off = await o.pixels();
      o.headlights(1); o.stepFrames(0);
      const on = await o.pixels();
      let changed = 0, brighter = 0, maxDelta = 0;
      for (let i = 0; i < off.data.length; i += 4) {
        const l0 = 0.2126 * off.data[i]! + 0.7152 * off.data[i + 1]! + 0.0722 * off.data[i + 2]!;
        const l1 = 0.2126 * on.data[i]! + 0.7152 * on.data[i + 1]! + 0.0722 * on.data[i + 2]!;
        const d = l1 - l0;
        if (Math.abs(d) > 3) changed++;
        if (d > 3) brighter++;
        maxDelta = Math.max(maxDelta, d);
      }
      return { pixels: off.data.length / 4, changed, brighter, maxDelta, level: o.headlights() };
    });
    await frame("beams");
    console.log("DRIFT_PORT_BEAMS", JSON.stringify(beamDiff));
    // The beam draws: lighting the lamp must brighten a meaningful number of pixels (fixed in 4.0.8: custom vertex stages
    // previously rendered in NDC because the app path gave material.custom identity view/projection matrices).
    expect(beamDiff.level).toBe(1);
    expect(beamDiff.brighter).toBeGreaterThan(500);
    expect(beamDiff.maxDelta).toBeGreaterThan(20);
    await api((o) => o.headlights(0));

    // ---- the original's capture runner, run against the port, must reproduce the reference hashes ----
    await api((o) => { o.reset(); return 0; });
    const out = JSON.parse((await page.evaluate(pageRunnerSource(SCENARIOS, 10))) as string) as { scenarios: ScenarioResult[] };
    const rows = reference.reference.scenarios.map((ref) => {
      const got = out.scenarios.find((s) => s.id === ref.id)!;
      let worst = 0;
      ref.samples.forEach((sample, i) => {
        const mine = got.samples[i]!;
        sample.state.forEach((v, f) => { worst = Math.max(worst, Math.abs(v - (mine.state[f] as number))); });
      });
      return { id: ref.id, steps: got.steps, refHash: ref.hash, portHash: got.hash, hashEqual: got.hash === ref.hash, maxAbsDelta: worst, contacts: got.contacts };
    });
    console.log("DRIFT_PORT_REPLAY", JSON.stringify(rows));
    for (const r of rows) {
      expect(r.steps, r.id).toBe(reference.reference.scenarios.find((s) => s.id === r.id)!.steps);
      expect(r.maxAbsDelta, `${r.id} samples`).toBeLessThanOrEqual(reference.tolerance.perField);
      expect(r.contacts, `${r.id} building contacts`).toBe(0);
      expect(r.hashEqual, `${r.id} hash ${r.portHash} vs original ${r.refHash}`).toBe(true);
    }

    // ---- gameplay: a coin on the car's path ----
    const coin = (await api((o) => o.pickups())).find((p) => p.kind === "coin")!;
    await api((o) => { o.reset(); return 0; });
    await page.evaluate(`window.__AURA_DRIFT_AND_DELIVER__.teleport(${coin.x}, ${coin.z}, 0)`);
    const before = await api((o) => o.state());
    const after = await api((o) => o.stepFrames(2));
    console.log("DRIFT_PORT_PICKUP", JSON.stringify({ coin, before: { score: before.score, collected: before.collected }, after: { score: after.score, collected: after.collected, combo: after.combo } }));
    expect(after.collected).toBeGreaterThanOrEqual(before.collected + 1);
    expect(after.score).toBeGreaterThanOrEqual(before.score + 10);
    expect(after.combo).toBeGreaterThanOrEqual(1);
    await frame("pickup");
    const hud = await page.evaluate(() => ({ score: document.getElementById("score")!.textContent, count: document.getElementById("count")!.textContent, speed: document.getElementById("speed")!.textContent, nitro: document.getElementById("nitro-fill")!.style.width }));
    console.log("DRIFT_PORT_HUD", JSON.stringify(hud));
    expect(Number(hud.score)).toBeGreaterThanOrEqual(10);
    expect(hud.count).toMatch(/^\d+ \/ 174$/);
    expect(hud.nitro).toMatch(/%$/);

    // ---- health ----
    const diag = await api((o) => ({ diagnostics: o.diagnostics(), info: o.info(), health: o.routeHealth() }));
    console.log("DRIFT_PORT_DIAG", JSON.stringify({ drawCalls: diag.diagnostics?.drawCalls, errors: diag.diagnostics?.errors?.length ?? 0, health: diag.health?.status, parityIds: diag.health?.parityIds }));
    expect(diag.diagnostics?.errors?.length ?? 0).toBe(0);
    expect(diag.health?.status).toBe("ready");
    expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);

    writeFileSync(resolve(`${REPORT_ROOT}/drift-and-deliver-port.json`), `${JSON.stringify({ counts, replay: rows, hud, startStats, drivingStats }, null, 1)}\n`);
  });

  test("headlight beams render when the lamp starts lit and follow runtime uniform writes", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto(`${server.origin}${LAB}?manual=1&quality=low&beams=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_DRIFT_AND_DELIVER__?: { ready(): boolean }; __AURA_DRIFT_AND_DELIVER_ERROR__?: string };
        return w.__AURA_DRIFT_AND_DELIVER__?.ready() === true || Boolean(w.__AURA_DRIFT_AND_DELIVER_ERROR__);
      },
      undefined,
      { timeout: 540_000 }
    );
    const probe = await page.evaluate(async () => {
      const o = (window as unknown as { __AURA_DRIFT_AND_DELIVER__: DriftApi }).__AURA_DRIFT_AND_DELIVER__;
      const luma = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      const mean = (p: { data: Uint8ClampedArray }) => { let s = 0; for (let i = 0; i < p.data.length; i += 4) s += luma(p.data, i); return s / (p.data.length / 4); };
      const diff = (a: { data: Uint8ClampedArray }, b: { data: Uint8ClampedArray }) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (Math.abs(luma(a.data, i) - luma(b.data, i)) > 3) n++; return n; };
      o.teleport(30, -200, 0);
      o.stepFrames(90);
      // the first frames after boot can precede the post-mount texture upgrade; let it settle before the reference frame
      for (let i = 0; i < 6; i++) {
        o.stepFrames(0);
        await new Promise((r) => setTimeout(r, 1500));
      }
      const lit = await o.pixels();
      const litJpeg = await o.frame(480, 270, 0.7);
      const level = o.headlights();
      o.headlights(0);
      o.stepFrames(0);
      const dark = await o.pixels();
      const darkJpeg = await o.frame(480, 270, 0.7);
      o.headlights(1);
      o.stepFrames(0);
      const relit = await o.pixels();
      return { level, litMean: mean(lit), darkMean: mean(dark), relitMean: mean(relit), litVsDark: diff(lit, dark), relitVsDark: diff(relit, dark), litVsRelit: diff(lit, relit), litJpeg, darkJpeg, drawCalls: o.diagnostics()?.drawCalls ?? null };
    });
    console.log(`DRIFT_PORT_FRAME beams-initial ${probe.litJpeg.split(",")[1]}`);
    console.log(`DRIFT_PORT_FRAME beams-dark ${probe.darkJpeg.split(",")[1]}`);
    const { litJpeg: _a, darkJpeg: _b, ...numbers } = probe;
    console.log("DRIFT_PORT_BEAM_PROBE", JSON.stringify(numbers));
    expect(probe.level).toBe(1);
    // lamp on vs lamp off differs, and relighting reproduces the lit frame (same pixels, within noise). The frames are re-rendered
    // without stepping the simulation (stepFrames(0)): with a textured city a one-step camera drift alone moves most edge pixels.
    expect(probe.litVsDark).toBeGreaterThan(500);
    expect(probe.relitVsDark).toBeGreaterThan(500);
    expect(probe.litVsRelit).toBeLessThan(probe.litVsDark / 4);
    expect(errors).toEqual([]);
  });
});
