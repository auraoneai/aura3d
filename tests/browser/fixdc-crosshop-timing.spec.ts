import path from "node:path";
import { test } from "@playwright/test";
import { serve } from "./shotsd-lib";

/**
 * Cross Hop load timing, before and after the vehicle texture downscale, on the same runner (software WebGL2).
 * Prints `@@FDX {json}`: seconds from navigation to the ready flag and to the Nth rendered game frame, and the median
 * seconds per frame between frames 10 and 60. Each build is measured in a fresh page, alternating order across rounds.
 */
test.setTimeout(3_300_000);

async function measure(browser: import("@playwright/test").Browser, origin: string, label: string, round: number): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  const t0 = Date.now();
  const marks: Record<string, number> = {};
  const frameAt: Array<[number, number]> = [];
  await page.goto(`${origin}/apps/showcase-cross-hop/?autostart=1`, { waitUntil: "commit", timeout: 240_000 });
  while (Date.now() - t0 < 420_000) {
    const s = await page.evaluate(() => ({
      ready: document.body?.dataset?.aura3dReady === "true",
      frame: Number(((window as unknown as Record<string, { frame?: number }>).__AURA3D_CROSS_HOP__ ?? {}).frame ?? 0),
      canvas: Boolean(document.querySelector("canvas"))
    })).catch(() => ({ ready: false, frame: 0, canvas: false }));
    const t = (Date.now() - t0) / 1000;
    if (s.canvas && marks.canvas === undefined) marks.canvas = t;
    if (s.ready && marks.ready === undefined) marks.ready = t;
    for (const n of [1, 10, 30, 60]) if (s.frame >= n && marks[`f${n}`] === undefined) marks[`f${n}`] = t;
    frameAt.push([t, s.frame]);
    if (s.frame >= 60) break;
    await page.waitForTimeout(500);
  }
  const a = frameAt.find(([, f]) => f >= 10), b = frameAt.find(([, f]) => f >= 60) ?? frameAt[frameAt.length - 1]!;
  const perFrame = a && b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : null;
  const mem = await page.evaluate(() => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return m ? Math.round(m.usedJSHeapSize / 1e6) : null;
  }).catch(() => null);
  process.stdout.write(`@@FDX ${JSON.stringify({ label, round, marks, secondsPerFrame: perFrame && Number(perFrame.toFixed(3)), frames: b[1], jsHeapMB: mem, errors: errors.slice(0, 3) })}\n`);
  await ctx.close();
}

test("cross hop load timing", async ({ browser }) => {
  const before = await serve(path.resolve("tests/browser/cross-before-dist"));
  const after = await serve(path.resolve("tests/browser/shotsd-dist"));
  for (const round of [1, 2]) {
    const order = round === 1 ? [["before", before], ["after", after]] as const : [["after", after], ["before", before]] as const;
    for (const [label, srv] of order) await measure(browser, srv.origin, label, round);
  }
  await before.close();
  await after.close();
});
