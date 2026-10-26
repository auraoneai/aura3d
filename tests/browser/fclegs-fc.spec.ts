import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

/**
 * Aura FC 3D rework: kick and run-cycle filmstrips from the real game (software WebGL2, remote only:
 * tools/remote-acr/run.sh, RUN_ID prefix rwfc, EXTRA_DIRS=apps/showcase-aura-fc-3d, PUBLIC_ASSETS = the fc* assets).
 * The QA hook freezes the sim at a chosen kick fraction and frames the kicker from the kicking side, then steps the
 * frozen sim two fixed steps at a time, so every frame is an exact swing fraction (not a lucky screenshot).
 * Frames print as LABEL data: URLs in the log (acr-run.log is the only artifact channel).
 */
const [LABEL, MODE = "full"] = readFileSync(path.resolve("tests/browser/fclegs-fc.label"), "utf8").trim().split(/\s+/);
const STEP = 3; // the literal 3 in the h.step(3) calls below: evaluated functions cannot see this constant
const HOOK = "__AURA_AURA_FC_3D__";
test.setTimeout(3_000_000);

type Hooks = { ready(): boolean; state(): any; freezeAtKick(frac: number, focus?: boolean): void; resume(): void; focusFastest(): void; step(n: number): void; frame(w?: number, h?: number, q?: number): Promise<string> };

async function twoFrames(page: import("@playwright/test").Page) {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

test(`aura fc 3d ${LABEL}: kick and run filmstrips`, async ({ page }) => {
  const dev = await startExampleDevServer();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 240)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 240)); });
  await page.setViewportSize({ width: 900, height: 506 });
  await page.goto(`${dev.origin}/apps/showcase-aura-fc-3d/index.html?autoplay=1`, { waitUntil: "load", timeout: 180_000 });
  await page.waitForFunction((h) => (window as any)[h]?.ready?.() === true, HOOK, { timeout: 420_000 });
  const call = <T,>(fn: (h: Hooks) => T | Promise<T>) => page.evaluate(`(${fn.toString()})(window.${HOOK})`) as Promise<T>;

  const out: Record<string, unknown> = { label: LABEL, kicks: [] as unknown[], run: [] as unknown[] };
  const dir = path.resolve(`evidence/aura-fc-3d/legs-fix/raw/${LABEL}`);
  mkdirSync(dir, { recursive: true });

  // ---- kick filmstrip: one complete swing, frozen, stepped 2 sim steps at a time from the first frame of the swing ----
  // A swing that a tackle or steal cancels is logged with the reason and retried on the next kick.
  const kickFrames: Array<Record<string, unknown>> = [];
  const attempts: unknown[] = [];
  for (let attempt = 0; attempt < (MODE === "runonly" ? 0 : 8); attempt++) {
    kickFrames.length = 0;
    await call((h) => h.freezeAtKick(0, true));
    await page.waitForFunction((h) => (window as any)[h].state().frozen === true, HOOK, { timeout: 300_000 });
    let canceled = "";
    for (let i = 0; i < 10; i++) {
      const t0 = Date.now();
      await twoFrames(page);
      const st = await call((h) => h.state());
      const k = st.players.find((p: any) => p.id === st.kickerId);
      const frac = k && k.kickDur > 0 ? Math.max(0, 1 - k.kickT / k.kickDur) : 1;
      if (i > 0 && i < 6 && frac >= 1 && st.ball.mode !== "flight") { canceled = `swing ended at step ${STEP * i}: stunT=${k?.stunT} slideT=${k?.slideT} pend=${k?.pend} owner=${st.ball.owner} mode=${st.ball.mode}`; break; }
      const url = await call((h) => h.frame(900, 506, 0.88));
      writeFileSync(path.join(dir, `kick-${String(i).padStart(2, "0")}.jpg`), Buffer.from(url.split(",")[1]!, "base64"));
      kickFrames.push({ i, attempt, frac: +frac.toFixed(3), clip: k?.clip, phase: +(k?.phase ?? 0).toFixed(3), kickerSpeed: +(k?.speed ?? 0).toFixed(2), pend: k?.pend, stunT: +(k?.stunT ?? 0).toFixed(2), ball: { x: +st.ball.x.toFixed(2), z: +st.ball.z.toFixed(2), y: +st.ball.y.toFixed(2), speed: +Math.hypot(st.ball.vx, st.ball.vz).toFixed(2), mode: st.ball.mode } });
      console.log(`FCLEGS_${LABEL.toUpperCase()}_KICK_${i} ${JSON.stringify(kickFrames.at(-1))}`);
      console.log(`FCLEGS_${LABEL.toUpperCase()}_KICK_${i}_JPG ${url}`);
      console.log(`FCLEGS_${LABEL.toUpperCase()}_TIMING kick ${i} ${Date.now() - t0} ms`);
      await call((h) => h.step(3));
    }
    attempts.push({ attempt, frames: kickFrames.length, canceled: canceled || null, lastFrac: kickFrames.at(-1)?.frac ?? null });
    console.log(`FCLEGS_${LABEL.toUpperCase()}_ATTEMPT ${JSON.stringify(attempts.at(-1))}`);
    if (!canceled) break;
    await call((h) => h.resume());
  }
  out.kicks = kickFrames;
  out.attempts = attempts;
  await call((h) => h.resume());

  // ---- run-cycle filmstrip: the fastest athlete, frozen, stepped 2 sim steps at a time ----
  await page.waitForTimeout(8_000);
  for (let tries = 0; tries < 40; tries++) {           // wait for somebody to be running before freezing on the fastest athlete
    const st = await call((h) => h.state());
    if (Math.max(...st.players.map((p: any) => p.speed)) >= 4) break;
    await page.waitForTimeout(1500);
  }
  await call((h) => h.focusFastest());
  const runFrames: unknown[] = [];
  for (let i = 0; i < 12; i++) {
    const t0 = Date.now();
    await twoFrames(page);
    const st = await call((h) => h.state());
    const r = st.players.find((p: any) => p.id === st.kickerId);
    const url = await call((h) => h.frame(900, 506, 0.88));
    writeFileSync(path.join(dir, `run-${String(i).padStart(2, "0")}.jpg`), Buffer.from(url.split(",")[1]!, "base64"));
    runFrames.push({ i, id: r?.id, speed: +(r?.speed ?? 0).toFixed(2), clip: r?.clip, phase: +(r?.phase ?? 0).toFixed(3) });
    console.log(`FCLEGS_${LABEL.toUpperCase()}_RUN_${i} ${JSON.stringify(runFrames.at(-1))}`);
    console.log(`FCLEGS_${LABEL.toUpperCase()}_RUN_${i}_JPG ${url}`);
    console.log(`FCLEGS_${LABEL.toUpperCase()}_TIMING run ${i} ${Date.now() - t0} ms`);
    await call((h) => h.step(3));
  }
  out.run = runFrames;
  out.errors = errors;
  writeFileSync(path.join(dir, "metrics.json"), JSON.stringify(out, null, 2));
  console.log(`FCLEGS_${LABEL.toUpperCase()}_DONE ${JSON.stringify({ kickFrames: kickFrames.length, runFrames: runFrames.length, errors })}`);
  await dev.close();
  if (MODE !== "runonly") expect(kickFrames.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
