import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * where-the-wind-wanders-port - capture + port parity, browser half.
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives
 * `examples/where-the-wind-wanders-port` through `window.__AURA_WIND__`:
 *   - the lab boots on WebGL2 with no engine error,
 *   - the meadow frame holds real terrain, foliage and sky pixels,
 *   - the recorded key script of the ORIGINAL game (tests/browser/data/where-the-wind-wanders-reference-replay.json,
 *     copied from evidence/crayon-capture/where-the-wind-wanders-reference.json) replays inside the page to
 *     the same trajectory, discovers the three letters and rings the bell,
 *   - the frame changes while walking, and route-health names the claimed parity IDs.
 * Compact JPEG frames are written to the log as `WIND_FRAME <name> <base64>` because ACR runs cannot return files.
 */

const REPORT_ROOT = resolve("tests/reports/where-the-wind-wanders-port");
const LAB = "/examples/where-the-wind-wanders-port/";
const REPLAY_FIXTURE = "tests/browser/data/where-the-wind-wanders-reference-replay.json";
const PARITY_IDS = ["SH-02", "SG-03", "SG-05", "SM-02", "ST-01", "SR-02"];

interface Replay {
  readonly tolerance: number;
  readonly steps: number;
  readonly script: { keys: string; act: "E" | "Space" | null; steps: number }[];
  readonly xs: number[];
  readonly zs: number[];
  readonly lettersAtStep: number[];
}

interface Region { readonly green: number; readonly sky: number; readonly lumaStd: number; readonly colors: number }

interface WindApi {
  ready(): boolean;
  state(): { step: number; pos: { x: number; z: number }; found: number[]; complete: boolean };
  stepFrames(n: number, keys?: string): void;
  runScript(segments: Replay["script"]): { xs: number[]; zs: number[]; found: number[]; complete: boolean };
  reset(): void;
  frame(w?: number, h?: number, q?: number): Promise<string>;
  pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  routeHealth(): { status: string; parityIds: readonly string[] } | null;
  diagnostics: { drawCalls?: number; errors?: readonly unknown[] } | null;
  foliageCards: number;
  nodeCount: number;
  stats: { trees: number; propTriangles: number; foliageTriangles: number; terrainTriangles: number } | null;
  epilogue(seconds: number | null): void;
  teleport(x: number, z: number): void;
}

