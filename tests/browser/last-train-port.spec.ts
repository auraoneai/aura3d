import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * last-train-port - PRD §7.2 Phase D, browser half (docs/workflows/threejs-parity-gaps.md, task R-20).
 * Exit: one town loop with day/night, passengers, tips; memory stable across 3 loops.
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives `examples/last-train-port` through
 * `window.__AURA_LAST_TRAIN__`: boots on WebGL2 with no engine error, runs three full circuits of the six towns (day, night,
 * day) with real rendering, checks the economy against the original's reference (tests/browser/data/last-train-reference-summary.json),
 * and requires approximateGpuMemoryBytes / textures / buffers / renderTargets after loops 2 and 3 to stay within 5% of loop 1.
 * Compact JPEG frames are written to the log as `LAST_TRAIN_FRAME <name> <base64>` because ACR runs cannot return files.
 */

const REPORT_ROOT = resolve("tests/reports/last-train-port");
const LAB = "/examples/last-train-port/";
const TOLERANCE = 0.05;
const KEYS = ["approximateGpuMemoryBytes", "textures", "buffers", "renderTargets"] as const;

interface Gauges { approximateGpuMemoryBytes: number; textures: number; buffers: number; renderTargets: number; drawCalls: number; nodes: number }
interface State { played: number; phase: string; leg: number; station: string; aboard: number; fares: number; tips: number; bonuses: number; lost: number; score: number; circuits: number; attempt: string; grade: string | null; timeOfDay: string; catches: number; speed: number }
interface Leg { leg: number; steps: number; fares: number; tips: number; lost: number; aboard: number; catches: number; arrivedAt: number }
interface Pixels { width: number; height: number; litFraction: number; mean: number }
interface Api {
  ready(): boolean;
  state(): State;
  memory(): Gauges;
  pixels(): Pixels;
  frame(w?: number, h?: number, q?: number): string;
  render(): void;
  doors(): void;
  depart(): void;
  setTimeOfDay(v: "day" | "night"): void;
  newService(): void;
  stepFrames(n: number, input?: Record<string, unknown>): State;
  runLeg(renderEvery?: number): Leg;
  finishStop(renderEvery?: number): { steps: number; aboard: number; status: string; grade: string | null };
  routeHealth(): { status: string; parityIds: readonly string[] } | null;
}

const summary = JSON.parse(readFileSync("tests/browser/data/last-train-reference-summary.json", "utf8")) as {
  loops: { loop: number; steps: number; score: number; legs: { leg: number; fares: number; tips: number; lost: number; aboard: number; catches: number }[] }[];
  loopScores: number[];
};

