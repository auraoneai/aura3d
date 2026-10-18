import { chromium } from "@playwright/test";
const url = process.argv[2];
const out = process.argv[3];
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForFunction(() => !document.getElementById("boot-gate"), { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const reg = globalThis.__AURA3D_LIVE_APPS__;
  const app = reg.all()[0];
  reg.pauseAll();
  const ball = app.nodes.require("ball-0");
  if (!ball.__o) { ball.__o = ball.setPosition.bind(ball); ball.setPosition = () => ball; }
  ball.setVisible(true).setScale([1.8, 1.8, 1.8]);
});
const cases = [
  ["h1-far-low",  [0, 1.2, -1.6]],
  ["h2-far-high", [0, 4.5, -1.6]],
  ["h3-far-vhigh",[0, 9.0, -1.6]],
  ["h4-far-far",  [0, 1.2, -4.5]]
];
for (const [label, pos] of cases) {
  await page.evaluate((pos) => {
    const app = globalThis.__AURA3D_LIVE_APPS__.all()[0];
    const ball = app.nodes.require("ball-0");
    ball.__o(pos[0], pos[1], pos[2]);
    app.step(0);
  }, pos);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${label}.png` });
  console.log("shot", label);
}
await browser.close();
