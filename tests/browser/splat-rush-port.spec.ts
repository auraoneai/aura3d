import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * splat-rush-port: browser half of the Splat Rush port (docs/workflows/threejs-parity-gaps.md, R-20 / R-25).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives `examples/splat-rush-port`
 * through `window.__AURA_SPLAT_RUSH__` on WebGL2:
 *   - the lab boots with no engine error and no parity-not-implemented error,
 *   - the splash, run and game-over frames contain the scene where it must be (sky, cream deck, coloured gates),
 *   - the in-page replay of the captured original reproduces the recorded trace (fixture copied from
 *     evidence/crayon-capture/splat-rush-reference.json because `evidence/` is not in the remote context),
 *   - the rendered frame changes while the run advances.
 * Compact JPEG frames are written to the log as `SPLAT_RUSH_FRAME <name> <base64>` (ACR runs cannot return files).
 */

const REPORT_ROOT = resolve("tests/reports/splat-rush-port");
const LAB = "/examples/splat-rush-port/";
const FIXTURE = "tests/browser/data/splat-rush-reference-replay.json";

interface Hooks {
  ready(): boolean;
  begin(): void;
  stepFrames(n: number, input?: Record<string, unknown>): Record<string, unknown> & { phase: string; score: number; lives: number; combo: number; gates: number; rngCount: number };
  runAutopilot(n: number, mistakeRows?: number[]): Record<string, unknown> & { phase: string; score: number; lives: number; combo: number; gates: number };
  replay(text: string, warmup?: number, seed?: number): number[][];
  frame(w?: number, h?: number, q?: number): Promise<string>;
  pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  reset(seed?: number): void;
  diagnostics(): { errors?: readonly unknown[]; drawCalls?: number } | null;
  routeHealth(): { status: string; parityIds: readonly string[] } | null;
  nodeCount(): number;
}
type Win = Window & { __AURA_SPLAT_RUSH__: Hooks; __AURA_SPLAT_RUSH_ERROR__?: string };

interface Fixture { seed: number; warmup: number; script: string; columns: string[]; trace: number[][] }

