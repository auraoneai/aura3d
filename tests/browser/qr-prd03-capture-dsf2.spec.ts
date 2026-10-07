import { test, type BrowserContext } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * PRD-03 / Q-12-1 workaround: `tools/quality-rebuild-capture` cannot capture
 * DSF 2 until lane 12 adds a `desktop-1440x900@2` viewport. This spec loads
 * every game route at 1440x900 with deviceScaleFactor 2 and records the
 * canvas backing ratio (`canvas.width / clientWidth`) plus a screenshot, so
 * lane 03 baselines at DSF2 exist before that lands.
 *
 * It records a device property, not judged pixels, so running it on the
 * GitHub macos-14 provider does not mix providers in a comparison
 * (CI-ROUTING.md).
 */

const here = dirname(fileURLToPath(import.meta.url));
const gamesConfig = JSON.parse(
  readFileSync(join(here, "../../tools/quality-rebuild-capture/games.json"), "utf8")
) as {
  productionOrigin: string;
  games: { id: string; route: string; deployed?: boolean }[];
};

const OUT_PATH = process.env.QR_DSF2_OUT ?? join(here, "../reports/qr-prd03-dsf2.json");

interface Dsf2Record {
  id: string;
  url: string;
  viewport: [number, number];
  deviceScaleFactor: number;
  canvasCount: number;
  css: { width: number; height: number } | null;
  backing: { width: number; height: number } | null;
  backingRatio: number | null;
  error?: string;
}

const results: Dsf2Record[] = [];

async function measure(page: Awaited<ReturnType<BrowserContext["newPage"]>>, url: string): Promise<Omit<Dsf2Record, "id" | "url" | "viewport" | "deviceScaleFactor">> {
  const canvases = page.locator("canvas");
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if ((await canvases.count()) > 0) break;
    await page.waitForTimeout(500);
  }
  const canvasCount = await canvases.count();
  if (canvasCount === 0) return { canvasCount: 0, css: null, backing: null, backingRatio: null, error: "no canvas after 45s" };
  const canvas = canvases.first();
  const [css, backing] = await Promise.all([
    canvas.evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight })),
    canvas.evaluate((el: HTMLCanvasElement) => ({ width: el.width, height: el.height }))
  ]);
  const backingRatio = css.width > 0 ? backing.width / css.width : null;
  await page.waitForTimeout(2_000);
  return { canvasCount, css, backing, backingRatio };
}

for (const game of gamesConfig.games.filter((g) => g.deployed !== false)) {
  test(`DSF2 backing ratio: ${game.id}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    const url = `${gamesConfig.productionOrigin}${game.route}`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const measurement = await measure(page, url);
      results.push({ id: game.id, url, viewport: [1440, 900], deviceScaleFactor: 2, ...measurement });
      await page.screenshot({ path: join(here, `../reports/dsf2-${game.id}.png`), fullPage: false }).catch(() => {});
    } catch (error) {
      results.push({ id: game.id, url, viewport: [1440, 900], deviceScaleFactor: 2, canvasCount: 0, css: null, backing: null, backingRatio: null, error: String(error) });
    } finally {
      await context.close();
    }
  });
}

test.afterAll(() => {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    purpose: "Q-12-1 DSF2 backing-ratio record (PRD-03 baseline input)",
    viewport: "1440x900",
    deviceScaleFactor: 2,
    games: results
  };
  writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${OUT_PATH} (${results.length} games)`);
});