test.describe("where-the-wind-wanders-port", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("boots on WebGL2, draws the meadow, and replays the original's recorded run", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width: 960, height: 346 });
    await page.goto(`${server.origin}${LAB}?manual=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_WIND__?: { ready(): boolean }; __AURA_WIND_ERROR__?: string };
        return w.__AURA_WIND__?.ready() === true || Boolean(w.__AURA_WIND_ERROR__);
      },
      undefined,
      { timeout: 540_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_WIND_ERROR__?: string }).__AURA_WIND_ERROR__ ?? null);
    if (bootError) console.log("WIND_BOOT_ERROR", bootError, JSON.stringify(errors.slice(0, 8)));
    expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();

    const api = <T>(fn: (w: WindApi) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__AURA_WIND__)`) as Promise<T>;
    const frame = async (name: string): Promise<void> => {
      const data = await api((w) => w.frame(960, 346, 0.84));
      console.log(`WIND_FRAME ${name} ${data.split(",")[1]}`);
    };
    const stats = (): Promise<Region> =>
      page.evaluate(async () => {
        const w = (window as unknown as { __AURA_WIND__: WindApi }).__AURA_WIND__;
        const { width, height, data } = await w.pixels();
        let green = 0, sky = 0, sum = 0, sumSq = 0;
        const seen = new Set<number>();
        const n = width * height;
        for (let i = 0; i < n; i++) {
          const r = data[i * 4]!, g = data[i * 4 + 1]!, b = data[i * 4 + 2]!;
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          sum += luma; sumSq += luma * luma;
          if (g > r + 8 && g > b + 8) green++;
          if (b > r + 6 && b > 140) sky++;
          seen.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
        }
        const mean = sum / n;
        return { green: green / n, sky: sky / n, lumaStd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)), colors: seen.size };
      });

    // ---- start frame ----
    await api((w) => { w.stepFrames(60); return 0; });
    const start = await stats();
    console.log("WIND_STATS start", JSON.stringify(start));
    await frame("start");
    expect(start.green, "terrain and foliage cover the lower frame").toBeGreaterThan(0.12);
    expect(start.colors, "a painted scene, not a flat fill").toBeGreaterThan(14);
    expect(start.lumaStd).toBeGreaterThan(8);
    const counts = await api((w) => ({ cards: w.foliageCards, nodes: w.nodeCount, draws: w.diagnostics?.drawCalls ?? 0, stats: w.stats, diag: w.diagnostics }));
    console.log("WIND_COUNTS", JSON.stringify(counts));
    expect(counts.cards).toBeGreaterThan(1500);

    // ---- walking changes the picture ----
    await api((w) => { w.stepFrames(240, "D"); return 0; });
    const walked = await stats();
    console.log("WIND_STATS walked", JSON.stringify(walked));
    await frame("walked");
    const moved = await api((w) => w.state());
    expect(moved.pos.x).toBeGreaterThan(-12 + 5);

    // ---- replay the original's recorded run inside the page ----
    const fixture = JSON.parse(readFileSync(resolve(REPLAY_FIXTURE), "utf8")) as Replay;
    await api((w) => { w.reset(); return 0; });
    // replay in slices so frames can be captured at fixed steps (the same steps as the original's frames)
    const cuts = [306, 700, 1172, 1500];
    const parts: Replay["script"][] = [[], [], [], [], []];
    {
      let done = 0;
      for (const seg of fixture.script) {
        let left = seg.steps;
        while (left > 0) {
          const bucket = cuts.findIndex((c) => done < c);
          const k = bucket < 0 ? cuts.length : bucket;
          const room = k < cuts.length ? cuts[k]! - done : left;
          const take = Math.min(left, room);
          parts[k]!.push({ ...seg, steps: take, act: take === seg.steps || left === seg.steps ? seg.act : null });
          done += take;
          left -= take;
        }
      }
    }
    const replayed = { xs: [] as number[], zs: [] as number[], found: [] as number[], complete: false };
    for (let k = 0; k < parts.length; k++) {
      const out = (await page.evaluate(`window.__AURA_WIND__.runScript(${JSON.stringify(parts[k])})`)) as { xs: number[]; zs: number[]; found: number[]; complete: boolean };
      replayed.xs.push(...out.xs);
      replayed.zs.push(...out.zs);
      replayed.found = out.found;
      replayed.complete = out.complete;
      if (k < cuts.length) await frame(`replay-${cuts[k]}`);
    }
    expect(replayed.xs.length).toBe(fixture.steps);
    let worst = 0;
    for (let i = 0; i < fixture.steps; i++) worst = Math.max(worst, Math.hypot(replayed.xs[i]! - fixture.xs[i]!, replayed.zs[i]! - fixture.zs[i]!));
    console.log("WIND_REPLAY", JSON.stringify({ steps: fixture.steps, worstDelta: worst, tolerance: fixture.tolerance, found: replayed.found, complete: replayed.complete }));
    expect(worst).toBeLessThanOrEqual(Math.max(fixture.tolerance, 1e-4));
    expect(replayed.found).toEqual([0, 1, 2]);
    expect(replayed.complete).toBe(true);
    const hud = await page.evaluate(() => document.getElementById("quest")?.textContent ?? "");
    expect(hud).toContain("3 / 3 discovered");
    await frame("end");
    const end = await stats();
    for (const t of [3, 30, 75]) {
      await page.evaluate(`window.__AURA_WIND__.epilogue(${t})`);
      await page.waitForTimeout(250);
      await frame(`epilogue-${t}`);
    }
    await page.evaluate(`window.__AURA_WIND__.epilogue(null)`);
    const views: [string, number, number][] = [["oak", -22, 5], ["cottage", -6, -6], ["windmill", 15, -3], ["jetty", 31, -8], ["bell", 46, 7], ["meadow", 0, 12], ["forest", -42, 8], ["shore", 20, -11]];
    for (const [name, vx, vz] of views) {
      await page.evaluate(`window.__AURA_WIND__.teleport(${vx}, ${vz})`);
      await api((w) => { w.stepFrames(30); return 0; });
      await frame(`view-${name}`);
    }
    const perf = await page.evaluate(async () => {
      const w = (window as unknown as { __AURA_WIND__: WindApi }).__AURA_WIND__;
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) w.stepFrames(1);
      await w.pixels();
      return { msPer: (performance.now() - t0) / 21 };
    });
    console.log("WIND_PERF", JSON.stringify(perf));
    console.log("WIND_STATS end", JSON.stringify(end));
    expect(end.green).toBeGreaterThan(0.1);

    // ---- route health + engine errors ----
    const health = await api((w) => w.routeHealth());
    console.log("WIND_ROUTE_HEALTH", JSON.stringify(health));
    expect(health?.status).toBe("ready");
    expect([...(health?.parityIds ?? [])].sort()).toEqual([...PARITY_IDS].sort());
    const diag = await api((w) => w.diagnostics);
    expect(diag?.errors ?? []).toEqual([]);
    expect(errors.filter((e) => !/favicon|net::ERR/.test(e))).toEqual([]);
  });

  test("the real-time page shows the title card, starts on Enter, keeps a journal and stays error-free", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto(`${server.origin}${LAB}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURA_WIND__?: { ready(): boolean } }).__AURA_WIND__?.ready() === true, undefined, { timeout: 540_000 });
    const shot = async (name: string): Promise<void> => {
      const jpg = await page.screenshot({ type: "jpeg", quality: 80 });
      console.log(`WIND_FRAME ${name} ${jpg.toString("base64")}`);
    };
    await page.waitForTimeout(1500);
    await shot("page-title");
    expect(await page.locator("#wwui-title").isVisible(), "the title card shows before the walk starts").toBe(true);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    expect(await page.locator("#wwui-title").isVisible(), "Enter starts the walk").toBe(false);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(2500);
    await page.keyboard.up("KeyD");
    const walked = (await page.evaluate(`window.__AURA_WIND__.state()`)) as { pos: { x: number } };
    expect(walked.pos.x, "the real-time loop moves the traveller").toBeGreaterThan(-12.5);
    await shot("page-walking");
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(400);
    await shot("page-journal");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    expect(await page.locator("#wwui-pause").isVisible(), "Esc pauses").toBe(true);
    await shot("page-paused");
    expect(errors.filter((e) => !/favicon|net::ERR/.test(e))).toEqual([]);
  });
});
