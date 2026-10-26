import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Aura Hoops 3D dribble, measured where the owner looks: the default game camera, Quick Play, the human-controlled handler
 * (manual keys, no autopilot), at 60 Hz fixed steps (?diag=1&qaDt=0.0167&qaStep=1: one sim step per probe call, so frames
 * are consecutive). Every frame projects the drawn palms and the ball through the live camera to screen pixels, draws markers
 * on the page (red = right palm, orange = left palm, green = ball centre, white = hips), and measures the screen-space
 * palm-to-ball distance in ball diameters at the meet and at the floor contact. Prints the report and the marked frames.
 */
const BASE_URL = process.env.HOOPS_URL ?? "";
const VW = Number(process.env.HOOPS_VW ?? 480);
const VH = Number(process.env.HOOPS_VH ?? 300);
const STAND_STEPS = 30;
const RUN_STEPS = 30;
const CAPTURE_EVERY = 2;

let server: ExampleDevServer | undefined;
test.setTimeout(3_000_000);
test.beforeAll(async () => { if (!BASE_URL) server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

interface Rec { i: number; phase: string; f: number; st: string; ph: string; t: number | null; mv: boolean | null; ball: number[]; palm: number[] | null; palmL: number[] | null; hips: number[] | null; footL?: number[] | null; drawnBall?: number[] | null; bounds?: any; simxz?: number[] | null; cam: { eye: number[]; target: number[]; fov: number } | null; hd: string | null; px?: Record<string, number[] | null>; diam?: number }

test("hoops dribble in screen space (default camera, human handler)", async ({ page }) => {
  await page.setViewportSize({ width: VW, height: VH });
  const origin = BASE_URL || server!.origin;
  const path = BASE_URL ? "" : "/apps/showcase-aura-hoops-3d/index.html";
  const step = BASE_URL ? "" : "&qaStep=1";
  await page.goto(`${origin}${path}?diag=1&qaDt=0.0167${step}`, { waitUntil: "load", timeout: 240_000 });
  await page.waitForFunction(() => (window as unknown as { __AURA3D_GAME__?: { ready?: boolean } }).__AURA3D_GAME__?.ready === true, undefined, { timeout: 300_000 });
  await page.addStyleTag({ content: "body * { visibility: hidden !important } canvas { visibility: visible !important } .qa-dot { visibility: visible !important; position: fixed; width: 9px; height: 9px; margin: -5px 0 0 -5px; border-radius: 50%; z-index: 99999; pointer-events: none; border: 1px solid #fff }" });
  const project = (cam: Rec["cam"], p: number[] | null, w: number, h: number): number[] | null => {
    if (!cam || !p) return null;
    const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    const norm = (a: number[]) => { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l]; };
    const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
    const f = norm(sub(cam.target, cam.eye));
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    const d = sub(p, cam.eye);
    const z = dot(d, f);
    if (z <= 0.01) return null;
    const th = Math.tan((cam.fov * Math.PI) / 360);
    const nx = dot(d, r) / (z * th * (w / h));
    const ny = dot(d, u) / (z * th);
    return [((nx + 1) / 2) * w, ((1 - ny) / 2) * h, z];
  };
  const recs: Rec[] = [];
  const frames: Array<{ tag: string; b64: string }> = [];
  const advance = async (phase: string, i: number, capture: boolean) => {
    if (i % 10 === 0) console.log(`HOOPSSCREEN_PROGRESS ${phase} ${i} frames=${frames.length}`);
    if (!BASE_URL) {
      await page.evaluate(() => (window as unknown as { __qaStep: (n?: number) => void }).__qaStep(1));
    }
    // let the step run and the frame render (palms are read from the bones of the frame just drawn)
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const s = await page.evaluate(() => {
      const b = (window as unknown as { __AURA3D_GAME__?: Record<string, any> }).__AURA3D_GAME__!;
      const h = b.holder ? (b.handProbe ?? {})[b.holder] : null;
      const c = document.querySelector("canvas");
      return { f: b.framesRendered, st: b.ball?.state, ph: b.phase, t: b.dribbleCycle?.t ?? null, mv: b.dribbleCycle?.moving ?? null, ball: b.ball?.position, palm: h?.palm ?? null, palmL: h?.palmL ?? null, hips: h?.hips ?? null, footL: h?.footL ?? null, bounds: h?.bounds ?? null, simxz: h?.sim ?? null, cam: b.camera ?? null, drawnBall: b.drawn?.ballCenter ?? null, hd: b.holder ?? null, w: c?.clientWidth ?? 0, h: c?.clientHeight ?? 0 };
    });
    const rec: Rec = { i, phase, f: s.f, st: s.st, ph: s.ph, t: s.t, mv: s.mv, ball: s.ball, palm: s.palm, palmL: s.palmL, hips: s.hips, footL: s.footL, drawnBall: s.drawnBall, bounds: s.bounds, simxz: s.simxz, cam: s.cam, hd: s.hd };
    const px = {
      palm: project(s.cam, s.palm, s.w, s.h),
      palmL: project(s.cam, s.palmL, s.w, s.h),
      ball: project(s.cam, s.ball, s.w, s.h),
      hips: project(s.cam, s.hips, s.w, s.h),
      foot: project(s.cam, s.footL, s.w, s.h),
      ring: s.simxz ? project(s.cam, [s.simxz[0], 0.02, s.simxz[1]], s.w, s.h) : null
    };
    rec.px = px;
    if (px.ball && s.cam) {
      const ballTop = project(s.cam, [s.ball[0], s.ball[1] + 0.13, s.ball[2]], s.w, s.h);
      rec.diam = ballTop ? Math.abs(ballTop[1] - px.ball[1]) * 2 : undefined;
    }
    recs.push(rec);
    if (capture) {
      await page.evaluate((marks) => {
        document.querySelectorAll(".qa-dot").forEach((e) => e.remove());
        const add = (p: number[] | null | undefined, color: string) => {
          if (!p) return;
          const d = document.createElement("div");
          d.className = "qa-dot";
          d.style.background = color;
          d.style.left = `${p[0]}px`;
          d.style.top = `${p[1]}px`;
          document.body.appendChild(d);
        };
        add(marks.palm, "#ff2020"); add(marks.palmL, "#ff9a00"); add(marks.ball, "#20ff40"); add(marks.hips, "#ffffff"); add(marks.foot, "#00c8ff"); add(marks.ring, "#ff00ff");
      }, px);
      const buf = await page.screenshot({ type: "jpeg", quality: 85, clip: { x: Math.round(VW * 0.12), y: Math.round(VH * 0.1), width: Math.round(VW * 0.76), height: Math.round(VH * 0.8) } });
      frames.push({ tag: `${phase}-${String(i).padStart(3, "0")}-t${(s.t ?? -1).toFixed(2)}`, b64: buf.toString("base64") });
    }
  };
  // Quick Play starts live with the ball in the human handler's hand: stand, then hold W.
  for (let i = 0; i < 12; i += 1) await advance("settle", i, false);
  for (let i = 0; i < STAND_STEPS; i += 1) await advance("stand", i, i % CAPTURE_EVERY === 0);
  await page.keyboard.down("KeyW");
  for (let i = 0; i < 24; i += 1) await advance("accel", i, false);
  for (let i = 0; i < RUN_STEPS; i += 1) await advance("run", i, i % CAPTURE_EVERY === 0);
  await page.keyboard.up("KeyW");

  const report: Record<string, unknown> = {};
  for (const phase of ["stand", "run"]) {
    const g = recs.filter((r) => r.phase === phase && r.st === "held" && r.ph === "live" && r.px?.palm && r.px?.ball && r.diam && r.t != null);
    const meet = g.filter((r) => (r.t as number) < 0.05 || (r.t as number) >= 0.93);
    const floor = g.filter((r) => r.ball[1] <= 0.2);
    const dist = (r: Rec) => Math.hypot(r.px!.palm![0]! - r.px!.ball![0]!, r.px!.palm![1]! - r.px!.ball![1]!) / r.diam!;
    const m = (xs: number[]) => (xs.length ? Number(Math.max(...xs).toFixed(2)) : null);
    report[phase] = { n: g.length, meetN: meet.length, floorN: floor.length, meetDiamMax: m(meet.map(dist)), floorDiamMax: m(floor.map(dist)), allDiamMax: m(g.map(dist)), floorPalmWorldHeight: m(floor.map((r) => r.palm![1]! )) };
  }
  const withBounds = recs.filter((r) => r.bounds && r.drawnBall && r.st === "held");
  const feetErr = withBounds.length ? Math.max(...withBounds.map((r) => Math.abs(r.bounds.min[1]))) : null;
  const ballErr = withBounds.length ? Math.max(...withBounds.map((r) => Math.hypot(r.drawnBall![0]! - r.ball[0]!, r.drawnBall![1]! - Math.max(0.13, r.ball[1]!), r.drawnBall![2]! - r.ball[2]!))) : null;
  report.drawn = { n: withBounds.length, holderFeetAboveFloorMax: feetErr == null ? null : Number(feetErr.toFixed(3)), drawnBallVsSimBallMax: ballErr == null ? null : Number(ballErr.toFixed(3)) };
  console.log(`HOOPSSCREEN_REPORT ${JSON.stringify(report)}`);
  const first = recs.find((r) => r.bounds);
  console.log(`HOOPSSCREEN_BOUNDS holder=${first?.hd} bounds=${JSON.stringify(first?.bounds)} sim=${JSON.stringify(first?.simxz)} hips=${JSON.stringify(first?.hips)} footL=${JSON.stringify(first?.footL)}`);
  console.log(`HOOPSSCREEN_RECS ${JSON.stringify(recs.filter((r) => r.px?.palm).map((r) => [r.phase, r.i, r.t == null ? null : Number(r.t.toFixed(2)), r.ball.map((v) => Number(v.toFixed(2))), r.palm?.map((v) => Number(v.toFixed(2))), r.px!.palm!.slice(0, 2).map(Math.round), r.px!.ball!.slice(0, 2).map(Math.round), r.diam ? Math.round(r.diam) : null])).slice(0, 400)}`.slice(0, 60000));
  for (const fr of frames) console.log(`HOOPSSCREEN_FRAME ${fr.tag} ${fr.b64}`);
  console.log("HOOPSSCREEN_DONE");
  expect(frames.length).toBeGreaterThan(8);
});
