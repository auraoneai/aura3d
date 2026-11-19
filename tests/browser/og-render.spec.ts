import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

const root = process.env.OG_ROOT ?? "/repo";
const html = [
  join(root, "store-assets/brand/social/og-composite.html"),
  join(root, "apps/og-stage-tmp/og-composite.html"),
].find(existsSync);

test("the homepage social preview renders the complete 1200 × 630 card", async ({ browser }) => {
  if (!html) throw Error("Stage the generated og-composite.html before running this browser test");
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(readFileSync(html, "utf8"), { waitUntil: "load" });
  const card = page.getByRole("img", { name: /armored courier.*Vesper GT.*industrial robot/i });
  const src = await card.getAttribute("src");
  if (!src?.startsWith("data:image/png;base64,")) throw Error("Missing embedded card");
  const png = Buffer.from(src.split(",")[1], "base64");
  const meta = await sharp(png).metadata();
  expect([meta.width,meta.height]).toEqual([1200,630]);
  expect(png.length).toBeLessThan(300 * 1024);
  expect(await card.boundingBox()).toEqual({ x: 0, y: 0, width: 1200, height: 630 });
  // The preview must reproduce the finished artwork without a rescale or a crop.
  const pixels = (input: Buffer) => sharp(input).removeAlpha().raw().toBuffer();
  expect(await pixels(await page.screenshot())).toEqual(await pixels(png));
  await page.close();
});
