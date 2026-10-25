import path from "node:path";
import { test } from "@playwright/test";
import { serve } from "./shotsd-lib";

/**
 * Iron Crown stage scan (remote, software WebGL2): loads the route once, switches through every venue and emits one
 * 1280x720 JPEG per stage as `@@SD iron-crown 1280 stage-<id> idx n base64` (decode with tools/shots/decode-shotsd.mjs).
 */
const STAGES = ["neo-tokyo-rooftop", "bangkok-dock", "colosseum-ruins", "desert-airbase", "himalayan-monastery", "crown-arena"];
test.setTimeout(3_000_000);

function emit(state: string, buf: Buffer): void {
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i += 1) process.stdout.write(`@@SD iron-crown 1280 ${state} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
}

test("iron crown stage scan", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/shotsd-dist"));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`${origin}/apps/showcase-iron-crown/`, { waitUntil: "load", timeout: 240_000 });
  await page.waitForFunction(() => Boolean(document.querySelector("canvas")), undefined, { timeout: 240_000 });
  await page.waitForTimeout(15_000);
  for (const id of STAGES) {
    await page.evaluate((stage) => (document.querySelector(`[data-stage="${stage}"]`) as HTMLElement | null)?.click(), id);
    await page.waitForTimeout(25_000);
    let shot = await page.screenshot({ type: "jpeg", quality: 82, timeout: 120_000 }).catch(() => Buffer.alloc(0));
    for (let tries = 0; tries < 6 && shot.length < 20_000; tries += 1) {
      await page.waitForTimeout(8_000);
      shot = await page.screenshot({ type: "jpeg", quality: 82, timeout: 120_000 }).catch(() => Buffer.alloc(0));
    }
    emit(`stage-${id}`, shot);
  }
  process.stdout.write(`@@SDMETA iron-crown 1280 ${JSON.stringify({ errors: errors.slice(0, 3) })}\n`);
  await ctx.close();
  await close();
});
