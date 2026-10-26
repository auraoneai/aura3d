import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { measureHandBall } from "../../packages/game/src/motion/handBounce";

/**
 * Aura Hoops 3D dribble probe (remote only, software WebGL2). Per rendered frame it records the sim ball against the palm as
 * drawn (beacon `handProbe`, ?diag=1&qaDt=0.0167 for a fixed sim step), then holds the standing and the running handler to the
 * hand-bounce criteria with the library `measureHandBall`: ball under the hand at the floor contact, ball touching the palm at
 * the meet, hand following the ball down, ball never far from the hand. MODE "player" drives the controlled handler (stand, then
 * hold W to run); MODE "ai" serves to the away team and watches the AI handlers. It prints the report and a filmstrip of
 * base64 JPEG frames (one per cycle phase bin) from the game's own chase camera.
 */
const MODE: "player" | "ai" | "aistand" = "player";
const EXTRA_QS = "";
const PROBE_MS = Number(process.env.HOOPSDRIB_PROBE_MS ?? (MODE === "ai" ? 420_000 : 240_000));
const SHOT_MS = Number(process.env.HOOPSDRIB_SHOT_MS ?? (MODE === "ai" ? 300_000 : 600_000));
const FRAMES = Number(process.env.HOOPSDRIB_FRAMES ?? 44);
const TAG = MODE;

