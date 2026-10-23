import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * kid-goku-beyond-the-clouds-port: browser half. Remote-only (tools/remote-acr/run.sh); never local Playwright.
 * Drives `examples/kid-goku-beyond-the-clouds-port` through `window.__AURA_KID_GOKU__`:
 *   - boots on WebGL2 with no engine error, route health ready,
 *   - the frame has real road/meadow pixels (not just sky) and changes while the run advances,
 *   - the scripted run (jump at s>=147) clears the 150-160 gap and takes Dragon Ball 1,
 *   - the same script run twice gives identical state (determinism in the browser),
 *   - the recorded reference input (tests/browser/data/kid-goku-beyond-the-clouds-reference-replay.json, when
 *     present) reproduces the original's recorded trace.
 * Compact JPEG frames are written to the log as `KID_GOKU_FRAME <name> <base64>`.
 */

const LAB = "/examples/kid-goku-beyond-the-clouds-port/?manual=1";
const REPLAY_FIXTURE = "tests/browser/data/kid-goku-beyond-the-clouds-reference-replay.json";

interface Snap {
  phase: string; s: number; lane: number; jump: number; speed: number; hearts: number; score: number; combo: number;
  balls: number[]; meat: number; fallen: number; pole: number | null; finished: boolean;
  nimbus: { charge: number; active: boolean; call: number; time: number };
}
interface Seg { steps: number; input: { steer: number; jump: boolean; pole: boolean; nimbus: boolean; brake: boolean } }
interface Api {
  ready: boolean;
  snapshot(): Snap;
  reset(): void;
  begin(): void;
  stepFrames(n: number, input?: Seg["input"]): string[];
  replay(segments: Seg[], every?: number): { steps: number; trace: Snap[] };
  frame(w?: number, h?: number, q?: number): Promise<string>;
  pixels(): Promise<{ width: number; height: number; data: number[] }>;
  info(): { memory?: { geometries?: number; programs?: number } } | null;
  diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null;
  routeHealth(): { status: string; parityIds: readonly string[] } | null;
  errors(): string[];
}
declare global { interface Window { __AURA_KID_GOKU__?: Api } }