test.describe("splat-rush-port", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("boots on WebGL2, renders sky, deck and gates, and replays the captured original exactly", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewportSize({ width: 800, height: 450 });
    await page.goto(`${server.origin}${LAB}?manual=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as Win).__AURA_SPLAT_RUSH__?.ready() === true || Boolean((window as unknown as Win).__AURA_SPLAT_RUSH_ERROR__), undefined, { timeout: 240_000 });
    const bootError = await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_RUSH_ERROR__ ?? null);
    expect(bootError, "boot error").toBeNull();

    const save = async (name: string): Promise<void> => {
      const jpeg = await page.evaluate((n) => (window as unknown as Win).__AURA_SPLAT_RUSH__.frame(480, 270, 0.7).then((d) => ({ n, d })), name);
      writeFileSync(resolve(REPORT_ROOT, `${name}.jpg`), Buffer.from(jpeg.d.split(",")[1] as string, "base64"));
      process.stdout.write(`SPLAT_RUSH_FRAME ${name} ${jpeg.d.split(",")[1]}\n`);
    };
    const stats = async () => page.evaluate(async () => {
      const { width, height, data } = await (window as unknown as Win).__AURA_SPLAT_RUSH__.pixels();
      const region = (x0: number, y0: number, x1: number, y1: number) => {
        let sat = 0, bright = 0, n = 0, blueTop = 0, cream = 0;
        for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++) for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) {
          const i = (y * height * 0 + y * width + x) * 4, r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
          n++;
          if (Math.max(r, g, b) - Math.min(r, g, b) > 90) sat++;
          if (r + g + b > 210) bright++;
          if (b > r + 25 && b > 120) blueTop++;
          if (r > 200 && g > 190 && b > 160 && r - b < 70) cream++;
        }
        return { n, sat, bright, blueTop, cream };
      };
      return { width, height, top: region(0, 0, 1, 0.3), mid: region(0.3, 0.3, 0.7, 0.75), low: region(0.2, 0.7, 0.8, 1) };
    });

    /* splash */
    const hooks = (fn: string) => fn;
    void hooks;
    await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_RUSH__.stepFrames(30));
    await save("01-splash");
    const splash = await stats();
    expect(splash.top.blueTop, "sky gradient in the top third").toBeGreaterThan(splash.top.n * 0.3);

    /* run with the autopilot: gates and the deck must be visible, and the frame must change */
    await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_RUSH__.reset(20261023));
    const early = await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_RUSH__.runAutopilot(180));
    expect(early.phase).toBe("playing");
    expect(early.gates).toBeGreaterThan(5);
    await save("02-run-3s");
    const run1 = await stats();
    expect(run1.low.cream, "cream deck under the ball").toBeGreaterThan(run1.low.n * 0.02);
    expect(run1.mid.sat, "coloured gates and ball in the middle").toBeGreaterThan(40);
    const late = await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_RUSH__.runAutopilot(420));
    expect(late.score).toBeGreaterThan(early.score as number);
    await save("03-run-10s");
    const run2 = await stats();
    expect(JSON.stringify(run2)).not.toBe(JSON.stringify(run1));

    /* game over with deliberate mistakes */
    await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_RUSH__.reset(20261023));
    const dead = await page.evaluate(() => (window as unknown as Win).__AURA_SPLAT_RUSH__.runAutopilot(700, [1, 2, 3]));
    expect(dead.phase).toBe("gameOver");
    expect(dead.lives).toBe(0);
    await save("04-game-over");

    /* exact replay of the captured original (state, events and random-draw count) */
    const fixture = JSON.parse(readFileSync(resolve(FIXTURE), "utf8")) as Fixture;
    const trace = await page.evaluate((f) => (window as unknown as Win).__AURA_SPLAT_RUSH__.replay(f.script, f.warmup, f.seed), fixture);
    expect(trace.length).toBe(fixture.trace.length);
    const float = new Set(["px", "py", "pz", "camx", "camy", "camz"]);
    let worst = 0, firstExact = -1;
    for (let i = 0; i < trace.length; i++) {
      for (let c = 0; c < fixture.columns.length; c++) {
        const a = trace[i]![c]!, b = fixture.trace[i]![c]!;
        if (float.has(fixture.columns[c]!)) worst = Math.max(worst, Math.abs(a - b));
        else if (a !== b && firstExact < 0) firstExact = i * 100 + c;
      }
    }
    expect(firstExact, "first non-float field mismatch (row*100+column)").toBe(-1);
    expect(worst, "position/camera fields differ by at most libm noise").toBeLessThan(1e-9);

    const health = await page.evaluate(() => ({ routeHealth: (window as unknown as Win).__AURA_SPLAT_RUSH__.routeHealth(), diagnostics: (window as unknown as Win).__AURA_SPLAT_RUSH__.diagnostics(), nodes: (window as unknown as Win).__AURA_SPLAT_RUSH__.nodeCount() }));
    expect(health.routeHealth?.status).toBe("ready");
    expect(health.routeHealth?.parityIds).toContain("R-23");
    expect(health.diagnostics?.errors ?? []).toEqual([]);
    expect(health.nodes, "merged batches (C9): about 60 runtime nodes, not one per entity").toBeGreaterThan(40);
    expect(errors.filter((e) => /parity-not-implemented|CUSTOM_TEXTURE_UNBOUND/.test(e)), "no unimplemented-surface errors").toEqual([]);
    expect(errors.filter((e) => !/favicon|net::ERR|Failed to load resource/.test(e)), "console errors").toEqual([]);
    writeFileSync(resolve(REPORT_ROOT, "stats.json"), JSON.stringify({ splash, run1, run2, health }, null, 2));
  });
});
