import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * saiyan-snake-way-port matched-state capture for the blind judge (remote only: tools/remote-acr/run.sh).
 *
 * The original's in-run reference frames (evidence/look-reference-frames/saiyan-snake-way, local only) were taken at base speed
 * with no hits at 10,680 / 65,147 / 72,633 km, i.e. road distance s = 59.8 / 364.8 / 406.8 m. This drives the port with idle
 * input (base speed, invulnerable so no hit lands) to the same distances at 1280x720 and prints full-page JPEGs (HUD and
 * stage banner included, as the reference frames have them) as `@@SSW_ART <tag> <name> <i> <n> <base64>` log lines.
 * Labs: the pre-pass port copy at examples/ssw-before-tmp (when present) as "before", the port as "after".
 */
const LABS: readonly (readonly [string, string])[] = [
  ...(existsSync(resolve("examples/ssw-before-tmp/index.html")) ? ([["before", "/examples/ssw-before-tmp/"]] as const) : []),
  ["after", "/examples/saiyan-snake-way-port/"]
];
const MATCHED: readonly (readonly [string, number, number])[] = [["m-early", 59.8, 205], ["m-mid", 364.8, 772], ["m-sweep", 406.8, 851]];
const EXTRAS = process.env.SSW_NO_EXTRAS !== "1";

interface Api {
  ready: boolean;
  start(): unknown;
  stepFrames(n: number, input?: { taps?: string[]; held?: string[] }): unknown;
  raw(): { s: number; speed: number };
  setState?(patch: Record<string, unknown>): unknown;
  outro?(seconds: number): unknown;
  diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null;
}

test.describe("saiyan-snake-way matched capture", () => {
  test.setTimeout(1_500_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const [TAG, LAB] of LABS) test(`captures the ${TAG} matched frames`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width: 1280, height: 720 });
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
    const shot = async (name: string): Promise<void> => {
      await page.waitForTimeout(250);
      emit(name, (await page.screenshot({ type: "jpeg", quality: 86 })).toString("base64"));
    };

    await boot("manual=1&autostart=1");
    const hasPatch = await api((o) => typeof o.setState === "function");
    for (const [name, target, steps] of MATCHED) {
      await api((o) => { o.start(); return 0; });
      if (hasPatch) await api((o) => { o.setState!({ invuln: 1e6 }); return 0; });
      await api(`(o) => o.stepFrames(${steps})` as unknown as (o: Api) => unknown);
      if (hasPatch) await api((o) => { o.setState!({ bannerT: 2.4 }); return 0; });
      const s = await api((o) => o.raw().s);
      console.log(`@@SSW_STATE ${TAG} ${name} target=${target} s=${s}`);
      await shot(name);
    }
    if (EXTRAS && hasPatch) {
      await api((o) => { o.start(); o.setState!({ invuln: 1e6 }); o.stepFrames(400); return 0; });
      await api((o) => { o.setState!({ grounded: false, vy: 9, y: 3.2 }); return 0; }); await shot("x-jump");
      await api((o) => { o.setState!({ grounded: true, vy: 0, y: 0, sliding: 0.5 }); return 0; }); await shot("x-slide");
      await api((o) => { o.setState!({ sliding: 0, puff: 6, y: 9, grounded: false, speed: 70 }); return 0; }); await shot("x-flight");
      await api((o) => { o.setState!({ puff: 0, y: 0, grounded: true, auraRung: 4, auraVis: 1, surge: "on", speed: 90 }); return 0; }); await shot("x-surge");
      await api((o) => { o.setState!({ auraRung: 0, auraVis: 0, surge: "off", speed: 32, phase: "fall", fallWhy: "OFF THE ROAD" }); o.outro!(1.1); return 0; }); await shot("x-fall");
      await api((o) => { o.setState!({ phase: "over", ended: "TOO LATE", score: 48210 }); o.outro!(3); return 0; });
      await page.waitForTimeout(600); await shot("x-results");
      await boot("manual=1"); await shot("x-title");
    }
    const health = await api((o) => o.diagnostics());
    console.log(`@@SSW_PERF ${TAG} ${JSON.stringify({ drawCalls: health?.drawCalls ?? null, errors: health?.errors?.length ?? null })}`);
    expect(errors.filter((e) => /GLSL|shader|CUSTOM_TEXTURE|parity-not-implemented|redefinition/i.test(e))).toEqual([]);
  });
});