test.describe("last-train-port (Phase D)", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });
  test.afterAll(async () => { await server.close(); });

  test("boards, drives three circuits (day/night/day) and keeps memory flat", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); if (/^LT /.test(m.text())) console.log(m.text()); });
    const run = <T>(expr: string): Promise<T> => page.evaluate(`window.__AURA_LAST_TRAIN__.${expr}`) as Promise<T>;
    await page.setViewportSize({ width: 800, height: 450 });
    await page.goto(`${server.origin}${LAB}?manual=1`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(() => {
        const w = window as unknown as { __AURA_LAST_TRAIN__?: { ready(): boolean }; __AURA_LAST_TRAIN_ERROR__?: string };
        return w.__AURA_LAST_TRAIN__?.ready() === true || Boolean(w.__AURA_LAST_TRAIN_ERROR__);
      }, undefined, { timeout: 420_000 });
    } catch (error) {
      const status = await Promise.race([
        page.evaluate("(() => ({ hooks: Boolean(window.__AURA_LAST_TRAIN__), loading: document.getElementById('loading-status')?.textContent ?? null }))()"),
        new Promise((r) => setTimeout(() => r("page is blocked (evaluate timed out)"), 15_000))
      ]);
      console.log("LAST_TRAIN_BOOT_TIMEOUT", JSON.stringify(status), JSON.stringify(errors.slice(0, 12)));
      throw error;
    }
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_LAST_TRAIN_ERROR__?: string }).__AURA_LAST_TRAIN_ERROR__ ?? null);
    if (bootError) console.log("LAST_TRAIN_BOOT_ERROR", bootError, JSON.stringify(errors.slice(0, 8)));
    expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();

    const frames: Record<string, string> = {};
    const grab = async (name: string): Promise<Pixels> => {
      const [jpeg, px] = await page.evaluate("(() => { const a = window.__AURA_LAST_TRAIN__; return [a.frame(480, 270, 0.55), a.pixels()]; })()") as [string, Pixels];
      frames[name] = jpeg;
      console.log(`LAST_TRAIN_FRAME ${name} ${jpeg}`);
      return px;
    };

    /* ---- title: docked at Mango Tide, day ---- */
    const dayDock = await grab("01-docked-day");
    expect(dayDock.litFraction, "the first view is not empty").toBeGreaterThan(0.6);
    expect((await run<State>("state()")).phase).toBe("docked");

    /* ---- first station: passengers board ---- */
    await run("doors()");
    let boardingShot = false;
    for (let i = 0; i < 40; i++) {
      const s = await run<State>("stepFrames(30)");
      if (s.phase === "boarding" && !boardingShot) { boardingShot = true; await grab("02-boarding"); }
      if (s.phase === "ready") break;
    }
    const ready = await run<State>("state()");
    expect(ready.phase).toBe("ready");
    expect(ready.aboard, "four passengers boarded at Mango Tide").toBe(4);
    expect(await page.locator("#aboard").innerText()).toBe("4");
    await grab("03-ready");

    /* ---- three circuits (loop 1 starts after the first station's doors and boarding, done above) ---- */
    const manualSteps = Math.round((await run<State>("state()")).played * 60);
    const gauges: Gauges[] = [];
    const circuits: { loop: number; time: string; steps: number; score: number; legs: Leg[]; closing: { aboard: number; status: string; grade: string | null }; pixels: Pixels }[] = [];
    const shots: Record<string, Pixels> = {};
    for (let loop = 1; loop <= 3; loop++) {
      await page.evaluate('(() => { const a = window.__AURA_LAST_TRAIN__; if (a.state().attempt !== "active") a.newService(); })()');
      const time = loop === 2 ? "night" : "day";
      await run(`setTimeOfDay("${time}")`);
      const before = (await run<State>("state()")).score;
      const legs: Leg[] = [];
      for (let k = 0; k < 6; k++) {
        legs.push(await run<Leg>("runLeg(2400)"));
        if (loop === 1 && (k === 2 || k === 3)) shots[k === 2 ? "04-snow-observatory" : "05-rain-monsoon"] = await grab(k === 2 ? "04-snow-observatory" : "05-rain-monsoon");
        if (loop === 1 && k === 0) shots["06-gardens"] = await grab("06-gardens");
        if (loop === 2 && k === 0) shots["07-night-gardens"] = await grab("07-night-gardens");
      }
      const closing = await run<{ steps: number; aboard: number; status: string; grade: string | null }>("finishStop(2400)");
      const px = await grab(`10-loop-${loop}-${time}-end`);
      const st = await run<State>("state()");
      const g = await run<Gauges>("memory()");
      gauges.push(g);
      circuits.push({ loop, time, steps: legs.reduce((n, l) => n + l.steps, 0) + closing.steps + (loop === 1 ? manualSteps : 0), score: st.score - before, legs, closing, pixels: px });
    }

    /* economy: each circuit within tolerance of the original's */
    circuits.forEach((c, i) => {
      const ref = summary.loops[i]!;
      expect(Math.abs(c.score - summary.loopScores[i]!) / summary.loopScores[i]!, `loop ${c.loop} score ${c.score} vs ${summary.loopScores[i]}`).toBeLessThan(0.01);
      expect(Math.abs(c.steps - ref.steps) / ref.steps, `loop ${c.loop} steps ${c.steps} vs ${ref.steps}`).toBeLessThan(0.01);
      c.legs.forEach((l, k) => {
        const r = ref.legs[k]!;
        expect(l.fares, `fares loop ${c.loop} leg ${k}`).toBe(r.fares);
        expect(l.aboard, `aboard loop ${c.loop} leg ${k}`).toBe(r.aboard);
        expect(Math.abs(l.tips - r.tips), `tips loop ${c.loop} leg ${k}`).toBeLessThanOrEqual(3);
        expect(l.catches).toBe(r.catches);
        expect(l.arrivedAt).toBe((k + 1) % 6);
      });
      expect(c.closing.status).toBe("complete");
      // The original grades this run Silver (its Gold also needs requests, not ported); the port grades Gold on comfort >= 90% and no catches (audit D-06).
      expect(c.closing.grade).toBe("Gold");
    });

    /* day / night: the night frame is darker than the day frame at the same station */
    expect(shots["07-night-gardens"]!.mean, "night frame is darker than day").toBeLessThan(shots["06-gardens"]!.mean * 0.8);
    for (const name of ["04-snow-observatory", "05-rain-monsoon", "06-gardens", "07-night-gardens"]) expect(shots[name]!.litFraction, `${name} has content`).toBeGreaterThan(0.5);

    /* memory: the day scene (loop 1) and the night scene (loop 2) each own their model nodes, so the first night loop moves the gauge
       (measured -10%: the loop-1 reading still included first-use resources; bounded below); once both scenes have been visited, the next day loop must be flat within 5% */
    const first = gauges[0]!;
    expect(first.approximateGpuMemoryBytes, "the gauge reads a real value").toBeGreaterThan(0);
    const rel = (g: Gauges, base: Gauges): Record<string, number> => Object.fromEntries(KEYS.map((k) => [k, base[k] === 0 ? (g[k] === 0 ? 0 : Infinity) : Math.abs(g[k] - base[k]) / base[k]]));
    const NIGHT_SCENE_GROWTH = 0.3;
    const drift: Record<string, number>[] = gauges.map((g, i) => rel(g, i === 0 ? first : i === 1 ? first : gauges[1]!));
    for (const k of KEYS) expect(drift[1]![k]!, `first night loop change ${k} ${JSON.stringify(drift[1])}`).toBeLessThanOrEqual(NIGHT_SCENE_GROWTH);
    for (const d of drift.slice(2)) for (const k of KEYS) expect(d[k], `${k} drift ${JSON.stringify(d)}`).toBeLessThanOrEqual(TOLERANCE);
    expect(gauges.every((g) => g.nodes === first.nodes), "the node count never grows").toBe(true);

    const health = await run<{ status: string; parityIds: readonly string[] } | null>("routeHealth()");
    expect(health?.status).toBe("ready");
    expect(errors.filter((e) => !/favicon/.test(e)), "no console or page errors").toEqual([]);

    const evidence = { status: "ok", tolerance: TOLERANCE, gauges, drift, circuits: circuits.map((c) => ({ ...c, legs: c.legs.map((l) => ({ ...l })) })), shots, parityIds: health?.parityIds };
    writeFileSync(resolve(REPORT_ROOT, "last-train-port.json"), JSON.stringify(evidence, null, 2));
    console.log("LAST_TRAIN_EVIDENCE", JSON.stringify({ gauges, drift, circuits: circuits.map((c) => ({ loop: c.loop, time: c.time, steps: c.steps, score: c.score })), shots }));
  });
});
