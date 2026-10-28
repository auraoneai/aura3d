import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Look preset exposure (beat-three.js PRD section 6): renders all 15 `looks.preset(id)` in one small scene and prints
 * LOOK_JSON per id plus LOOK_FRAME (a small JPEG) so before/after can be compared from the ACR log. The floor only
 * guards against a preset rendering black; the before/after judgement is in evidence/exposure-parity/.
 */
const MIN_NON_BLACK = Number(process.env.LOOK_MIN_NON_BLACK ?? "0.05");

test.describe("look preset exposure", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("every look preset renders a lit scene", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${server.origin}/tests/browser/exposure-looks-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as { __LOOKS__?: unknown }).__LOOKS__), undefined, { timeout: 60_000 });
    const ids = await page.evaluate(() => (window as unknown as { __LOOKS__: { ids: string[] } }).__LOOKS__.ids);
    const dark: string[] = [];
    for (const id of ids) {
      const c = await page.evaluate((i) => (window as unknown as { __LOOKS__: { render(i: string): Promise<{ id: string; meanLuma: number; nonBlack: number; jpeg: string; warnings: string[] }> } }).__LOOKS__.render(i), id);
      console.log(`LOOK_JSON ${JSON.stringify({ id: c.id, meanLuma: c.meanLuma, nonBlack: c.nonBlack, warnings: c.warnings })}`);
      console.log(`LOOK_FRAME ${c.id} ${c.jpeg}`);
      if (c.nonBlack < MIN_NON_BLACK) dark.push(`${c.id} (${c.nonBlack})`);
    }
    expect(errors, "page errors").toEqual([]);
    expect(dark, "look presets that render (almost) black").toEqual([]);
  });
});
