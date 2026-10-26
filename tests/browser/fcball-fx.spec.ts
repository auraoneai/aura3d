import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Aura FC 3D ball, camera shake and particle verification (software WebGL2, remote only: tools/remote-acr/run.sh,
 * RUN_ID prefix fcball, EXTRA_DIRS=apps/showcase-aura-fc-3d, PUBLIC_ASSETS = the fc* assets and the game SFX).
 * Frames and numbers print as FCBALL_* lines in the run log (acr-run.log is the only artifact channel).
 *   1. a kick filmstrip: swing, strike and the ball's first second (positions/heights printed per frame)
 *   2. a shot, a driven pass and a ground pass launched deterministically, ball trace summarised
 *   3. fx/shake probe: goal, tackle, pass, shot fired one after another; particles alive and camera trauma sampled
 *      once per rendered frame of app time; asserts nothing lingers and the trauma peak stays under the cap
 *   4. goal burst filmstrip at the goal mouth
 */
const HOOK = "__AURA_AURA_FC_3D__";
test.setTimeout(3_000_000);

type Hooks = {
  ready(): boolean; state(): any; freezeAtKick(frac: number, focus?: boolean): void; resume(): void; step(n: number): void;
  frame(w?: number, h?: number, q?: number): string;
  fireJuice(ev: string, at?: [number, number, number]): void; freeze(on: boolean): void;
    advance(steps: number, dt?: number): Array<{ live: number; trauma: number }>;
};

async function frames(page: import("@playwright/test").Page, n: number) {
  await page.evaluate((count) => new Promise<void>((r) => { let i = 0; const tick = () => (++i >= count ? r() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
}

test("aura fc 3d: ball, shake and particles", async ({ page }) => {
  const dev = await startExampleDevServer();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 240)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 240)); });
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto(`${dev.origin}/apps/showcase-aura-fc-3d/index.html?autoplay=1`, { waitUntil: "load", timeout: 180_000 });
  await page.waitForFunction((h) => (window as any)[h]?.ready?.() === true, HOOK, { timeout: 420_000 });
  const call = <T,>(fn: (h: Hooks) => T | Promise<T>) => page.evaluate(`(${fn.toString()})(window.${HOOK})`) as Promise<T>;
  const jpg = async (name: string) => { const url = await call((h) => h.frame(640, 360, 0.84)); console.log(`FCBALL_${name}_JPG ${url}`); };

  // ---- 1. kick filmstrip ----
  await call((h) => h.freezeAtKick(0, false));
  await page.waitForFunction((h) => (window as any)[h].state().frozen === true, HOOK, { timeout: 300_000 });
  const kickTrace: Array<{ i: number; ballY: number; ballSpeed: number; mode: string }> = [];
  for (let i = 0; i < 10; i++) {
    await frames(page, 2);
    const st = await call((h) => h.state());
    const b = st.ball;
    kickTrace.push({ i, ballY: +b.y.toFixed(2), ballSpeed: +Math.hypot(b.vx, b.vz).toFixed(2), mode: b.mode });
    await jpg(`KICK_${String(i).padStart(2, "0")}`);
    await call((h) => h.step(6));
  }
  console.log(`FCBALL_KICK_TRACE ${JSON.stringify(kickTrace)}`);
  await call((h) => h.resume());

  // ---- 2. fx / shake probe on app time: sim frozen, the app stepped in fixed 1/30 s steps so every event is sampled ----
  await call((h) => h.freeze(true));
  const ballPos = await call((h) => h.state().ball);
  const STEP = 1 / 30;
  const series: Array<{ t: number; live: number; trauma: number }> = [];
  let tNow = 0;
  const run = async (seconds: number) => {
    const out = (await page.evaluate(`window.${HOOK}.advance(${Math.round(seconds / STEP)}, ${STEP})`)) as Array<{ live: number; trauma: number }>;
    for (const o of out) { tNow += STEP; series.push({ t: +tNow.toFixed(3), live: o.live, trauma: o.trauma }); }
  };
  const fire = (ev: string, y: number) => page.evaluate(`window.${HOOK}.fireJuice(${JSON.stringify(ev)}, [${ballPos.x}, ${y}, ${ballPos.z}])`);
  await run(0.2);
  await fire("kick", 0.5); await run(0.4);
  await fire("shot", 0.5); await run(0.4);
  await fire("tackle", 0.1); await run(0.4);
  await fire("goal", 0.5);
  const marks = [0.1, 0.4, 0.8, 1.5, 2.5];
  let prev = 0;
  for (const mark of marks) {
    await run(mark - prev); prev = mark;
    await jpg(`GOAL_${String(Math.round(mark * 100)).padStart(3, "0")}`);
  }
  await run(5.5 - prev);
  const at = (t: number) => series.find((p) => p.t >= t) ?? series.at(-1)!;
  const peakTrauma = Math.max(...series.map((p) => p.trauma));
  const lastTrauma = series.filter((p) => p.trauma > 0.02).at(-1)?.t ?? 0;
  const goalAt = tNow - 5.5;
  const summary = { steps: series.length, peakLive: Math.max(...series.map((p) => p.live)), liveAfterGoal3s: at(goalAt + 3).live, liveAtEnd: series.at(-1)!.live, peakTrauma, traumaSettledAtS: +(lastTrauma - goalAt).toFixed(2) };
  console.log(`FCBALL_FX ${JSON.stringify(summary)}`);
  console.log(`FCBALL_FX_SERIES ${JSON.stringify(series.filter((_, i) => i % 3 === 0))}`);

  console.log(`FCBALL_ERRORS ${JSON.stringify(errors)}`);
  expect(errors).toEqual([]);
  expect(peakTrauma).toBeLessThanOrEqual(0.7 + 1e-6);
  expect(summary.traumaSettledAtS).toBeLessThan(0.6);
  expect(summary.liveAtEnd).toBeLessThanOrEqual(0);
});
