import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * ninja-runner-port rework lane (docs/workflows/game-rework-prompt.md 3.8): ramming a crate or beam has physical
 * consequences. Remote-only (tools/remote-acr/run.sh, RUN_ID prefix rwnin); never run under local Playwright.
 * Each scenario places the runner before a crate, steps into it, then renders the aftermath in real time. Frames go to
 * the log as `NINJA_RAM_FRAME <scenario>-<n>-<label> <base64>`; metrics as `NINJA_RAM_RESULT <json>`.
 */

const LAB = "/examples/ninja-runner-port/";

interface Api {
  ready(): boolean;
  begin(): void;
  stepFrames(n: number, actions?: string[]): Record<string, unknown>;
  stepRaw(n: number): Record<string, unknown>;
  settle(frames?: number, dt?: number): void;
  state: Record<string, any>;
  stats(): { debris: number; particles: number; visibleActors: number };
  frame(w?: number, h?: number, q?: number): Promise<string>;
  pixels(): Promise<{ width: number; height: number; litPixels: number }>;
  diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null;
}

interface Scenario { name: string; kind: "barrier" | "beam"; time: number; patch: Record<string, number> }

const SCENARIOS: Scenario[] = [
  { name: "bump", kind: "barrier", time: 0, patch: {} },
  { name: "crash", kind: "barrier", time: 40, patch: {} },
  { name: "smash", kind: "barrier", time: 0, patch: { dash: 1.2 } },
  { name: "glance", kind: "barrier", time: 0, patch: { invulnerable: 3 } },
  { name: "beam", kind: "beam", time: 40, patch: {} }
];

test.describe("ninja-runner rework: obstacle impacts", () => {
  test.setTimeout(2_400_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("each impact tier stops, knocks back or breaks the obstacle with visible debris", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}${LAB}?manual=1&quality=low`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURA_NINJA_RUNNER__?: { ready(): boolean } }).__AURA_NINJA_RUNNER__?.ready() === true, undefined, { timeout: 600_000 });

    const api = <T>(fn: (o: Api) => T | Promise<T>, arg?: unknown): Promise<T> =>
      page.evaluate(`(${fn.toString()})(window.__AURA_NINJA_RUNNER__, ${JSON.stringify(arg ?? null)})`) as Promise<T>;
    const frame = async (name: string): Promise<void> => {
      const data = await api((o) => o.frame(480, 270, 0.7));
      console.log(`NINJA_RAM_FRAME ${name} ${data.split(",")[1]}`);
    };

    const results: Record<string, unknown> = {};
    for (const sc of SCENARIOS) {
      await api((o) => { o.begin(); return 0; });
      const setup = (await page.evaluate(`((o, sc) => {
        const z = o.state;
        const b = z.entities.find((e) => e.type === sc.kind && e.alive && e.s > 200);
        z.entities.forEach((e) => { if (e !== b && e.type !== "chakra") e.alive = false; });
        b.lane = 0; z.x = 0; z.s = b.s - 9; z.time = sc.time; z.y = 0; z.vy = 0;
        Object.assign(z, sc.patch);
        return { at: b.s, s0: z.s, health0: z.health };
      })(window.__AURA_NINJA_RUNNER__, ${JSON.stringify(sc)})`)) as { at: number; s0: number; health0: number };
      await api((o) => { o.stepFrames(0); return 0; });
      await frame(`${sc.name}-0-approach`);

      // step until the obstacle is hit or broken, tracking the slowest speed and the largest backward move
      const hit = await page.evaluate(`((o, at) => {
        const z = o.state; let slowest = z.speed, backMax = 0, prevS = z.s, impactStep = -1;
        for (let i = 0; i < 400; i++) {
          o.stepRaw(1);
          slowest = Math.min(slowest, z.speed);
          backMax = Math.max(backMax, prevS - z.s);
          prevS = z.s;
          if (impactStep < 0 && (z.health < 5 || !z.entities.find((e) => e.s === at && e.alive))) { impactStep = i; break; }
        }
        return { impactStep, sAtImpact: z.s, speed: z.speed, health: z.health, backMax };
      })(window.__AURA_NINJA_RUNNER__, ${setup.at})`) as { impactStep: number; sAtImpact: number; speed: number; health: number; backMax: number };
      await api((o) => { o.stepFrames(0); return 0; });
      await frame(`${sc.name}-1-impact`);
      // advance real time with few, large render steps (software GL renders this scene slowly)
      const rows: { label: string; debris: number; s: number; speed: number }[] = [];
      for (const [label, frames, dt] of [["t0.12", 2, 0.06], ["t0.6", 3, 0.16]] as const) {
        const row = await page.evaluate(`((o, label, frames, dt) => {
          o.stepRaw(3);
          o.settle(frames, dt);
          return { label, debris: o.stats().debris, s: o.state.s, speed: o.state.speed };
        })(window.__AURA_NINJA_RUNNER__, ${JSON.stringify(label)}, ${frames}, ${dt})`) as { label: string; debris: number; s: number; speed: number };
        rows.push(row);
        await frame(`${sc.name}-2-${label}`);
      }
      const settled = await page.evaluate(`((o) => { o.settle(2, 0.4); return { debris: o.stats().debris, health: o.state.health, phase: o.state.phase, speed: o.state.speed }; })(window.__AURA_NINJA_RUNNER__)`) as { debris: number; health: number; phase: string; speed: number };
      const after = { rows, settled, health: settled.health, phase: settled.phase };
      const lit = await api((o) => o.pixels());
      results[sc.name] = { ...setup, ...hit, after, litFraction: lit.litPixels / (lit.width * lit.height) };
    }
    const diag = await api((o) => o.diagnostics());
    console.log("NINJA_RAM_RESULT", JSON.stringify({ results, drawCalls: diag?.drawCalls ?? null, errors: errors.slice(0, 6) }));

    const r = results as Record<string, any>;
    for (const name of ["bump", "crash", "beam"]) {
      expect(r[name].health, `${name} costs a hit point`).toBe(4);
      expect(r[name].after.rows[0].debris, `${name} throws debris`).toBeGreaterThan(0);
    }
    expect(r.smash.health, "smash costs nothing").toBe(5);
    expect(r.smash.after.rows[0].debris, "smash throws debris").toBeGreaterThan(0);
    expect(r.glance.health, "glance costs nothing").toBe(5);
    expect(r.crash.backMax).toBeGreaterThan(r.bump.backMax);
    expect(r.bump.backMax).toBeGreaterThan(0.3);
    expect(r.smash.backMax).toBe(0);
    expect(r.crash.after.settled.debris).toBeLessThanOrEqual(r.crash.after.rows[0].debris);
    expect(errors, JSON.stringify(errors.slice(0, 4))).toEqual([]);
  });
});
