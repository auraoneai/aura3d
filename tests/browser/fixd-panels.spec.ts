import path from "node:path";
import { test } from "@playwright/test";
import { emit, serve } from "./shotsd-lib";

/**
 * fixd: the panels the UI-fix lane added or reshaped, captured open: Iron Crown "Fighter & Venue", Teleoperator
 * dock, and Thermal Drift phone HUD. Remote only (tools/remote-acr/run.sh); frames use the shotsd `@@SD` format.
 */
test.setTimeout(1_800_000);

const profiles = [
  { name: "1280", width: 1280, height: 720, mobile: false },
  { name: "390", width: 390, height: 844, mobile: true }
];

test("fixd panels", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/shotsd-dist"));
  for (const p of profiles) {
    const ctx = await browser.newContext({ viewport: { width: p.width, height: p.height }, deviceScaleFactor: 1, isMobile: p.mobile, hasTouch: p.mobile });
    const page = await ctx.newPage();
    await page.goto(`${origin}/apps/showcase-iron-crown/`, { waitUntil: "load", timeout: 180_000 });
    await page.waitForSelector("#ic-setup-toggle");
    await page.waitForTimeout(8_000);
    await page.click("#ic-setup-toggle");
    await page.waitForTimeout(500);
    emit("iron-crown-panel", p.name, "06-setup-open", await page.screenshot({ type: "jpeg", quality: 80 }));
    await page.click('#ic-venues [data-stage="colosseum-ruins"]');
    await page.waitForTimeout(1_500);
    console.log("SETUP_CLOSED_AFTER_PICK", p.name, await page.getAttribute("#ic-setup", "data-open"));
    await ctx.close();
  }
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const tel = await mobile.newPage();
  await tel.goto(`${origin}/apps/showcase-teleoperator/`, { waitUntil: "load", timeout: 180_000 });
  await tel.waitForSelector("#dockToggle", { state: "attached" });
  await tel.waitForTimeout(25_000);
  await tel.click("#dockToggle");
  await tel.waitForTimeout(800);
  emit("teleoperator-panel", "390", "07-dock-open", await tel.screenshot({ type: "jpeg", quality: 80 }));
  console.log("DOCK_STATE", await tel.getAttribute("#teleopDock", "data-collapsed"));
  await mobile.close();
  const hs = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const heat = await hs.newPage();
  await heat.goto(`${origin}/apps/showcase-heatsink/`, { waitUntil: "load", timeout: 180_000 });
  await heat.waitForTimeout(40_000);
  emit("heatsink-panel", "390", "08-phone-hud", await heat.screenshot({ type: "jpeg", quality: 80 }));
  await hs.close();
  await close();
});
