// Vector Nine: print the pageerror stack to pinpoint the TDZ reference.
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (error) => {
  console.log("PAGEERROR:", error.message);
  console.log("STACK:\n" + (error.stack ?? "(none)").split("\n").slice(0, 6).join("\n"));
});
await page.goto("http://127.0.0.1:5292/", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(6000);
const gate = await page.evaluate(() => ({
  gateGone: !document.getElementById("boot-gate"),
  state: globalThis.__AURA3D_ARCADE_STATE__ ?? null
}));
console.log("gate:", JSON.stringify(gate).slice(0, 200));
await browser.close();
