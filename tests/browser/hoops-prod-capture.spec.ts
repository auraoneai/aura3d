import { test } from "@playwright/test";

/**
 * Capture the live Aura Hoops page the way the owner plays it (remote runner, software WebGL2, no local server): Quick Play,
 * the human-controlled player dribbling (standing, then WASD held to run), the default game camera. ?diag=1 only adds the beacon
 * probes; ?qaDt=0.0167 gives the 60 Hz step a real GPU would, so a slow software run still integrates like one.
 * Prints consecutive frames (cropped around the handler, full resolution) as base64 JPEGs plus the per-frame beacon samples.
 */
const BASE = process.env.HOOPS_URL ?? "https://aura3d.auraone.ai/apps/showcase-aura-hoops-3d/";
const DPR = Number(process.env.HOOPS_DPR ?? 1);
const FRAMES_PER_PHASE = Number(process.env.HOOPS_FRAMES ?? 18);
const VW = Number(process.env.HOOPS_VW ?? 960);
const VH = Number(process.env.HOOPS_VH ?? 600);
const QUERY = process.env.HOOPS_QUERY ?? "?diag=1&qaDt=0.0167";

test.setTimeout(3_000_000);
test.use({ deviceScaleFactor: DPR });

test(`hoops production capture dpr${DPR}`, async ({ page }) => {
  await page.setViewportSize({ width: VW, height: VH });
  await page.goto(`${BASE}${QUERY}`, { waitUntil: "load", timeout: 240_000 });
  await page.waitForFunction(() => (window as unknown as { __AURA3D_GAME__?: { ready?: boolean } }).__AURA3D_GAME__?.ready === true, undefined, { timeout: 300_000 });
  const version = await page.evaluate(() => (document.body.textContent ?? "").match(/\b4\.\d+\.\d+\b/)?.[0] ?? "?");
  console.log(`HOOPSPROD_PAGE ${BASE} version-text=${version} dpr=${DPR}`);
  await page.addStyleTag({ content: "body * { visibility: hidden !important } canvas { visibility: visible !important }" });
  const vw = VW;
  const vh = VH;
  const clip = { x: Math.round(vw * 0.18), y: Math.round(vh * 0.12), width: Math.round(vw * 0.64), height: Math.round(vh * 0.76) };
  const samples: unknown[] = [];
  const snap = async (phase: string, idx: number) => {
    const s = await page.evaluate(() => {
      const b = (window as unknown as { __AURA3D_GAME__?: Record<string, any> }).__AURA3D_GAME__!;
      const h = b.holder ? (b.handProbe ?? {})[b.holder] : null;
      return { f: b.framesRendered, st: b.ball?.state, ph: b.phase, bp: b.ball?.position, hd: b.holder, t: b.dribbleCycle?.t, mv: b.dribbleCycle?.moving, palm: h?.palm ?? null, pose: b.dribblePose, clip: b.holderClip, speed: b.holderSpeed, cam: b.cameraMode };
    });
    const buf = await page.screenshot({ type: "jpeg", quality: 82, clip });
    samples.push({ phase, idx, ...s });
    console.log(`HOOPSPROD_FRAME ${phase} ${idx} ${s.f} t=${Number(s.t ?? -1).toFixed(2)} ball=${JSON.stringify(s.bp)} palm=${JSON.stringify(s.palm)} ${buf.toString("base64")}`);
  };
  // Quick Play starts live with the ball in the human handler's hand. Let the game settle, then film the standing dribble.
  await page.waitForTimeout(8000);
  let last = -1;
  for (let i = 0; i < FRAMES_PER_PHASE; i += 1) {
    for (let k = 0; k < 400; k += 1) {
      const f = await page.evaluate(() => (window as unknown as { __AURA3D_GAME__?: { framesRendered?: number } }).__AURA3D_GAME__?.framesRendered ?? 0);
      if (f !== last) { last = f; break; }
      await page.waitForTimeout(20);
    }
    await snap("stand", i);
  }
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(6000);
  for (let i = 0; i < FRAMES_PER_PHASE; i += 1) {
    for (let k = 0; k < 400; k += 1) {
      const f = await page.evaluate(() => (window as unknown as { __AURA3D_GAME__?: { framesRendered?: number } }).__AURA3D_GAME__?.framesRendered ?? 0);
      if (f !== last) { last = f; break; }
      await page.waitForTimeout(20);
    }
    await snap("run", i);
  }
  await page.keyboard.up("KeyW");
  console.log(`HOOPSPROD_SAMPLES ${JSON.stringify(samples).slice(0, 12000)}`);
  console.log("HOOPSPROD_DONE");
});
