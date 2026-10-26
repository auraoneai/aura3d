import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const FILE_CHUNK = 15000;
function emit(path: string, bytes: Buffer): void {
  const b64 = bytes.toString("base64");
  const n = Math.ceil(b64.length / FILE_CHUNK);
  for (let i = 0; i < n; i++) console.log(`SLAMV_FILE ${path} ${i} ${n} ${b64.slice(i * FILE_CHUNK, (i + 1) * FILE_CHUNK)}`);
}

test.describe.configure({ timeout: 600_000 });
let server: ExampleDevServer;
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

test("shadow receive repro: sun shadow on vs off with no caster over the receiver", async ({ page }) => {
  await page.goto(`${server.origin}/tests/browser/shadow-receive-repro-harness.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as unknown as { __REPRO__?: unknown; __REPRO_ERROR__?: string }).__REPRO__ !== undefined, undefined, { timeout: 60_000 });
  const ids = await page.evaluate(() => (window as unknown as { __REPRO__: { ids: string[] } }).__REPRO__.ids);
  const rows: unknown[] = [];
  for (const id of ids) {
    const row = await page.evaluate((v) => (window as unknown as { __REPRO__: { render(id: string): Promise<unknown> } }).__REPRO__.render(v), id);
    const png = await page.locator("#stage canvas").screenshot({ type: "png" });
    const stats = await page.evaluate(async (b64) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const cx = cv.getContext("2d")!;
      cx.drawImage(bmp, 0, 0);
      const px = cx.getImageData(0, 0, bmp.width, bmp.height).data;
      let all = 0, low = 0, nl = 0, n = 0;
      for (let y = 0; y < bmp.height; y++) for (let x = 0; x < bmp.width; x++) {
        const i = (y * bmp.width + x) * 4;
        const l = px[i]! * 0.2126 + px[i + 1]! * 0.7152 + px[i + 2]! * 0.0722;
        all += l; n++;
        if (y > bmp.height * 0.6) { low += l; nl++; }
      }
      return { frameLuma: Number((all / n).toFixed(2)), lowerLuma: Number((low / nl).toFixed(2)), w: bmp.width, h: bmp.height };
    }, png.toString("base64"));
    const merged = { ...(row as object), ...stats };
    rows.push(merged);
    console.log(`SHADOWREPRO ${JSON.stringify(merged)}`);
    emit(`shadow-repro/${id}.png`, png);
  }
  expect(rows.length).toBe(ids.length);
});
