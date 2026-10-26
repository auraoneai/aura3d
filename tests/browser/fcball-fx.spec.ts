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
  launchBall(x: number, z: number, speed: number, deg: number, heading: number, spin?: number): void;
  probeStart(): void; probeStop(): Array<{ t: number; live: number; trauma: number }>; probeSeries(): Array<{ t: number; live: number; trauma: number }>;
};

async function frames(page: import("@playwright/test").Page, n: number) {
  await page.evaluate((count) => new Promise<void>((r) => { let i = 0; const tick = () => (++i >= count ? r() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
}

test("aura fc 3d: ball, shake and particles", async ({ page }) => {
  const dev = await startExampleDevServer();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 240)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 240)); });
  await page.setViewportSize({ width: 900, height: 506 });
  await page.goto(`${dev.origin}/apps/showcase-aura-fc-3d/index.html?autoplay=1`, { waitUntil: "load", timeout: 180_000 });
  await page.waitForFunction((h) => (window as any)[h]?.ready?.() === true, HOOK, { timeout: 420_000 });
  const call = <T,>(fn: (h: Hooks) => T | Promise<T>) => page.evaluate(`(${fn.toString()})(window.${HOOK})`) as Promise<T>;
  const jpg = async (name: string) => { const url = await call((h) => h.frame(900, 506, 0.86)); console.log(`FCBALL_${name}_JPG ${url}`); };

  // ---- 1. kick filmstrip ----
  await call((h) => h.freezeAtKick(0, false));
  await page.waitForFunction((h) => (window as any)[h].state().frozen === true, HOOK, { timeout: 300_000 });
  const kickTrace: Array<{ i: number; ballY: number; ballSpeed: number; mode: string }> = [];
  for (let i = 0; i < 12; i++) {
    await frames(page, 2);
    const st = await call((h) => h.state());
    const b = st.ball;
    kickTrace.push({ i, ballY: +b.y.toFixed(2), ballSpeed: +Math.hypot(b.vx, b.vz).toFixed(2), mode: b.mode });
    await jpg(`KICK_${String(i).padStart(2, "0")}`);
    await call((h) => h.step(6));
  }
  console.log(`FCBALL_KICK_TRACE ${JSON.stringify(kickTrace)}`);
  await call((h) => h.resume());

  // ---- 2. deterministic launches: ground pass, driven pass, lofted shot ----
  const launches: Record<string, unknown> = {};
  for (const [name, speed, deg] of [["ground", 11, 3], ["driven", 17, 3], ["shot", 22, 11]] as const) {
    await call((h) => h.freeze(true));
    const series: Array<{ t: number; x: number; y: number; v: number }> = [];
    const js = `window.${HOOK}.launchBall(-12, -2, ${speed}, ${deg}, 0, 0)`;
    await page.evaluate(js);
    await page.evaluate(`window.${HOOK}.step(1)`);
    for (let k = 0; k < 120; k++) {
      const st = await call((h) => h.state());
      series.push({ t: k * 3 / 60, x: +st.ball.x.toFixed(2), y: +st.ball.y.toFixed(2), v: +Math.hypot(st.ball.vx, st.ball.vz).toFixed(2) });
      await call((h) => h.step(3));
    }
    const apex = Math.max(...series.map((p) => p.y));
    const restAt = series.find((p, idx) => idx > 5 && p.v < 0.2);
    launches[name] = { speed, deg, apexM: +apex.toFixed(2), reachedXm: series.at(-1)!.x, restAtS: restAt?.t ?? null };
    await call((h) => h.resume());
  }
  console.log(`FCBALL_LAUNCHES ${JSON.stringify(launches)}`);

  // ---- 3. fx / shake probe ----
  await call((h) => h.resume());
  await call((h) => h.probeStart());
  const events: Array<[string, number]> = [["kick", 0], ["shot", 0.4], ["tackle", 0.8], ["goal", 1.2]];
  const ballPos = await call((h) => h.state().ball);
  let tNow = 0;
  for (const [ev, at] of events) {
    while (tNow < at) { await frames(page, 1); const s = await call((h) => h.probeSeries()); tNow = s.at(-1)?.t ?? tNow; }
    await page.evaluate(`window.${HOOK}.fireJuice(${JSON.stringify(ev)}, [${ballPos.x}, ${ev === "tackle" ? 0.1 : 0.5}, ${ballPos.z}])`);
  }
  while (tNow < 5) { await frames(page, 3); const s = await call((h) => h.probeSeries()); tNow = s.at(-1)?.t ?? tNow; }
  const series = await call((h) => h.probeStop());
  const at = (t: number) => series.find((p) => p.t >= t) ?? series.at(-1)!;
  const peakTrauma = Math.max(...series.map((p) => p.trauma));
  const lastTrauma = series.filter((p) => p.trauma > 0.02).at(-1)?.t ?? 0;
  const summary = { frames: series.length, peakLive: Math.max(...series.map((p) => p.live)), live2_5s: at(2.5).live, live4s: at(4).live, peakTrauma, traumaSettledAtS: lastTrauma };
  console.log(`FCBALL_FX ${JSON.stringify(summary)}`);
  console.log(`FCBALL_FX_SERIES ${JSON.stringify(series.filter((_, i) => i % 3 === 0))}`);

  // ---- 4. goal burst filmstrip ----
  await call((h) => h.probeStart());
  await page.evaluate(`window.${HOOK}.fireJuice("goal", [29.2, 1.0, 0])`);
  let tt = 0;
  const marks = [0.15, 0.4, 0.8, 1.2, 2.0, 3.0];
  let mi = 0;
  while (mi < marks.length) {
    await frames(page, 1);
    const s = await call((h) => h.probeSeries());
    tt = s.at(-1)?.t ?? tt;
    if (tt >= marks[mi]!) { await jpg(`GOAL_${String(Math.round(marks[mi]! * 100)).padStart(3, "0")}`); mi++; }
  }
  await call((h) => h.probeStop());

  console.log(`FCBALL_ERRORS ${JSON.stringify(errors)}`);
  expect(errors).toEqual([]);
  expect(peakTrauma).toBeLessThanOrEqual(0.7 + 1e-6);
  expect(lastTrauma).toBeLessThan(2.0);
  expect(summary.live4s).toBe(0);
});
