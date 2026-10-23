import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Remote only (tools/remote-acr/run.sh, software WebGL2). Two things:
 *  1. every compatibility switch (`aa=0`, `post=0`, `tm=aces`, `env=0`, `shadow=0`, `sky=0`, `quality=low`) still draws a
 *     non-black frame; the log line `DRIFTNAN_SWITCH <name> luma=<mean> std=<std>` shows which ones change the picture;
 *  2. the black-frame self-heal: a page whose probe reads black until rung 2 reloads itself twice (no-aa, no-post) and then draws.
 */
const LAB = "/examples/drift-and-deliver-port/";
interface Api { ready(): boolean; stepFrames(n: number): unknown; state(): { frames: number }; pixels(): Promise<{ width: number; height: number; data: Uint8ClampedArray }> }

const stats = (data: Uint8ClampedArray): { mean: number; std: number } => {
  let sum = 0;
  let sum2 = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    sum += l;
    sum2 += l * l;
  }
  const mean = sum / n;
  return { mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
};

test.describe("drift-and-deliver compatibility switches and black-frame self-heal", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("every switch still renders a lit frame", async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 270 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const name of ["", "aa=0", "post=0", "tm=aces", "env=0", "shadow=0", "sky=0", "quality=low"]) {
      await page.goto(`${server.origin}${LAB}?heal=0&manual=1${name ? `&${name}` : ""}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (window as unknown as { __AURA_DRIFT_AND_DELIVER__?: Api }).__AURA_DRIFT_AND_DELIVER__?.ready() === true, undefined, { timeout: 300_000 });
      await page.evaluate(() => (window as unknown as { __AURA_DRIFT_AND_DELIVER__: Api }).__AURA_DRIFT_AND_DELIVER__.stepFrames(2));
      const px = await page.evaluate(async () => {
        const r = await (window as unknown as { __AURA_DRIFT_AND_DELIVER__: Api }).__AURA_DRIFT_AND_DELIVER__.pixels();
        return { data: Array.from(r.data) };
      });
      const s = stats(new Uint8ClampedArray(px.data));
      console.log(`DRIFTNAN_SWITCH ${name || "baseline"} luma=${s.mean.toFixed(1)} std=${s.std.toFixed(1)}`);
      expect(s.mean, name).toBeGreaterThan(8);
      expect(s.std, name).toBeGreaterThan(4);
    }
    expect(errors).toEqual([]);
  });

  test("a frame that reads black reloads itself down the ladder until it draws", async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 270 });
    // Emulate a GPU that is black until anti-aliasing and post are both off: the 16x16 probe reads zeros while the stored rung < 2.
    await page.addInitScript(() => {
      const original = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function (this: CanvasRenderingContext2D, ...args: [number, number, number, number]) {
        const image = original.apply(this, args);
        if (this.canvas.width === 16 && this.canvas.height === 16 && Number(sessionStorage.getItem("drift-heal-stage") ?? "0") < 2) image.data.fill(0);
        return image;
      };
    });
    await page.goto(`${server.origin}${LAB}?healframes=4&manual=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => location.search.includes("aa=0") && location.search.includes("post=0"), undefined, { timeout: 600_000 });
    await page.waitForFunction(() => (window as unknown as { __AURA_DRIFT_AND_DELIVER__?: Api }).__AURA_DRIFT_AND_DELIVER__?.ready() === true, undefined, { timeout: 300_000 });
    await page.waitForTimeout(3000);
    const stage = await page.evaluate(() => sessionStorage.getItem("drift-heal-stage"));
    console.log(`DRIFTNAN_HEAL stage=${stage} url=${new URL(page.url()).search}`);
    expect(stage).toBe("2");
    expect(new URL(page.url()).search).not.toContain("quality=low");
  });
});
