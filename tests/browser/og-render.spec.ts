import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

/**
 * Rasterizes the Aura3D social card (store-assets/brand/social/og-composite.html, written by
 * `node marketing/scripts/generate-og.mjs --html-only`) at 1200x630, deviceScaleFactor 1, because local Chromium is
 * not allowed on the dev Mac. Remote only (tools/remote-acr/run.sh). The compressed PNG leaves as base64 chunks in the
 * log: `OG_PNG:<name>:<index>:<chunk>` between OG_PNG_BEGIN / OG_PNG_END. The generator publishes twitter-1200x630.png
 * as a byte-identical copy of og-1200x630.png, so the card is emitted once under both names.
 */
const ROOT = process.env.OG_ROOT ?? "/repo";
// The remote image does not COPY store-assets/, so the run stages a copy of the HTML under apps/og-stage-tmp (EXTRA_DIRS).
const HTML = [join(ROOT, "store-assets/brand/social/og-composite.html"), join(ROOT, "apps/og-stage-tmp/og-composite.html")].find((f) => existsSync(f)) ?? "";
const MAX_BYTES = 300 * 1024;

const emit = (tag: string, b64: string) => {
  for (let i = 0; i * 3000 < b64.length; i++) console.log(`${tag}:${i}:${b64.slice(i * 3000, (i + 1) * 3000)}`);
};

// Same settings as compressPng() in marketing/scripts/generate-og.mjs, with a smaller palette as a fallback.
async function compress(raw: Buffer): Promise<Buffer> {
  let out = Buffer.alloc(0);
  for (const colors of [256, 192, 128, 96, 64]) {
    out = await sharp(raw).png({ palette: true, colors, quality: 92, effort: 10, compressionLevel: 9, dither: 0.9 }).toBuffer();
    if (out.length < MAX_BYTES) break;
  }
  return out;
}

test("og card renders at 1200x630 and compresses under 300 KB", async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(readFileSync(HTML, "utf8"), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>("img.shot");
    if (img && !img.complete) await new Promise((r) => (img.onload = r));
    if (img) await img.decode();
  });

  const diag = await page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    const scrollOverflow = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      return el ? el.scrollWidth - el.clientWidth : 0;
    };
    const h1 = document.querySelector<HTMLElement>("h1");
    return {
      fonts: {
        semibold: document.fonts.check('600 46px "Graphik Web"'),
        regular: document.fonts.check('400 13px "Graphik Web"'),
        mono: document.fonts.check('400 15px "TT Commons Pro Mono"')
      },
      h1Text: h1?.innerText.replace(/\n/g, " "),
      overflow: { h1: scrollOverflow("h1"), install: scrollOverflow(".install"), code: scrollOverflow(".code") },
      cmdBox: box(".install .cmd"),
      boxes: { h1: box("h1"), install: box(".install"), meta: box(".meta"), code: box(".code"), browser: box(".browser") },
      image: (() => { const i = document.querySelector<HTMLImageElement>("img.shot"); return { w: i?.naturalWidth, h: i?.naturalHeight }; })()
    };
  });
  console.log(`OG_DIAG ${JSON.stringify(diag)}`);

  expect(diag.fonts).toEqual({ semibold: true, regular: true, mono: true });
  expect(diag.h1Text).toBe("A lit 3D product in 10 lines of TypeScript.");
  // Frame is drawn at 656x369 (object-fit: cover); the committed top-tennis.webp is 720x450.
  expect(diag.image.w).toBeGreaterThanOrEqual(656);
  expect(diag.image.h).toBeGreaterThanOrEqual(369);
  expect(diag.overflow.h1).toBeLessThanOrEqual(1);
  expect(diag.boxes.h1!.right).toBeLessThanOrEqual(520);
  const install = diag.boxes.install!;
  expect(diag.cmdBox!.right).toBeLessThanOrEqual(install.right - 10);

  const raw = await page.screenshot({ type: "png" });
  await context.close();
  const png = await compress(raw);
  const meta = await sharp(png).metadata();
  console.log(`OG_PNG_META ${meta.width}x${meta.height} bytes=${png.length}`);
  expect(meta.width).toBe(1200);
  expect(meta.height).toBe(630);
  expect(png.length).toBeLessThan(MAX_BYTES);

  console.log("OG_PNG_BEGIN");
  emit("OG_PNG:og-1200x630", png.toString("base64"));
  console.log("OG_PNG_END");
});
