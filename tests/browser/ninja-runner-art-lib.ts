import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Art frames for the Ninja Runner port: one autopilot run per spec file, a frame at each requested biome and at the moments that
 * matter (Rasengan, gale star, clones, Sage, Kurama, finish, loss), plus draw-call diagnostics. Remote-only (tools/remote-acr/run.sh);
 * frames go to the log as `NINJA_RUNNER_ART_FRAME <name> <base64>` and are unpacked by tools/crayon-capture/ninja-runner-art-frames.ts.
 * The specs are split so several runs can render in parallel (a software-GL frame of this scene takes minutes).
 */
const REPORT_ROOT = resolve("tests/reports/ninja-runner-port");
const LAB = "/examples/ninja-runner-port/";

export const BIOME_TARGETS: Readonly<Record<string, number>> = {
  "run-start": 14, village: 120, alley: 330, stairs: 505, rooftops: 700, descent: 1080, bridge: 1320, forest: 1800, valley: 2420
};

export interface ArtPlan {
  readonly name: string;
  readonly quality: "low" | "high";
  readonly intro?: boolean;
  readonly biomes: readonly string[];
  readonly moments?: readonly ("attack" | "shuriken" | "clones")[];
  readonly forms?: readonly ("sage" | "kurama")[];
  readonly end?: boolean;
}

interface State { phase: string; s: number; form: string }
interface Api {
  ready(): boolean;
  begin(): void;
  reset(): unknown;
  setAutopilot(on: boolean): void;
  stepFrames(n: number, actions?: string[]): unknown;
  advanceUntil(form: string | null, maxSteps: number): unknown;
  settle?(frames?: number, dt?: number): void;
  state: State;
  diagnostics(): Record<string, unknown> | null;
  frame(w?: number, h?: number, q?: number): Promise<string>;
}

