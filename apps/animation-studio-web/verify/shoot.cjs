/**
 * G1 UI-readiness shooter — screenshots every studio surface of the RUNNING
 * production shell (no seed) at 1440x900 (chromium) into this directory.
 *
 * Surfaces captured (PRD §G1):
 *   full-shell, stage-viewport, outliner, inspector, timeline,
 *   director-console, command-palette (Cmd+K).
 *
 * Usage:  node verify/shoot.cjs          (defaults to http://127.0.0.1:5188/)
 *         URL=http://127.0.0.1:5174/ node verify/shoot.cjs
 */
const { chromium } = require("/Users/gurbakshchahal/aura3d/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright");
const path = require("path");

const OUT = __dirname;
const URL = process.env.URL || "http://127.0.0.1:5188/";

async function shotEl(page, selector, file) {
  const el = await page.$(selector);
  if (!el) {
    console.warn("  [skip] selector not found:", selector);
    return false;
  }
  await el.screenshot({ path: path.join(OUT, file) });
  console.log("  wrote", file);
  return true;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // 1) full shell
  await page.screenshot({ path: path.join(OUT, "full-shell.png") });
  console.log("  wrote full-shell.png");

  // 2) stage viewport
  await shotEl(page, ".stage", "stage-viewport.png");

  // 3) outliner (left pane top) — the panel that contains the scene-search box
  await shotEl(page, "xpath=//section[contains(@class,'panel')][.//div[@class='ol-search']]", "outliner.png");

  // 4) inspector — select the first shot so the inspector populates
  const shot = await page.$(".tl-row, .ol-item");
  if (shot) {
    await shot.click();
    await page.waitForTimeout(300);
  }
  await shotEl(page, ".insp", "inspector.png");

  // 5) timeline (the timeline panel — `section.tl`, not the stage's status badges)
  await shotEl(page, "section.tl", "timeline.png");

  // 6) director console (right pane)
  await shotEl(page, ".console", "director-console.png");

  // 7) command palette (Cmd+K)
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(450);
  // The palette overlay covers the full viewport — screenshot the page so the
  // dimmed shell + floating palette are both visible.
  await page.screenshot({ path: path.join(OUT, "command-palette.png") });
  console.log("  wrote command-palette.png");
  await page.keyboard.press("Escape");

  await browser.close();
  console.log("done — 7 surfaces written to", OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
