import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * ninja-runner-port - PRD §7.2 Phase C, browser half (docs/workflows/threejs-parity-gaps.md, task R-20).
 *
 * Remote-only (tools/remote-acr/run.sh); never run under local Playwright. Drives `examples/ninja-runner-port`
 * through `window.__AURA_NINJA_RUNNER__` and checks the Phase C exit: the port plays through movement, jump,
 * combat, shadow clones, form changes (Sage, Beast), a win, a restart and a loss, with real pixels on every
 * frame, thirteen independent skinned actors (four `cloneSkinned` calls, one per generated character model, textures shared within a model) and the original's
 * recorded 106 s run reproduced step-exactly inside the live page.
 * Compact JPEG frames go to the log as `NINJA_RUNNER_FRAME <name> <base64>` because ACR runs cannot return files.
 */

const REPORT_ROOT = resolve("tests/reports/ninja-runner-port");
const LAB = "/examples/ninja-runner-port/";
const FIXTURE = "tests/browser/data/ninja-runner-reference-replay.json";

interface RunSummary {
  outcome: string; steps: number; lostBy: string | null; distance: number; time: number; kills: number; score: number; health: number; spirit: number;
  bestCombo: number; form: string; vaults: number; damageTaken: number; cloneStrikes: number; eventCounts: Record<string, number>;
  events: { step: number; type: string; [k: string]: unknown }[]; trace: Record<string, number | string | boolean>[];
}
interface Fixture { step: number; courseDigest: { entities: number; fnv1a: string }; script: string; tolerance: { numeric: number; eventSteps: number }; reference: RunSummary; idle: RunSummary }
interface State { phase: string; s: number; x: number; y: number; lane: number; health: number; spirit: number; kills: number; score: number; form: string; clones: number; attack: number; slide: number; vy: number; falling: boolean; time: number }
interface Api {
  ready(): boolean;
  begin(): void;
  reset(): unknown;
  applyInput(a: string): boolean;
  setAutopilot(on: boolean): void;
  stepFrames(n: number, actions?: string[]): Record<string, unknown>;
  advanceUntil(form: string | null, maxSteps: number): Record<string, unknown>;
  advanceTo(s: number, stops?: string[], maxSteps?: number): { stop: string | null; phase: string };
  state: State;
  courseDigest(): { entities: number; fnv1a: string };
  replay(text: string, max?: number): RunSummary;
  runIdle(max?: number): RunSummary;
  probeBones(): { joint: string; translations: number[][]; distinct: number };
  stats(): { visibleActors: number; actors: number; pickups: number; particles: number; shared: { textureEntries: number; refs: number; clips: string[]; clip: string } | null };
  diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null;
  routeHealth(): { status: string; parityIds: readonly string[] } | null;
  frame(w?: number, h?: number, q?: number): Promise<string>;
  pixels(): Promise<{ width: number; height: number; litPixels: number }>;
}

