import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { measureHandBall } from "../../packages/game/src/motion/handBounce";

/**
 * Aura Hoops 3D dribble probe (remote only, software WebGL2). Records, per rendered frame, the sim ball against the
 * rendered right palm and hips of the ball holder (beacon `handProbe`, ?diag=1), then prints distance statistics and a
 * filmstrip of base64 JPEG frames. Env: HOOPSDRIB_MS (run length), HOOPSDRIB_TAG (label), HOOPSDRIB_FRAMES (frame count).
 */
const PROBE_MS = Number(process.env.HOOPSDRIB_PROBE_MS ?? 200_000);
const SHOT_MS = Number(process.env.HOOPSDRIB_SHOT_MS ?? 420_000);
const RUN_MS = PROBE_MS + SHOT_MS;
const EXTRA_QS = "";
const TAG = process.env.HOOPSDRIB_TAG ?? "run";
const FRAMES = Number(process.env.HOOPSDRIB_FRAMES ?? 30);

let server: ExampleDevServer;
test.setTimeout(RUN_MS + 600_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

test("hoops dribble probe", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error ${m.text()}`.slice(0, 300)); });
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto(`${server.origin}/apps/showcase-aura-hoops-3d/index.html?autostart=1&autoplay=1&diag=1&qaDt=0.0167${EXTRA_QS}`, { waitUntil: "load", timeout: 180_000 });
  await page.waitForFunction(() => (window as unknown as { __AURA3D_GAME__?: { ready?: boolean } }).__AURA3D_GAME__?.ready === true, undefined, { timeout: 240_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __rec: unknown[]; __lastF: number };
    w.__rec = []; w.__lastF = -1;
    const tick = () => {
      const b = (window as unknown as { __AURA3D_GAME__?: Record<string, any> }).__AURA3D_GAME__;
      if (b && b.framesRendered !== w.__lastF) {
        w.__lastF = b.framesRendered;
        const hp = b.handProbe ?? {};
        const h = b.holder ? hp[b.holder] : null;
        w.__rec.push({ f: b.framesRendered, ph: b.phase, bs: b.ball?.state, bp: b.ball?.position, hd: b.holder, t: b.dribbleCycle?.t ?? null, mv: b.dribbleCycle?.moving ?? null, palm: h?.palm ?? null, hips: h?.hips ?? null, sh: h?.shoulder ?? null, yaw: h?.yaw ?? null, sim: h?.sim ?? null, pose: b.dribblePose, target: b.dribbleHand ? [b.dribbleHand.x, b.dribbleHand.y, b.dribbleHand.z] : null,
          others: Object.entries(hp).filter(([k]) => k !== b.holder).map(([k, v]: [string, any]) => ({ k, sim: v.sim, hips: v.hips })) });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await page.waitForTimeout(Math.round(PROBE_MS * 0.55));
  await page.keyboard.down("KeyW"); // drive toward the rim: the moving handler's overlay dribble
  await page.waitForTimeout(Math.round(PROBE_MS * 0.45));
  await page.keyboard.up("KeyW");
  const probeRec = (await page.evaluate(() => (window as unknown as { __rec: any[] }).__rec.slice())) as Array<any>;
  await page.setViewportSize({ width: 720, height: 405 });
  await page.addStyleTag({ content: "body * { visibility: hidden !important } canvas { visibility: visible !important }" });
  const frames: Array<{ tag: string; f: number; t: number; b64: string }> = [];
  const t0 = Date.now();
  let lastF = -1;
  const seen = new Set<string>();
  let driving = false;
  while (Date.now() - t0 < SHOT_MS) {
    await page.waitForTimeout(40);
    if (!driving && Date.now() - t0 > SHOT_MS * 0.12) { driving = true; await page.keyboard.down("KeyW"); }
    if (frames.length >= FRAMES) continue;
    const s = await page.evaluate(() => {
      const b = (window as unknown as { __AURA3D_GAME__?: Record<string, any> }).__AURA3D_GAME__;
      return b ? { y: b.ball?.position?.[1] as number, st: b.ball?.state as string, ph: b.phase as string, f: b.framesRendered as number, t: b.dribbleCycle?.t as number, mv: b.dribbleCycle?.moving as boolean } : null;
    });
    if (!s || s.st !== "held" || s.ph !== "live" || s.f === lastF || s.t == null) continue;
    // One frame per phase bin (top, push, release, floor, rise, catch) for the standing and the moving handler.
    const bin = Math.floor(s.t * 10);
    const key = `${s.mv ? "run" : "stand"}-${bin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lastF = s.f;
    const buf = await page.screenshot({ type: "jpeg", quality: 70 });
    frames.push({ tag: `${s.mv ? "run" : "stand"}-t${s.t.toFixed(2)}-y${s.y.toFixed(2)}`, f: s.f, t: s.t, b64: buf.toString("base64") });
  }

  const rec = probeRec;
  rec.forEach((r, i) => { r.steady = i >= 10 && rec.slice(i - 10, i + 1).every((x) => x.mv === true && x.bs === "held"); });
  const held = rec.filter((r) => r.bs === "held" && r.ph === "live" && r.palm && r.bp);
  const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
  const horiz = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
  const tops = held.filter((r) => r.t != null && (r.t < 0.04 || r.t >= 0.93));
  const floors = held.filter((r) => r.bp[1] < 0.2);
  const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Number(s[Math.min(s.length - 1, Math.floor(s.length * p))]!.toFixed(3)) : null; };
  const palmBall = held.map((r) => dist(r.bp, r.palm));
  const palmBallH = held.map((r) => horiz(r.bp, r.palm));
  const simVsHips = rec.filter((r) => r.hips && r.sim).map((r) => horiz([r.sim[0], 0, r.sim[1]], r.hips));
  const targetVsPalm = held.filter((r) => r.target).map((r) => dist(r.target, r.palm));
  const summary = {
    tag: TAG, samples: rec.length, held: held.length,
    palmBallAll: { p50: q(palmBall, 0.5), p95: q(palmBall, 0.95), max: q(palmBall, 1) },
    palmBallHorizontal: { p50: q(palmBallH, 0.5), p95: q(palmBallH, 0.95), max: q(palmBallH, 1) },
    atTop: { n: tops.length, p50: q(tops.map((r) => dist(r.bp, r.palm)), 0.5), max: q(tops.map((r) => dist(r.bp, r.palm)), 1) },
    atFloor: { n: floors.length, ballYmin: q(floors.map((r) => r.bp[1]), 0), ballYmax: q(floors.map((r) => r.bp[1]), 1), palmHeightP50: q(floors.map((r) => r.palm[1]), 0.5), palmToBallP50: q(floors.map((r) => dist(r.bp, r.palm)), 0.5) },
    simVsRenderedHipsHorizontal: { p50: q(simVsHips, 0.5), max: q(simVsHips, 1) },
    targetVsRenderedPalm: { p50: q(targetVsPalm, 0.5), p95: q(targetVsPalm, 0.95), max: q(targetVsPalm, 1) },
    errors: errors.slice(0, 8)
  };
  console.log(`HOOPSDRIB_SUMMARY ${JSON.stringify(summary)}`);
  const failures: string[] = [];
  for (const moving of [false, true]) {
    const g = held.filter((r) => Boolean(r.mv) === moving && (!moving || r.steady));
    const gt = g.filter((r) => r.t != null && (r.t < 0.04 || r.t >= 0.93));
    const gf = g.filter((r) => r.bp[1] < 0.2);
    const mg = gt.length ? Math.max(...gt.map((r) => dist(r.bp, r.palm))) : 0;
    const fg = gf.length ? Math.max(...gf.map((r) => dist(r.bp, r.palm))) : 0;
    if (mg > 0.13) failures.push(`meet gap ${moving ? "moving" : "standing"} ${mg.toFixed(3)} > 0.13`);
    if (fg > 0.6) failures.push(`floor palm-to-ball ${moving ? "moving" : "standing"} ${fg.toFixed(3)} > 0.6`);
    console.log(`HOOPSDRIB_GROUP ${JSON.stringify({ moving, n: g.length, topN: gt.length, topGapMax: q(gt.map((r) => dist(r.bp, r.palm)), 1), floorN: gf.length, floorBallY: q(gf.map((r) => r.bp[1]), 0.5), floorPalmY: q(gf.map((r) => r.palm[1]), 0.5), floorPalmToBall: q(gf.map((r) => dist(r.bp, r.palm)), 1), maxPalmToBall: q(g.map((r) => dist(r.bp, r.palm)), 1) })}`);
  }
  // The library probe over the same samples (render-rate sampling: the floor tolerance is looser than the dense unit test).
  for (const moving of [false, true]) {
    const g = held.filter((r) => Boolean(r.mv) === moving && (!moving || r.steady) && r.t != null);
    const report = measureHandBall(g.map((r) => ({ phase: r.t as number, palm: r.palm, ball: r.bp })), { limits: { meet: 0.13, floorContact: 0.6, floorError: 0.05 } });
    console.log(`HOOPSDRIB_MEASURE ${JSON.stringify({ moving, ...report })}`);
    // floor error is informational here: render-rate samples rarely land on the exact floor frame (the dense unit test owns it)
    if (g.length > 10) for (const f of report.failures.filter((x) => !/misses the floor/.test(x))) failures.push(`measureHandBall ${moving ? "moving" : "standing"}: ${f}`);
  }
  const worst = held.map((r) => ({ f: r.f, d: Number(dist(r.bp, r.palm).toFixed(2)), ball: r.bp, palm: r.palm, hips: r.hips, t: r.t, mv: r.mv })).sort((a, b) => b.d - a.d).slice(0, 6);
  console.log(`HOOPSDRIB_WORST ${JSON.stringify(worst)}`);
  const cyc = held.slice(0, 200).map((r) => [r.f, r.t == null ? null : Number(r.t.toFixed(2)), r.mv ? 1 : 0, r.bp[1], r.palm[1], Number(horiz(r.bp, r.palm).toFixed(2)), r.sh ? r.sh[1] : null, r.sh && r.hips ? Number(Math.hypot(r.sh[0] - r.hips[0], r.sh[2] - r.hips[2]).toFixed(2)) : null, r.sh && r.hips ? Number((r.sh[1] - r.hips[1]).toFixed(2)) : null, r.yaw == null ? null : Number(((r.bp[0] - r.palm[0]) * Math.sin(r.yaw) + (r.bp[2] - r.palm[2]) * Math.cos(r.yaw)).toFixed(2)), r.steady ? 1 : 0]);
  console.log(`HOOPSDRIB_CYCLE ${JSON.stringify(cyc)}`);
  for (const fr of frames) console.log(`HOOPSDRIB_FRAME ${TAG} ${fr.tag} ${fr.f} ${fr.b64}`);
  const foot = await page.evaluate(() => {
    const b = (window as unknown as { __AURA3D_GAME__?: Record<string, any> }).__AURA3D_GAME__;
    return b?.footSlide ?? null;
  });
  console.log(`HOOPSDRIB_FOOT ${JSON.stringify(foot)}`.slice(0, 4000));
  console.log(`HOOPSDRIB_DONE ${TAG}`);
  expect(failures).toEqual([]);
});