let server: ExampleDevServer;
test.setTimeout(PROBE_MS + SHOT_MS + 600_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

test(`hoops dribble probe (${MODE})`, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error ${m.text()}`.slice(0, 300)); });
  await page.setViewportSize({ width: 320, height: 180 });
  const serve = MODE === "ai" ? "&qaServe=away" : MODE === "aistand" ? "&qaServe=away&qaStand=1" : "";
  await page.goto(`${server.origin}/apps/showcase-aura-hoops-3d/index.html?autostart=1&autoplay=1&diag=1&qaDt=0.0167&qaCam=front${serve}${EXTRA_QS}`, { waitUntil: "load", timeout: 180_000 });
  await page.waitForFunction(() => (window as unknown as { __AURA3D_GAME__?: { ready?: boolean } }).__AURA3D_GAME__?.ready === true, undefined, { timeout: 240_000 });
  const install = () => page.evaluate(() => {
    const w = window as unknown as { __rec: unknown[]; __lastF: number; __tick?: boolean };
    if (w.__tick) return;
    w.__tick = true; w.__rec = []; w.__lastF = -1;
    const tick = () => {
      const b = (window as unknown as { __AURA3D_GAME__?: Record<string, any> }).__AURA3D_GAME__;
      if (b && b.framesRendered !== w.__lastF) {
        w.__lastF = b.framesRendered;
        const h = b.holder ? (b.handProbe ?? {})[b.holder] : null;
        w.__rec.push({ f: b.framesRendered, ph: b.phase, bs: b.ball?.state, bp: b.ball?.position, hd: b.holder, t: b.dribbleCycle?.t ?? null, mv: b.dribbleCycle?.moving ?? null, palm: h?.palm ?? null, yaw: h?.yaw ?? null, sim: h?.sim ?? null });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await install();

  if (MODE === "player") {
    await page.waitForTimeout(Math.round(PROBE_MS * 0.5));
    await page.keyboard.down("KeyW"); // drive toward the rim: the running handler
    await page.waitForTimeout(Math.round(PROBE_MS * 0.5));
    await page.keyboard.up("KeyW");
  } else {
    await page.waitForTimeout(PROBE_MS);
  }
  const rec = (await page.evaluate(() => (window as unknown as { __rec: any[] }).__rec.slice())) as Array<any>;

  await page.setViewportSize({ width: 720, height: 405 });
  await page.addStyleTag({ content: "body * { visibility: hidden !important } canvas { visibility: visible !important }" });
  const frames: Array<{ tag: string; f: number; b64: string }> = [];
  const t0 = Date.now();
  let lastF = -1;
  let driving = false;
  const seen = new Set<string>();
  while (Date.now() - t0 < SHOT_MS) {
    await page.waitForTimeout(40);
    if (MODE === "player" && !driving && Date.now() - t0 > SHOT_MS * 0.4) { driving = true; await page.keyboard.down("KeyW"); }
    if (frames.length >= FRAMES) continue;
    const s = await page.evaluate(() => {
      const b = (window as unknown as { __AURA3D_GAME__?: Record<string, any> }).__AURA3D_GAME__;
      return b ? { y: b.ball?.position?.[1] as number, st: b.ball?.state as string, ph: b.phase as string, f: b.framesRendered as number, t: b.dribbleCycle?.t as number, mv: b.dribbleCycle?.moving as boolean, hd: b.holder as string } : null;
    });
    if (!s || s.st !== "held" || s.ph !== "live" || s.f === lastF || s.t == null) continue;
    const kind = s.mv ? "run" : "stand";
    const key = `${kind}-${s.hd?.[0]}-${Math.floor(s.t * 16)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lastF = s.f;
    const buf = await page.screenshot({ type: "jpeg", quality: 72, clip: { x: 150, y: 50, width: 420, height: 320 } });
    frames.push({ tag: `${kind}-${s.hd}-t${s.t.toFixed(2)}-y${s.y.toFixed(2)}`, f: s.f, b64: buf.toString("base64") });
  }

  // Held, live frames; the first frames of a new holder are skipped (the cycle restarts at the meet).
  let prevHolder = "";
  let sinceNew = 0;
  // Also skipped: the 3 frames after the pose switches between standing and running (the rig changes pose in one frame).
  let prevMv: unknown = null;
  let sinceSwitch = 99;
  const held = rec.filter((r) => {
    sinceNew = r.hd === prevHolder ? sinceNew + 1 : 0;
    prevHolder = r.hd;
    sinceSwitch = r.mv === prevMv ? sinceSwitch + 1 : 0;
    prevMv = r.mv;
    return r.bs === "held" && r.ph === "live" && r.palm && r.bp && r.t != null && sinceNew >= 4 && sinceSwitch >= 3;
  });
  const failures: string[] = [];
  const kinds: Array<[string, (r: any) => boolean]> = MODE === "player"
    ? [["player", () => true]]
    : [[MODE, () => true]];
  for (const [kindName, keep] of kinds) {
    for (const moving of [false, true]) {
      const g = held.filter((r) => keep(r) && Boolean(r.mv) === moving);
      const report = measureHandBall(g.map((r) => ({ phase: r.t as number, moving, palm: r.palm, ball: r.bp })), { floorWindow: 0.07 });
      console.log(`HOOPSDRIB_MEASURE ${JSON.stringify({ who: kindName, moving, n: g.length, ...report })}`);
      if (g.length >= 8) {
        for (const f of report.failures.filter((x) => !/misses the floor/.test(x))) failures.push(`${kindName} ${f}`);
      }
    }
  }
  const holders = Array.from(new Set(held.map((r) => r.hd)));
  console.log(`HOOPSDRIB_HOLDERS ${JSON.stringify(holders)} frames=${frames.length} errors=${JSON.stringify(errors.slice(0, 5))}`);
  const cyc = held.slice(0, 260).map((r) => [r.f, r.hd, Number(r.t.toFixed(2)), r.mv ? 1 : 0, r.bp[1], r.palm[1], Number(Math.hypot(r.bp[0] - r.palm[0], r.bp[2] - r.palm[2]).toFixed(2))]);
  console.log(`HOOPSDRIB_CYCLE ${JSON.stringify(cyc)}`);
  for (const fr of frames) console.log(`HOOPSDRIB_FRAME ${TAG} ${fr.tag} ${fr.f} ${fr.b64}`);
  const foot = await page.evaluate(() => (window as unknown as { __AURA3D_GAME__?: Record<string, any> }).__AURA3D_GAME__?.footSlide ?? null);
  console.log(`HOOPSDRIB_FOOT ${JSON.stringify(foot)}`.slice(0, 3000));
  console.log(`HOOPSDRIB_DONE ${TAG}`);
  expect(failures).toEqual([]);
});
