import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface Rgb { readonly r: number; readonly g: number; readonly b: number }
interface R { readonly image?: string; readonly id: string; readonly left: Rgb; readonly right: Rgb; readonly lit: number; readonly extra: { warnings?: string[]; errors?: number; drawCalls?: number } }

/** Left of the box shows the red texel, right shows the green texel; an untextured (white) surface fails both. */
const redLeft = (r: R) => r.left.r > 150 && r.left.g < 110 && r.left.b < 110;
const greenRight = (r: R) => r.right.g > 150 && r.right.r < 110 && r.right.b < 110;

test.describe("instanced and batched draws honour material texture maps", () => {
  test.setTimeout(600_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("every form shows the texel colours", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${server.origin}/examples/instanced-texture-probe/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __ITP_READY__?: boolean }).__ITP_READY__ === true, undefined, { timeout: 120_000 });
    const ids = await page.evaluate(() => (window as unknown as { __ITP__: { ids: string[] } }).__ITP__.ids);
    const results: R[] = [];
    for (const id of ids) {
      const r = (await page.evaluate(`window.__ITP__.run(${JSON.stringify(id)})`)) as R;
      results.push(r);
      console.log(`ITP_IMG ${r.id} ${r.image ?? ""}`);
      console.log(`ITP_RESULT ${redLeft(r) && greenRight(r) ? "OK  " : "FAIL"} ${JSON.stringify({ ...r, image: undefined })}`);
    }
    console.log(`ITP_SUMMARY ${JSON.stringify(results.map((r) => ({ id: r.id, ok: redLeft(r) && greenRight(r) })))}`);
    for (const r of results.filter((x) => !x.id.startsWith("plain-"))) {
      expect.soft(redLeft(r), `${r.id} left: ${JSON.stringify(r.left)}`).toBe(true);
      expect.soft(greenRight(r), `${r.id} right: ${JSON.stringify(r.right)}`).toBe(true);
    }
    expect(pageErrors).toEqual([]);
  });
});