test.describe("ninja-runner-port (Phase C)", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_ROOT, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("plays movement, combat, clones, both forms, a win, a restart and a loss, and replays the original step-exactly", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width: 480, height: 270 });
    await page.goto(`${server.origin}${LAB}?manual=1&quality=low`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_NINJA_RUNNER__?: { ready(): boolean }; __AURA_NINJA_RUNNER_ERROR__?: string };
        return w.__AURA_NINJA_RUNNER__?.ready() === true || Boolean(w.__AURA_NINJA_RUNNER_ERROR__);
      },
      undefined,
      { timeout: 600_000 }
    );
    const bootError = await page.evaluate(() => (window as unknown as { __AURA_NINJA_RUNNER_ERROR__?: string }).__AURA_NINJA_RUNNER_ERROR__ ?? null);
    if (bootError) console.log("NINJA_RUNNER_BOOT_ERROR", bootError, JSON.stringify(errors.slice(0, 8)));
    expect(bootError, JSON.stringify(errors.slice(0, 8))).toBeNull();

    // software GL renders this scene slowly: every page call has a hard timeout, and long runs step the sim without rendering
    const STEP_TIMEOUT = 240_000;
    const api = <T>(fn: (o: Api) => T | Promise<T>): Promise<T> => Promise.race([
      page.evaluate(`(${fn.toString()})(window.__AURA_NINJA_RUNNER__)`) as Promise<T>,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`step timed out after ${STEP_TIMEOUT} ms: ${fn.toString().slice(0, 90)}`)), STEP_TIMEOUT))
    ]);
    const state = (): Promise<State> => api((o) => JSON.parse(JSON.stringify(o.state)) as State);
    const frame = async (name: string): Promise<void> => {
      const data = await api((o) => o.frame(480, 270, 0.7));
      console.log(`NINJA_RUNNER_FRAME ${name} ${data.split(",")[1]}`);
    };
    const lit = async (): Promise<number> => {
      const p = await api((o) => o.pixels());
      return p.litPixels / (p.width * p.height);
    };
    const fixture = JSON.parse(readFileSync(resolve(FIXTURE), "utf8")) as Fixture;

    // ---- intro: the world renders before the run starts ----
    await api((o) => { o.stepFrames(1); return 0; });
    const introLit = await lit();
    console.log("NINJA_RUNNER_STATS intro", JSON.stringify({ lit: introLit }));
    expect(introLit).toBeGreaterThan(0.5);
    await frame("intro");

    // ---- the course is the original's course ----
    const digest = await api((o) => o.courseDigest());
    expect(digest.entities).toBe(fixture.courseDigest.entities);
    expect(digest.fnv1a).toBe(fixture.courseDigest.fnv1a);

    // ---- movement: lane change, jump, land ----
    await api((o) => { o.begin(); o.stepFrames(120); return 0; });
    const s0 = await state();
    expect(s0.phase).toBe("running");
    expect(s0.s).toBeGreaterThan(15);
    await frame("run-start");
    await api((o) => { o.applyInput("left"); o.stepFrames(60); return 0; });
    const sLeft = await state();
    expect(sLeft.lane).toBe(-1);
    expect(sLeft.x).toBeLessThan(-0.5);
    await api((o) => { o.applyInput("jump"); o.stepFrames(24); return 0; });
    const air = await state();
    expect(air.y).toBeGreaterThan(0.5);
    await frame("jump");
    await api((o) => { o.stepFrames(120); return 0; });
    expect((await state()).y).toBe(0);

    // ---- combat, clones, Spiralstar: the capture policy plays; frames at the moments that matter ----
    await api((o) => { o.reset(); o.setAutopilot(true); return 0; });
    let sawClones = false, sawAttack = false;
    const stats = { visibleMax: 0, clonesFrame: 0 };
    for (let guard = 0; guard < 20 && !(sawClones && sawAttack); guard++) {
      const stops = [sawAttack ? "" : "attack", sawClones ? "" : "clones"].filter(Boolean);
      const got = await page.evaluate(`window.__AURA_NINJA_RUNNER__.advanceTo(2640, ${JSON.stringify(stops)})`) as { stop: string | null; phase: string };
      if (got.phase !== "running") break;
      if (got.stop === "attack") { sawAttack = true; await frame("spiralorb"); }
      if (got.stop === "clones") { sawClones = true; stats.clonesFrame = guard; await frame("clones"); stats.visibleMax = (await api((o) => o.stats())).visibleActors; }
    }
    if (sawAttack && sawClones) { const here = (await state()).s; await page.evaluate(`window.__AURA_NINJA_RUNNER__.advanceTo(${here + 90}, [])`); }
    expect(sawAttack, "the Spiralorb fired during the autopilot run").toBe(true);
    expect(sawClones, "shadow clones were cast").toBe(true);
    expect(stats.visibleMax).toBeGreaterThanOrEqual(4);
    const fighting = await state();
    expect(fighting.kills).toBeGreaterThan(0);
    console.log("NINJA_RUNNER_STATS combat", JSON.stringify({ kills: fighting.kills, s: fighting.s, stats }));

    // ---- thirteen actors from four cloneSkinned calls (hero+clones, soldiers, brutes, sage): independent skeletons, shared GPU textures ----
    const probe = await api((o) => o.probeBones());
    const shared = (await api((o) => o.stats())).shared!;
    console.log("NINJA_RUNNER_STATS actors", JSON.stringify({ joint: probe.joint, distinct: probe.distinct, shared }));
    expect(probe.translations.length).toBe(13);
    expect(probe.distinct).toBeGreaterThanOrEqual(11);
    expect(shared.refs).toBeGreaterThanOrEqual(12);

    // ---- forms: Sage at 600 m, Beast at 1,620 m (the policy switches); a frame in each ----
    await api((o) => { o.advanceUntil("sage", 20000); return 0; });
    const inSage = await state();
    expect(inSage.form, "reached Sage Mode").toBe("sage");
    await frame("sage");
    await api((o) => { o.advanceUntil("beast", 30000); return 0; });
    const inBeast = await state();
    expect(inBeast.form, "reached Beast Mode").toBe("beast");
    await api((o) => { o.stepFrames(30); return 0; });
    await frame("beast");

    // ---- a win: the autopilot runs the whole course ----
    await api((o) => { o.advanceUntil("never", 40000); return 0; });
    const end = await state();
    console.log("NINJA_RUNNER_STATS finish", JSON.stringify({ phase: end.phase, s: end.s, kills: end.kills, score: end.score, time: end.time }));
    expect(end.phase).toBe("won");
    expect(end.s).toBe(2640);
    await frame("finish");
    expect(await page.locator("#result").isVisible()).toBe(true);

    // ---- restart + a loss: no input falls into the first rooftop gap ----
    await api((o) => { o.reset(); o.setAutopilot(false); return 0; });
    const fresh = await state();
    expect(fresh.phase).toBe("running");
    expect(fresh.s).toBe(0);
    expect(fresh.health).toBe(5);
    await api((o) => { o.advanceUntil("never", 20000); return 0; });
    const lost = await state();
    expect(lost.phase).toBe("lost");
    expect(lost.falling).toBe(true);
    await frame("lost");
    expect(await page.locator("#result").isVisible()).toBe(true);

    // ---- the original's recorded run, replayed step-exactly in the live page ----
    const replayed = await page.evaluate((text) => (window as unknown as { __AURA_NINJA_RUNNER__: Api }).__AURA_NINJA_RUNNER__.replay(text), fixture.script);
    const idleReplayed = await api((o) => o.runIdle());
    const ref = fixture.reference;
    const key = (e: object): string => JSON.stringify(e, Object.keys(e).sort());
    let maxDelta = 0;
    for (let i = 0; i < Math.min(replayed.trace.length, ref.trace.length); i++) {
      for (const k of ["time", "s", "x", "y", "vy", "speed", "spirit", "attack", "dash", "slide", "invulnerable", "clones"]) {
        maxDelta = Math.max(maxDelta, Math.abs((replayed.trace[i]![k] as number) - (ref.trace[i]![k] as number)));
      }
    }
    const eventsEqual = replayed.events.length === ref.events.length && replayed.events.every((e, i) => key(e) === key(ref.events[i]!));
    console.log("NINJA_RUNNER_REPLAY", JSON.stringify({ steps: replayed.steps, referenceSteps: ref.steps, outcome: replayed.outcome, kills: replayed.kills, score: replayed.score, time: replayed.time, eventsEqual, events: replayed.events.length, maxDelta, tolerance: fixture.tolerance.numeric, idle: { outcome: idleReplayed.outcome, steps: idleReplayed.steps, referenceSteps: fixture.idle.steps } }));
    expect(replayed.outcome).toBe(ref.outcome);
    expect(replayed.steps).toBe(ref.steps);
    expect(replayed.kills).toBe(ref.kills);
    expect(replayed.score).toBe(ref.score);
    expect(replayed.time).toBe(ref.time);
    expect(replayed.eventCounts).toEqual(ref.eventCounts);
    expect(eventsEqual).toBe(true);
    expect(maxDelta).toBeLessThanOrEqual(fixture.tolerance.numeric);
    expect(idleReplayed.outcome).toBe(fixture.idle.outcome);
    expect(idleReplayed.steps).toBe(fixture.idle.steps);

    // ---- engine health ----
    const diagnostics = await api((o) => o.diagnostics());
    const health = await api((o) => o.routeHealth());
    console.log("NINJA_RUNNER_DIAG", JSON.stringify({ drawCalls: diagnostics?.drawCalls, errors: diagnostics?.errors, health }), JSON.stringify(errors.slice(0, 6)).slice(0, 600));
    expect((diagnostics?.errors ?? []).length).toBe(0);
    expect(health?.status).toBe("ready");
    expect(health?.parityIds ?? []).toContain("SA-04");
    expect(errors.filter((e) => !/favicon|ERR_|Failed to load resource/.test(e))).toEqual([]);

    writeFileSync(resolve(`${REPORT_ROOT}/ninja-runner-port.json`), `${JSON.stringify({
      schema: "a3d-ninja-runner-port-report/1",
      claimBoundary: "Proves the Aura3D port boots on WebGL2, renders its world and thirteen independent skinned actors, plays movement/combat/clones/Sage/Beast/win/restart/loss, and that its fixed-step simulation reproduces the original's recorded 106 s run event-for-event. It does not claim pixel parity: the characters and the village kit are generated models (Meshy text-to-3D, own prompts) and the ground, sky, water and effects are procedural.",
      replay: { steps: replayed.steps, kills: replayed.kills, score: replayed.score, eventsEqual, maxDelta },
      actors: { distinct: probe.distinct, shared },
      finish: { s: end.s, kills: end.kills, score: end.score }
    }, null, 2)}\n`);
  });
});
