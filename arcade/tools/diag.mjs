/**
 * Runtime isolation probe for the Prism Break paddle defect.
 *
 * The game rewrites the instanced pool every frame, so a probe write is
 * overwritten before it can be presented. This neutralises the node's
 * setInstances (so the app's per-frame sync becomes a no-op), writes the probe
 * through the original method, then presents one frame. That isolates
 * near-vs-far instance rendering in a single run, with no build.
 */
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:5274/";
const out = process.argv[3] ?? "arcade/prism-break/captures/diag";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForFunction(() => !document.getElementById("boot-gate"), { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(1500);

// Freeze the sim, then disarm the app's per-frame instance sync.
const armed = await page.evaluate(() => {
  const reg = globalThis.__AURA3D_LIVE_APPS__;
  const app = reg.all()[0];
  reg.pauseAll();
  const node = app.nodes.require("prism-bricks");
  if (!node.__probeOriginal) {
    node.__probeOriginal = node.setInstances.bind(node);
    node.setInstances = () => node; // the game's syncBricks() now does nothing
  }
  return { paused: reg.pauseAll(), hasStep: typeof app.step === "function" };
});
console.log("ARMED", JSON.stringify(armed));

async function place(position, scale, label) {
  const res = await page.evaluate(
    ({ position, scale }) => {
      const app = globalThis.__AURA3D_LIVE_APPS__.all()[0];
      const node = app.nodes.require("prism-bricks");
      const transforms = [{ position, rotation: [0, 0, 0], scale }];
      const colors = ["#ff2d6f"];
      for (let i = 1; i < 96; i += 1) {
        transforms.push({ position: [0, -60, 0], scale: 0 });
        colors.push("#141828");
      }
      node.__probeOriginal(transforms, colors);
      // present exactly one frame with the probe in place
      app.step(0);
      return { first: node.snapshot().instances?.[0] ?? null };
    },
    { position, scale }
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${label}.png` });
  console.log(label, JSON.stringify(res));
}

await place([0, 1.0, 0], [1.2, 1.2, 1.2], "p1-centre");
await place([0, 0.8, -2.6], [1.2, 1.2, 1.2], "p2-far");
await place([0, 0.8, 2.6], [1.2, 1.2, 1.2], "p3-near");
await place([0, 0.46, -2.78], [0.16, 0.26, 0.34], "p4-far-paddle-size");

await browser.close();
