// Backspin visual bisection: pause app, toggle roofs, screenshot each state.
import { chromium } from "@playwright/test";

const url = "http://127.0.0.1:5282/";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForFunction(() => !document.getElementById("boot-gate"), { timeout: 45000 });
await page.evaluate(() => __AURA3D_LIVE_APPS__.pauseAll());
await page.waitForTimeout(400);

// A: paused default
await page.screenshot({ path: "/tmp/bs-diag-a-default.png" });

// B: roofs hidden — is the bike under them?
await page.evaluate(() => {
  const app = __AURA3D_LIVE_APPS__.all()[0];
  for (const id of app.nodes.ids()) {
    if (id.startsWith("roof-")) app.nodes.require(id).setVisible(false);
  }
});
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/bs-diag-b-noroofs.png" });

// C: roofs hidden + one tower moved center-frame, z=2 (closer than play plane)
await page.evaluate(() => {
  const app = __AURA3D_LIVE_APPS__.all()[0];
  app.nodes.require("tower-1").setPosition(-2, 2, 2).setScale(1, 1, 1);
  app.nodes.require("bike").setPosition(0, 3.5, 1.0);
});
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/bs-diag-c-tower-center.png" });

// D: bike lifted high above everything (roofs still hidden, tower reset off)
await page.evaluate(() => {
  const app = __AURA3D_LIVE_APPS__.all()[0];
  app.nodes.require("tower-1").setPosition(-30, 0, 2);
});
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/bs-diag-d-bike-high.png" });

await browser.close();
console.log("diag done");
