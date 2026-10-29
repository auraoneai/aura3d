import { test } from "@playwright/test";
import { emit } from "./shotsd-lib";

// Particle audit against a deployed origin (default production; remote only, software WebGL2): every game that spawns effects, idle then after actions, at deviceScaleFactor HF432_DPR (2 in this file).
const ORIGIN = process.env.HF432_ORIGIN ?? "https://aura3d.auraone.ai";
const DPR = 2;
// A DPR-2 screenshot waits for presented frames: one PNG plus one JPEG of a 2560x1440 canvas took 503 to 561 s on the
// software-GL runner (Glint Courier, run g13-dpr2), so 120 s timed out without a game defect.
const SHOT_TIMEOUT_MS = 600_000;
const GAMES: ReadonlyArray<readonly [string, string, string?]> = [
  ["links", "/apps/showcase-aura-links-3d/"],
  ["fc", "/apps/showcase-aura-fc-3d/"],
  ["iron-crown", "/apps/showcase-iron-crown/", "#ic-autopilot"],
  ["hoops", "/apps/showcase-aura-hoops-3d/"],
  ["diamond", "/apps/showcase-aura-diamond-3d/"],
  ["bunker-zero", "/apps/showcase-bunker-zero/"],
  ["cross-hop", "/apps/showcase-cross-hop/"],
  ["dot-dash", "/apps/showcase-dot-dash-3d/"],
  ["pips", "/apps/showcase-pips-big-leap/"]
];
test.setTimeout(3_000_000);

for (const [slug, route, auto] of GAMES) {
  test(`hf432 ${slug} dpr${DPR}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
    await page.goto(`${ORIGIN}${route}`, { waitUntil: "load", timeout: 180_000 });
    await page.waitForFunction(() => Boolean(document.querySelector("canvas")), undefined, { timeout: 240_000 });
    await page.waitForTimeout(14_000);
    emit(slug, `dpr${DPR}`, "idle", await page.screenshot({ type: "jpeg", quality: 82, timeout: SHOT_TIMEOUT_MS }));
    if (auto) await page.locator(auto).first().evaluate((n) => (n as HTMLElement).click()).catch(() => undefined);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("KeyE");
      await page.keyboard.down("Space"); await page.waitForTimeout(450); await page.keyboard.up("Space");
      await page.keyboard.down("KeyD"); await page.waitForTimeout(700); await page.keyboard.up("KeyD");
      await page.keyboard.press("KeyJ");
      await page.waitForTimeout(1_500);
      emit(slug, `dpr${DPR}`, `act${i}`, await page.screenshot({ type: "jpeg", quality: 82, timeout: SHOT_TIMEOUT_MS }));
    }
    await page.waitForTimeout(4_000);
    emit(slug, `dpr${DPR}`, "settled", await page.screenshot({ type: "jpeg", quality: 82, timeout: SHOT_TIMEOUT_MS }));
    console.log("HF432_INFO", slug, DPR, "ERR", JSON.stringify(errors.slice(0, 2)));
    await context.close();
  });
}
