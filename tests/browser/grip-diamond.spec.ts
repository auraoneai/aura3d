import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Diamond bat grip through the swing (remote, software WebGL2). Triggers practice
 * swings, samples the game's `bat.knobToHand` (knob of the engine-placed bat vs the
 * solved right palm of the same frame) and swing time, and grabs frames at
 * stance and at swing times 0/120/240/360/480/700 ms. Lines are printed as
 * `@@GRIP` (JSON samples) and `@@FRAME` (base64 jpeg chunks).
 */
let server: ExampleDevServer;
test.setTimeout(2_400_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

const CHUNK = 30_000;
function emit(name: string, buf: Buffer): void {
  const dir = path.resolve("tests/reports/grip");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.jpg`), buf);
  const b64 = buf.toString("base64");
  const total = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < total; i += 1) process.stdout.write(`@@FRAME grip/${name} ${i + 1}/${total} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}\n`);
}

const READ = `(() => {
  const w = window;
  const raw = w.__AURA3D_GAME_EVIDENCE__ ?? w.__AURA3D_GAME__;
  const e = typeof raw === "function" ? raw() : raw;
  if (!e || !e.bat) return null;
  return { k: e.bat.knobToHand, sock: e.bat.socketed, stage: e.bat.socketStage, t: e.swing ? e.swing.t : null, dur: e.swing ? e.swing.dur : null, ph: e.swing ? e.swing.phase : null, knob: e.bat.knobWorld, palm: e.swing ? e.swing.palmWorld : null, bones: e.bat.bones, sj: e.bat.solverJoints };
})()`;

test("diamond bat grip sequence", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto(`${server.origin}/apps/showcase-aura-diamond-3d/index.html?mode=quick`, { waitUntil: "load", timeout: 300_000 });
  await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).__AURA3D_GAME_DIAMOND__), undefined, { timeout: 600_000 });
  // Wait for the bat socket calibration to finish.
  const t0 = Date.now();
  for (;;) {
    const s = (await page.evaluate(READ)) as { sock?: boolean; stage?: string } | null;
    if (s?.sock) break;
    if (Date.now() - t0 > 600_000) { process.stdout.write(`@@GRIP {"error":"socket never attached","stage":${JSON.stringify(s?.stage ?? null)}}\n`); break; }
    await page.waitForTimeout(1_000);
  }
  await page.waitForTimeout(3_000);
  emit("00-stance", await page.screenshot({ type: "jpeg", quality: 85 }));
  const stance = await page.evaluate(READ);
  process.stdout.write(`@@GRIP ${JSON.stringify({ label: "stance", ...(stance as object) })}\n`);

  const targetsMs = [0, 120, 240, 360, 480, 700];
  for (let swing = 0; swing < 2; swing += 1) {
    await page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.triggerSwing?.(0.84));
    let next = 0;
    let lastT = -1;
    const start = Date.now();
    let seenActive = false;
    while (Date.now() - start < 240_000) {
      const s = (await page.evaluate(READ)) as { t: number | null; dur: number | null; ph: string | null; k: number | null } | null;
      if (s && s.t !== null && s.t !== lastT) {
        lastT = s.t;
        process.stdout.write(`@@GRIP ${JSON.stringify({ swing, ...s })}\n`);
        if (s.ph && s.ph !== "stance") seenActive = true;
        const ms = (s.t ?? 0) * (s.dur ?? 0) * 1000;
        while (swing === 0 && next < targetsMs.length && ms >= targetsMs[next]!) {
          emit(`01-swing-${String(targetsMs[next]).padStart(3, "0")}ms`, await page.screenshot({ type: "jpeg", quality: 85 }));
          next += 1;
        }
      }
      if (seenActive && s && s.ph === "stance") break;
      await page.waitForTimeout(40);
    }
    if (swing === 0 && next < targetsMs.length) emit(`01-swing-end`, await page.screenshot({ type: "jpeg", quality: 85 }));
    await page.waitForTimeout(4_000);
  }
  process.stdout.write(`@@GRIP ${JSON.stringify({ done: true, errors })}\n`);
});