test.describe("kid-goku-beyond-the-clouds-port", () => {
  test.setTimeout(600_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(resolve("tests/reports/kid-goku-beyond-the-clouds-port"), { recursive: true });
  });
  test.afterAll(async () => { await server.close(); });

  const boot = async (page: import("@playwright/test").Page, errors: string[]) => {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}${LAB}`);
    await page.waitForFunction(() => window.__AURA_KID_GOKU__?.ready === true, undefined, { timeout: 240_000 });
  };

  const stats = (page: import("@playwright/test").Page) => page.evaluate(async () => {
    const api = window.__AURA_KID_GOKU__!;
    const { width, height, data } = await api.pixels();
    const sky = [data[0]!, data[1]!, data[2]!];
    let lowerNon = 0, lowerN = 0, sum = 0, sum2 = 0, n = 0;
    const colors = new Set<number>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += luma; sum2 += luma * luma; n++;
        colors.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
        if (y > height * 0.55) { lowerN++; if (Math.abs(r - sky[0]!) + Math.abs(g - sky[1]!) + Math.abs(b - sky[2]!) > 48) lowerNon++; }
      }
    }
    const mean = sum / n;
    // sky band (top 12% of rows) vs road region (lower centre): a pastel scene has distinct hues even when its luma is flat
    const region = (x0: number, x1: number, y0: number, y1: number): number[] => {
      let r = 0, g = 0, b = 0, c = 0;
      for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y++) for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x++) { const i = (y * width + x) * 4; r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; c++; }
      return [r / c, g / c, b / c];
    };
    const top = region(0, 1, 0, 0.12), road = region(0.42, 0.58, 0.8, 0.98);
    const skyRoadDistance = Math.abs(top[0]! - road[0]!) + Math.abs(top[1]! - road[1]!) + Math.abs(top[2]! - road[2]!);
    return { width, height, lowerNonSky: lowerNon / lowerN, lumaMean: mean, lumaStd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), colors: colors.size, skyRoadDistance };
  });

  const emit = async (page: import("@playwright/test").Page, name: string) => {
    const b64 = await page.evaluate(() => window.__AURA_KID_GOKU__!.frame(480, 270, 0.6));
    console.log(`KID_GOKU_FRAME ${name} ${b64}`);
    return b64;
  };

  const JUMP_AT_S = 147;
  const runScripted = (page: import("@playwright/test").Page, frames: number) => page.evaluate(({ frames, jumpAt }) => {
    const api = window.__AURA_KID_GOKU__!;
    api.reset();
    let jumped = false;
    const events: string[] = [];
    for (let i = 0; i < frames; i++) {
      const jump = !jumped && api.snapshot().s >= jumpAt;
      if (jump) jumped = true;
      events.push(...api.stepFrames(1, { steer: 0, jump, pole: false, nimbus: false, brake: false }));
    }
    return { snap: api.snapshot(), events };
  }, { frames, jumpAt: JUMP_AT_S });

  test("boots on WebGL2, renders the road, and reproduces the scripted run deterministically", async ({ page }) => {
    const errors: string[] = [];
    await boot(page, errors);
    const health = await page.evaluate(() => window.__AURA_KID_GOKU__!.routeHealth());
    expect(health?.status).toBe("ready");
    expect(health?.parityIds).toContain("SG-05");

    // frame 0: the road and meadow must be on screen, not only sky
    const start = await stats(page);
    console.log(`KID_GOKU_STATS start ${JSON.stringify(start)}`);
    expect(start.lowerNonSky).toBeGreaterThan(0.25);
    expect(start.skyRoadDistance).toBeGreaterThan(60);
    expect(start.lumaStd).toBeGreaterThan(2);
    expect(start.colors).toBeGreaterThan(12);
    const f0 = await emit(page, "start");

    // the scripted run: jump at s>=147 clears the gap and takes Dragon Ball 1
    const first = await runScripted(page, 760);
    console.log(`KID_GOKU_RUN ${JSON.stringify(first.snap)}`);
    expect(first.snap.fallen).toBe(0);
    expect(first.snap.balls).toContain(1);
    expect(first.events).toContain("dragonball");
    expect(first.snap.s).toBeGreaterThan(150);
    const mid = await stats(page);
    expect(mid.lowerNonSky).toBeGreaterThan(0.25);
    const f1 = await emit(page, "after-gap");
    expect(f1).not.toBe(f0);

    // determinism: the same script again gives the identical snapshot
    const second = await runScripted(page, 760);
    expect(JSON.stringify(second.snap)).toBe(JSON.stringify(first.snap));

    const diag = await page.evaluate(() => window.__AURA_KID_GOKU__!.diagnostics());
    expect(diag?.errors?.length ?? 0).toBe(0);
    console.log(`KID_GOKU_DIAG drawCalls=${diag?.drawCalls ?? "n/a"} geometries=${(await page.evaluate(() => window.__AURA_KID_GOKU__!.info()))?.memory?.geometries ?? "n/a"}`);
    expect(await page.evaluate(() => window.__AURA_KID_GOKU__!.errors())).toEqual([]);
    expect(errors.filter((e) => !/favicon|net::ERR|GPU stall|swiftshader/i.test(e))).toEqual([]);
  });

  const hasFixture = existsSync(resolve(REPLAY_FIXTURE));
  (hasFixture ? test : test.skip)("replays the original's recorded input and matches its recorded trace", async ({ page }) => {
    const fixture = JSON.parse(readFileSync(resolve(REPLAY_FIXTURE), "utf8")) as {
      segments: Seg[]; every: number; tolerance: { s: number; lane: number; jump: number; speed: number }; trace: (Snap & { step: number })[];
    };
    const errors: string[] = [];
    await boot(page, errors);
    const out = await page.evaluate(({ segments, every }) => {
      const api = window.__AURA_KID_GOKU__!;
      api.begin();
      return api.replay(segments, every);
    }, { segments: fixture.segments, every: fixture.every });
    const ref = fixture.trace;
    let worst = { s: 0, lane: 0, jump: 0, speed: 0 };
    for (let i = 0; i < Math.min(out.trace.length, ref.length); i++) {
      const a = out.trace[i]!, b = ref[i]!;
      worst = {
        s: Math.max(worst.s, Math.abs(a.s - b.s)), lane: Math.max(worst.lane, Math.abs(a.lane - b.lane)),
        jump: Math.max(worst.jump, Math.abs(a.jump - b.jump)), speed: Math.max(worst.speed, Math.abs(a.speed - b.speed))
      };
    }
    console.log(`KID_GOKU_REPLAY worst=${JSON.stringify(worst)} compared=${Math.min(out.trace.length, ref.length)}`);
    expect(out.trace.length).toBeGreaterThan(0);
    expect(worst.s).toBeLessThanOrEqual(fixture.tolerance.s);
    expect(worst.lane).toBeLessThanOrEqual(fixture.tolerance.lane);
    expect(worst.jump).toBeLessThanOrEqual(fixture.tolerance.jump);
    expect(worst.speed).toBeLessThanOrEqual(fixture.tolerance.speed);
  });
});
