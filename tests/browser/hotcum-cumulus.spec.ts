import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Hotfix regression: Cumulus Dash on a display above 1x device scale. The port sizes the canvas by hand after the app
 * mounts (resize: false), and the renderer used to keep drawing at the mount size, so the picture filled only part of
 * the frame. Remote only (tools/remote-acr/run.sh, software WebGL2). Frames: `@@SC <name> <i> <n> <b64>`.
 */
const emit = (name: string, buf: Buffer): void => {
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SC ${name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
};
const say = (tag: string, data: unknown): void => { process.stdout.write(`@@HOTCUM ${tag} ${JSON.stringify(data)}\n`); };
const raf = (page: Page, n: number) =>
  page.evaluate((k) => new Promise<void>((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const region = (page: Page, png: Buffer, box: [number, number, number, number]) =>
  page.evaluate(async ({ b64, r }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const x0 = Math.floor(r[0] * img.width), y0 = Math.floor(r[1] * img.height), x1 = Math.ceil(r[2] * img.width), y1 = Math.ceil(r[3] * img.height);
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let dark = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) if (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]! < 10) dark += 1;
    return { darkFraction: dark / n };
  }, { b64: png.toString("base64"), r: box });

const canvasInfo = (page: Page) => page.evaluate(() => {
  const c = document.querySelector("canvas")!;
  const r = c.getBoundingClientRect();
  return { width: c.width, height: c.height, rect: [Math.round(r.width), Math.round(r.height)], dpr: window.devicePixelRatio };
});

test.describe("hotfix: Cumulus Dash device scale", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  const cases = [
    { name: "1440x900-dsf2", width: 1440, height: 900, dsf: 2 },
    { name: "390x844-dsf2", width: 390, height: 844, dsf: 2 },
  ] as const;
  for (const c of cases) {
    test(`fills the frame at ${c.name}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: c.dsf });
      const page = await ctx.newPage();
      await page.goto(`${server.origin}/examples/kid-goku-beyond-the-clouds-port/?manual=1&quality=low`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (window as unknown as Record<string, { ready?: boolean }>).__AURA_CUMULUS_DASH__?.ready === true, undefined, { timeout: 1_500_000, polling: 1000 });
      await page.evaluate(() => { const a = (window as unknown as Record<string, any>).__AURA_CUMULUS_DASH__; a.begin(); a.settle(20, true); });
      await raf(page, 4);
      const expectedRatio = Math.min(c.dsf, 1.5);
      const info = await canvasInfo(page);
      say(c.name, info);
      expect(info.width).toBeGreaterThanOrEqual(Math.floor(c.width * expectedRatio) - 2);
      const shot = await page.screenshot({ type: "png" });
      emit(c.name, await page.screenshot({ type: "jpeg", quality: 88 }));
      // the old crop drew into the lower-left two thirds of the buffer and left the top and right of the frame black
      const topRight = await region(page, shot, [0.72, 0.02, 0.98, 0.3]);
      const right = await region(page, shot, [0.7, 0.3, 0.98, 0.7]);
      say(`${c.name}.regions`, { topRight, right });
      expect(topRight.darkFraction).toBeLessThan(0.2);
      expect(right.darkFraction).toBeLessThan(0.5);
      await ctx.close();
    });
  }
});
