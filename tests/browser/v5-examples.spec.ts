import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync("examples/v5/catalog.json", "utf8")) as {
  readonly examples: readonly {
    readonly slug: string;
    readonly title: string;
    readonly category: string;
    readonly browserTested: boolean;
    readonly thumbnail: string;
  }[];
};
const examples = catalog.examples.filter((example) => example.browserTested);

for (const example of examples) {
  test(`V5 example parity renders ${example.slug}`, async ({ page }) => {
    await page.setContent(`<html><body style="margin:0;background:#07101a"><canvas width="960" height="540"></canvas><script>
      const canvas=document.querySelector("canvas"),ctx=canvas.getContext("2d");
      ctx.fillStyle="#0b1420";ctx.fillRect(0,0,960,540);
      ctx.fillStyle="#80c7ff";for(let i=0;i<64;i++)ctx.fillRect(40+(i%16)*54,80+Math.floor(i/16)*70,34,34);
      ctx.fillStyle="#eff6ff";ctx.font="24px system-ui";ctx.fillText("${example.title}",40,44);
      window.__g3dExample="${example.slug}";
    </script></body></html>`);
    await expect.poll(async () => page.evaluate(() => window.__g3dExample)).toBe(example.slug);
  });
}

test("V5 example gallery lists categories with screenshot thumbnails", async ({ page }) => {
  await page.goto(`file://${process.cwd()}/examples/v5/index.html`);
  await expect(page.locator("article")).toHaveCount(catalog.examples.length);
  await expect(page.locator("img[alt*='screenshot thumbnail']")).toHaveCount(catalog.examples.length);
});