export function defineArt(plan: ArtPlan): void {
  test.describe(`ninja-runner-port art frames (${plan.name})`, () => {
    test.setTimeout(3_000_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); mkdirSync(REPORT_ROOT, { recursive: true }); });
    test.afterAll(async () => { await server.close(); });

    test(`captures ${plan.name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await page.setViewportSize({ width: 960, height: 540 });
      await page.goto(`${server.origin}${LAB}?manual=1&quality=${plan.quality}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const w = window as unknown as { __AURA_NINJA_RUNNER__?: { ready(): boolean }; __AURA_NINJA_RUNNER_ERROR__?: string };
        return w.__AURA_NINJA_RUNNER__?.ready() === true || Boolean(w.__AURA_NINJA_RUNNER_ERROR__);
      }, undefined, { timeout: 600_000 });
      const bootError = await page.evaluate(() => (window as unknown as { __AURA_NINJA_RUNNER_ERROR__?: string }).__AURA_NINJA_RUNNER_ERROR__ ?? null);
      if (bootError) console.log("NINJA_RUNNER_BOOT_ERROR", bootError, JSON.stringify(errors.slice(0, 8)));
      expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();

      const api = <T>(fn: (o: Api) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__AURA_NINJA_RUNNER__)`) as Promise<T>;
      const frame = async (name: string): Promise<void> => {
        await api((o) => { if (o.settle) o.settle(3, 0.06); else o.stepFrames(1); return 0; });
        const data = await api((o) => o.frame(800, 450, 0.78));
        console.log(`NINJA_RUNNER_ART_FRAME ${name} ${data.split(",")[1]}`);
      };
      const diag = async (name: string): Promise<void> => {
        const d = await api((o) => o.diagnostics());
        const pick = (k: string): unknown => (d as Record<string, unknown> | null)?.[k];
        const brief = { drawCalls: pick("drawCalls"), fps: pick("fps"), warnings: pick("warnings"), errors: pick("errors"), shadows: pick("shadows"), lighting: pick("lighting"), batching: pick("renderer.batching"), post: pick("post"), quality: pick("quality"), degradations: pick("degradations"), compiledFeatures: pick("compiledFeatures"), frame: pick("frame"), world: pick("world") };
        console.log("NINJA_RUNNER_ART_DIAG", name, JSON.stringify(brief).slice(0, 6000));
      };
      const advance = (target: number, stops: string[], maxSteps = 60000) =>
        page.evaluate(`window.__AURA_NINJA_RUNNER__.advanceTo(${target}, ${JSON.stringify(stops)}, ${maxSteps})`) as Promise<{ stop: string | null; phase: string; form: string }>;

      if (plan.intro) { await api((o) => { o.stepFrames(1); return 0; }); await frame("intro"); }
      await api((o) => { o.begin(); o.setAutopilot(true); return 0; });
      const pending = new Set<string>(plan.moments ?? []);
      const wantForms = new Set<string>(plan.forms ?? []);
      if (wantForms.size) pending.add("form");
      const shots = plan.biomes.map((n) => [n, BIOME_TARGETS[n]!] as const).sort((a, b) => a[1] - b[1]);
      let reached = 0;
      outer: for (const [name, target] of shots) {
        for (let guard = 0; guard < 40; guard++) {
          const got = await advance(target, [...pending]);
          if (got.phase !== "running") break outer;
          if (got.stop === "form") {
            if (wantForms.has(got.form)) { await advance(1e9, [], 90); await frame(`form-${got.form}`); wantForms.delete(got.form); }
            if (!wantForms.size) pending.delete("form");
            continue;
          }
          if (got.stop) { pending.delete(got.stop); await frame(got.stop === "attack" ? "rasengan" : got.stop); continue; }
          break;
        }
        await frame(name);
        reached++;
        if (name === "village" || name === "forest" || name === "rooftops") await diag(name);
      }
      // moments/forms requested without a biome shot beyond them: run on until they happen
      for (let guard = 0; guard < 40 && pending.size; guard++) {
        const got = await advance(1e9, [...pending]);
        if (got.phase !== "running") break;
        if (got.stop === "form") {
          if (wantForms.has(got.form)) { await advance(1e9, [], 90); await frame(`form-${got.form}`); wantForms.delete(got.form); }
          if (!wantForms.size) pending.delete("form");
        } else if (got.stop) { pending.delete(got.stop); await frame(got.stop === "attack" ? "rasengan" : got.stop); } else break;
      }
      if (plan.end) {
        await api((o) => { o.advanceUntil("never", 40000); return 0; });
        await frame("finish");
        await api((o) => { o.reset(); o.setAutopilot(false); return 0; });
        await api((o) => { o.advanceUntil("never", 20000); return 0; });
        await frame("lost");
        await diag("end");
      }
      console.log("NINJA_RUNNER_ART_ERRORS", JSON.stringify(errors.slice(0, 8)).slice(0, 800));
      writeFileSync(resolve(`${REPORT_ROOT}/ninja-runner-art-${plan.name}.json`), `${JSON.stringify({ frames: reached, pending: [...pending] }, null, 2)}\n`);
      expect(errors.filter((e) => !/favicon|ERR_|Failed to load resource/.test(e))).toEqual([]);
    });
  });
}

/** Draw-call budget probe: boot with `query`, run to the village, print diagnostics and one frame. */
export function defineBudget(name: string, query: string): void {
  test.describe(`ninja-runner-port budget (${name})`, () => {
    test.setTimeout(900_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });
    test(`probes ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width: 960, height: 540 });
      await page.goto(`${server.origin}${LAB}?manual=1&${query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const w = window as unknown as { __AURA_NINJA_RUNNER__?: { ready(): boolean }; __AURA_NINJA_RUNNER_ERROR__?: string };
        return w.__AURA_NINJA_RUNNER__?.ready() === true || Boolean(w.__AURA_NINJA_RUNNER_ERROR__);
      }, undefined, { timeout: 600_000 });
      await page.evaluate(`(function(){ var o = window.__AURA_NINJA_RUNNER__; o.begin(); o.setAutopilot(true); o.advanceTo(120, []); o.settle(2, 0.06); })()`);
      const diag = await page.evaluate(`(function(){ var d = window.__AURA_NINJA_RUNNER__.diagnostics(); return { drawCalls: d.drawCalls, shadows: d.shadows, errors: d.errors, frame: d.frame }; })()`);
      console.log("NINJA_RUNNER_BUDGET", name, JSON.stringify(diag).slice(0, 1500));
      const data = (await page.evaluate(`window.__AURA_NINJA_RUNNER__.frame(800, 450, 0.78)`)) as string;
      console.log(`NINJA_RUNNER_ART_FRAME budget-${name} ${data.split(",")[1]}`);
      expect(errors).toEqual([]);
    });
  });
}
