import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Gate G1, in a real browser: each scenario of evidence/aura-slam/reference.json is replayed through the REAL native shell
 * (bootAuraSlam: input mapper, key listeners, adapter controller, menu, loop) against the native simulation. Only the
 * renderer is a stub (rendering parity is gate G3). Procedure mirrors tests/browser/aura-slam-capture.spec.ts: one
 * synchronous evaluate per scenario; scripted `KeyboardEvent`s on `document.body`; `window.advanceTime(1000 / 60)` per step
 * (one fixed step and one present, so the adapter controller runs once per step); snapshot, two-lane FNV digest, event log
 * and score timeline recorded as in the capture. The baseline was captured on Linux x64 Chromium, so the digest of every
 * scenario must be EXACT here (remote only: tools/remote-acr/run.sh with EXTRA_DIRS=evidence/aura-slam).
 * SLAMG1_SCENARIOS=id,id limits the run.
 */
interface RefScenario {
  id: string;
  setup: { difficulty: string; venue: string };
  script: { inputs?: Array<{ step: number; code: string; down: boolean }> };
  reference: { steps: number; finalMode: string; score: Record<string, number>; eventCount: number; timeline: unknown[]; digest: string };
  events: unknown[];
  sampled: { columns: string[]; rows: Array<Array<number | string | null>> };
}
const REFERENCE = JSON.parse(readFileSync(path.resolve("evidence/aura-slam/reference.json"), "utf8")) as { tolerance: { sampledAbsTolerance: number }; scenarios: RefScenario[] };
const ONLY = (process.env.SLAMG1_SCENARIOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const HARNESS = `
import { bootAuraSlam } from "/examples/aura-slam/shell/boot.ts";
import { createMatchEngine } from "/examples/aura-slam/sim/create.ts";
import { physics } from "/examples/aura-slam/sim/physics.ts";
import { strokes } from "/examples/aura-slam/sim/strokes.ts";
import { createInputMapper } from "/examples/aura-slam/input/mapper.ts";
const w = window;
w.__slamEvents = []; w.__slamStep = 0; w.__slamRenders = 0;
const rnd = (n) => (typeof n === "number" ? +n.toFixed(4) : n);
const renderer = {
  async mount() {}, render() { w.__slamRenders++; }, setVenue() {}, project: () => ({ x: 0, y: 0, visible: true }),
  projectCourt: (x, y) => ({ x: 640 + x * 400, y: 400 + y * 250, visible: true }), resize() {}, dispose() {}, debug: () => ({ type: "replay-stub" })
};
await bootAuraSlam({
  createEngine: (options) => {
    let ref = null;
    ref = createMatchEngine({ ...options, onEvent: (e) => {
      w.__slamEvents.push({ step: w.__slamStep, t: ref ? ref.state.time : null, type: e.type, side: e.side ?? null, shot: e.shot ?? null, won: e.won ?? null,
        args: Array.isArray(e.args) ? e.args.map(rnd) : null,
        contact: e.contact ? { x: +e.contact.x.toFixed(4), y: +e.contact.y.toFixed(4), speedKph: e.contact.speedKph ?? null, vz: e.contact.verticalSpeed != null ? +e.contact.verticalSpeed.toFixed(4) : null, venue: e.contact.venue ?? null, stroke: e.contact.stroke ?? null } : null });
      options?.onEvent?.(e);
    } });
    return ref;
  },
  renderer, input: createInputMapper({ storage: w.localStorage }), audio: { unlock() {}, setEnabled() {}, handle() {} }, physics, strokes, swipeEnabled: false
});
`;

type Win = Window & { __TOP_TENNIS_CONTROL__: { getState(): any; getEngine(): any; startOffline(settings?: { difficulty: string; venue: string }): void }; advanceTime(ms: number): void; __slamEvents: any[]; __slamStep: number; __slamRenders: number };

async function open(page: Page, origin: string, errors: string[]): Promise<void> {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route("**/examples/aura-slam/main.ts", (route) => route.fulfill({ contentType: "text/javascript", body: HARNESS }));
  await page.goto(`${origin}/examples/aura-slam/?menu=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.auraSlamReady === "true", undefined, { timeout: 240_000 });
  await page.bringToFront();
}

test.describe("aura-slam replay through the native shell (gate G1)", () => {
  test.describe.configure({ mode: "parallel" });
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const sc of REFERENCE.scenarios.filter((s) => ONLY.length === 0 || ONLY.includes(s.id))) {
    test(`${sc.id}: digest, steps, rows, events and score timeline equal the baseline`, async ({ page }) => {
      await page.setViewportSize({ width: 640, height: 360 });
      const errors: string[] = [];
      await open(page, server.origin, errors);
      const leadIn = Math.round((sc.sampled.rows[0]![1] as number) * 60) - 1;
      const result = await page.evaluate(({ sc, leadIn, tolerance }) => {
        const w = window as unknown as Win;
        const ctl = w.__TOP_TENNIS_CONTROL__;
        const FIX = 1000 / 60;
        const autoplay = sc.id.startsWith("auto-");
        const auto = document.getElementById("aura-btn-auto") as HTMLElement | null;
        if (auto && auto.classList.contains("active") !== autoplay) auto.click();
        w.__slamEvents.length = 0; w.__slamStep = 0;
        const renders0 = w.__slamRenders;
        ctl.startOffline({ difficulty: sc.difficulty, venue: sc.venue });
        const st = () => ctl.getState();
        const s0 = st();
        const autoOn = !!document.getElementById("aura-btn-auto")?.classList.contains("active");
        if (s0.venue !== sc.venue || s0.difficulty !== sc.difficulty || s0.mode !== "playing" || autoOn !== autoplay) return { configMismatch: { venue: s0.venue, difficulty: s0.difficulty, mode: s0.mode, autoOn } };
        // ticks the live page ran between the match reset and its first captured snapshot (step 1 of the baseline sits at (leadIn + 1) / 60 s)
        const engine = ctl.getEngine();
        for (let i = 0; i < leadIn; i++) engine.step(1 / 60);

        const r = (v: number) => Math.round(v * 1e6) / 1e6;
        const snap = () => {
          const s = st(), b = s.ball, p = s.player, a = s.ai;
          return [r(s.time), s.mode, s.phase, s.server, s.serveNumber, s.score.playerPoints, s.score.aiPoints, s.score.playerGames, s.score.aiGames, s.rallyHits, s.tiebreak ? 1 : 0,
            r(b.x), r(b.y), r(b.z), r(b.vx), r(b.vy), r(b.vz), b.active ? 1 : 0, b.bounceCount, b.lastHit, r(b.speedKph ?? 0),
            r(p.x), r(p.y), r(p.vx), r(p.vy), r(p.swing), p.stroke, r(p.moveBlend), r(p.stride),
            r(a.x), r(a.y), r(a.vx), r(a.vy), r(a.swing), a.stroke, r(a.moveBlend), r(a.stride), s.message || "", r(s.energy ?? 0)];
        };
        let h1 = 0x811c9dc5 | 0, h2 = 0x01000193 | 0;
        const feed = (str: string) => { for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ (c + 31), 2246822519 | 0); } };
        const wantRows = new Map<number, Array<number | string | null>>();
        for (const row of sc.rows) wantRows.set(row[0] as number, row.slice(1));
        const byStep = new Map<number, Array<{ code: string; down: boolean }>>();
        for (const input of sc.inputs) byStep.set(input.step, [...(byStep.get(input.step) ?? []), input]);
        const held = new Set<string>();
        const key = (code: string, down: boolean) => {
          if (down === held.has(code)) return; if (down) held.add(code); else held.delete(code);
          document.body.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code, bubbles: true, cancelable: true }));
        };
        const timeline: unknown[] = [];
        let rowDivergence: unknown = null; let prevGames = 0, prevPoints = 0; let rowsChecked = 0;
        feed(JSON.stringify(snap()));
        const t0 = performance.now();
        let step = 0;
        for (step = 1; step <= sc.maxSteps; step++) {
          w.__slamStep = step;
          for (const input of byStep.get(step) ?? []) key(input.code, input.down);
          w.advanceTime(FIX);
          const row = snap(); feed(JSON.stringify(row));
          const s = st();
          const want = wantRows.get(step);
          if (want) {
            rowsChecked++;
            if (!rowDivergence) for (let j = 0; j < row.length; j++) {
              const x = row[j], y = want[j];
              const bad = typeof x === "number" && typeof y === "number" ? Math.abs(x - y) > tolerance + 1e-9 : x !== y;
              if (bad) { rowDivergence = { step, column: sc.columns[j + 1], got: x, want: y }; break; }
            }
          }
          const games = s.score.playerGames + s.score.aiGames, pts = s.score.playerPoints + s.score.aiPoints;
          if (games !== prevGames || pts !== prevPoints) timeline.push({ step, t: r(s.time), pg: s.score.playerGames, ag: s.score.aiGames, pp: s.score.playerPoints, ap: s.score.aiPoints, phase: s.phase, winner: s.pointWinner ?? null, tb: s.tiebreak });
          prevGames = games; prevPoints = pts;
          if (s.mode === "gameover") { step++; break; }
        }
        const steps = step - 1;
        const s = st();
        const events = w.__slamEvents.slice();
        let eventDivergence: unknown = null;
        const n = Math.max(events.length, sc.events.length);
        for (let i = 0; i < n; i++) if (JSON.stringify(events[i]) !== JSON.stringify(sc.events[i])) { eventDivergence = { index: i, got: events[i] ?? null, want: sc.events[i] ?? null }; break; }
        return {
          steps, finalMode: s.mode, score: { pg: s.score.playerGames, ag: s.score.aiGames, pp: s.score.playerPoints, ap: s.score.aiPoints },
          digest: `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`,
          rowsChecked, rowDivergence, eventCount: events.length, eventDivergence, timelineJson: JSON.stringify(timeline),
          renders: w.__slamRenders - renders0, msPerStep: (performance.now() - t0) / Math.max(1, steps), focus: document.hasFocus()
        };
      }, { sc: { id: sc.id, difficulty: sc.setup.difficulty, venue: sc.setup.venue, inputs: sc.script.inputs ?? [], maxSteps: sc.reference.steps, rows: sc.sampled.rows, columns: sc.sampled.columns, events: sc.events }, leadIn, tolerance: REFERENCE.tolerance.sampledAbsTolerance });

      expect((result as { configMismatch?: unknown }).configMismatch, "scenario config applied through the shell").toBeUndefined();
      const run = result as Exclude<typeof result, { configMismatch: unknown }>;
      console.log(`SLAMG1 ${JSON.stringify({ scenario: sc.id, steps: run.steps, of: sc.reference.steps, digest: run.digest, want: sc.reference.digest, rowsChecked: run.rowsChecked, rowDivergence: run.rowDivergence, eventCount: run.eventCount, wantEvents: sc.reference.eventCount, eventDivergence: run.eventDivergence, renders: run.renders, msPerStep: +run.msPerStep.toFixed(4), focus: run.focus })}`);
      expect(run.focus, "the document has focus, so the shell accepts key events").toBe(true);
      expect(run.rowDivergence, "first diverging sampled row").toBeNull();
      expect(run.eventDivergence, "first diverging event").toBeNull();
      expect(run.steps).toBe(sc.reference.steps);
      expect(run.finalMode).toBe(sc.reference.finalMode);
      expect(run.score).toEqual(sc.reference.score);
      expect(JSON.parse(run.timelineJson)).toEqual(sc.reference.timeline);
      expect(run.digest, "exact per-step digest").toBe(sc.reference.digest);
      expect(errors, "no console errors").toEqual([]);
    });
  }
});
