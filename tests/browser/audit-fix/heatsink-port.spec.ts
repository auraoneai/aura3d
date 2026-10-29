import { test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane G19 (Ion Circuit, `heatsink-port`): LIGHT-01 / HP-04 environment calibration capture. Remote only
 * (tools/remote-acr/run.sh); the ACR run has no artifact egress, so output goes to the log:
 *   HP_META <json>                          per shot: luma stats of the canvas read-back, engine diagnostics
 *   HP_GRID <arm> <step> <w>x<h> <b64>      luma averaged over 4x4 pixel blocks, one byte per block (offline region masks)
 *   HP_JPG  <arm> <step> <i>/<n> <b64>      the canvas JPEG itself, chunked
 * The frames are deterministic: `?manual=1` stops the rAF render loop, and each shot replays the original's recorded
 * input script (`tests/browser/data/heatsink-reference-replay.json`) to a fixed step, rendering the last LEAD steps so
 * the chase camera settles, then reads the canvas in the same task (`replayTo(step, lead, true)`). Shots at later
 * steps are the steady-state ones; the first step only checks that the arm booted.
 * Arms (HP_ARMS, comma list) are URL values of `?hpIbl=`; "none" loads the page without it. Builds without the
 * calibration hook ignore the parameter, so "none" is the only meaningful arm on them.
 */
const ARMS = (process.env.HP_ARMS ?? "none").split(",").map((s) => s.trim()).filter(Boolean);
const STEPS = (process.env.HP_STEPS ?? "450,1200,2250").split(",").map(Number);
const LEAD = Number(process.env.HP_LEAD ?? 8);
const CHUNK = 16000;
const LAB = "/examples/heatsink-port/";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };

test.describe("g19 heatsink-port environment calibration", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const arm of ARMS) {
    test(`hp-arm-${arm}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`HP_ERR ${arm} pageerror ${e.message.slice(0, 300)}`));
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`HP_CONSOLE ${arm} ${m.type()} ${m.text().slice(0, 240)}`); });
      page.on("response", (r) => { if (r.status() >= 400) log(`HP_HTTP ${arm} ${r.status()} ${r.url().replace(server.origin, "").slice(0, 200)}`); });
      await page.setViewportSize({ width: 960, height: 540 });
      const query = arm === "none" ? "?manual=1" : `?manual=1&hpIbl=${encodeURIComponent(arm)}`;
      await page.goto(`${server.origin}${LAB}${query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const w = window as unknown as { __AURA_HEATSINK__?: { ready(): boolean }; __AURA_HEATSINK_ERROR__?: string };
        return w.__AURA_HEATSINK__?.ready() === true || Boolean(w.__AURA_HEATSINK_ERROR__);
      }, undefined, { timeout: 600_000, polling: 1000 });
      const bootError = await page.evaluate(() => (window as unknown as { __AURA_HEATSINK_ERROR__?: string }).__AURA_HEATSINK_ERROR__ ?? null);
      if (bootError) { log(`HP_ERR ${arm} boot ${bootError.slice(0, 300)}`); return; }

      const ref = JSON.parse(readFileSync("tests/browser/data/heatsink-reference-replay.json", "utf8")) as { script: { text: string } };
      await page.evaluate(`window.__AURA_HEATSINK__.replayStart(${JSON.stringify(ref.script.text)})`);
      for (const step of STEPS) {
        const started = Date.now();
        const st = await page.evaluate(`window.__AURA_HEATSINK__.replayTo(${step}, ${LEAD}, true)`) as { state: string; step: number; player: Record<string, number>; shot: { w: number; h: number; url: string } | null };
        if (!st.shot) { log(`HP_ERR ${arm} ${step} no-shot`); continue; }
        const analysed = await page.evaluate(async (url: string) => {
          const img = new Image();
          img.src = url;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
          const B = 4;
          const gw = Math.floor(width / B), gh = Math.floor(height / B);
          const grid = new Uint8Array(gw * gh);
          const acc = new Float64Array(gw * gh);
          const hist = new Uint32Array(256);
          let sum = 0;
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
              sum += l; hist[Math.round(l)]!++;
              const gx = Math.floor(x / B), gy = Math.floor(y / B);
              if (gx < gw && gy < gh) acc[gy * gw + gx]! += l;
            }
          }
          for (let k = 0; k < grid.length; k++) grid[k] = Math.round(acc[k]! / (B * B));
          const n = width * height;
          const pct = (p: number) => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]!; if (a >= p * n) return v; } return 255; };
          let bin = "";
          for (let k = 0; k < grid.length; k++) bin += String.fromCharCode(grid[k]!);
          return { w: width, h: height, gw, gh, grid: btoa(bin), mean: +(sum / n).toFixed(2), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95) };
        }, st.shot.url);
        const info = await page.evaluate(() => {
          const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
          const dg = reg?.all()[0]?.diagnostics?.();
          return dg ? {
            renderPath: dg.renderPath?.path ?? null, bloomFusion: dg.renderPath?.bloomFusion ?? null, drawCalls: dg.drawCalls ?? null,
            warnings: (dg.warnings ?? []).map(String).filter((w: string) => /environment|hemisphere|ibl|fill|light/i.test(w)).slice(0, 6)
          } : null;
        });
        const { grid, ...stats } = analysed;
        log(`HP_META ${JSON.stringify({ arm, step, state: st.state, simStep: st.step, playerS: st.player.s, ms: Date.now() - started, ...stats, info })}`);
        log(`HP_GRID ${arm} ${step} ${analysed.gw}x${analysed.gh} ${grid}`);
        const b64 = st.shot.url.replace(/^data:image\/jpeg;base64,/, "");
        const parts = Math.ceil(b64.length / CHUNK);
        for (let i = 0; i < parts; i++) log(`HP_JPG ${arm} ${step} ${i + 1}/${parts} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
      }
      log(`HP_DONE ${arm}`);
    });
  }
});
