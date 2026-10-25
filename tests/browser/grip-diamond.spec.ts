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
  return { k: e.bat.knobToHand, sock: e.bat.socketed, stage: e.bat.socketStage, t: e.swing ? e.swing.t : null, dur: e.swing ? e.swing.dur : null, ph: e.swing ? e.swing.phase : null, knob: e.bat.knobWorld, palm: e.swing ? e.swing.palmWorld : null, bones: e.bat.bones, sj: e.bat.solverJoints, sa: e.bat.solverActor, fit: e.bat.sockFit };
})()`;

test("diamond bat grip sequence", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.setViewportSize({ width: 640, height: 360 });
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

  // Deterministic: freeze the swing clock at exact t via the QA hold, wait for a stable reading, then measure and capture.
  const targets = [0.42, 0.476, 0.7, 1.0];
  for (const target of targets) {
    await page.evaluate((t) => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.holdSwingAt?.(t), target);
    let prev = "";
    let stable = 0;
    const t1 = Date.now();
    let s: Record<string, unknown> | null = null;
    while (Date.now() - t1 < 150_000 && stable < 2) {
      s = (await page.evaluate(READ)) as Record<string, unknown> | null;
      const key = s ? JSON.stringify([s.t, s.k, s.knob, s.palm]) : "";
      if (s && Math.abs(Number(s.t) - target) < 0.02 && key === prev) stable += 1; else stable = 0;
      prev = key;
      await page.waitForTimeout(700);
    }
    process.stdout.write(`@@GRIP ${JSON.stringify({ hold: target, stable, ...(s ?? {}) })}\n`);
    emit(`02-hold-${String(Math.round(target * 1000)).padStart(4, "0")}`, await page.screenshot({ type: "jpeg", quality: 90 }));
  }
  await page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.holdSwingAt?.(null));
  process.stdout.write(`@@GRIP ${JSON.stringify({ done: true, errors })}\n`);
});
