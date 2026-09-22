import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome",
  args: ["--use-angle=swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
page.on("requestfailed", (r) => console.log("REQFAIL:", r.url().slice(0, 150)));
await page.goto("http://127.0.0.1:5187/apps/showcase-skyline-runner/", { waitUntil: "domcontentloaded", timeout: 90000 });
console.log("loaded");
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(10000);
  const st = await page.evaluate(() => ({
    hasGlobal: !!window["__AURA3D_SHOWCASE_SKYLINE_RUNNER__"],
    hasPump: !!window["__AURA3D_SKYLINE_PUMP__"],
    title: document.title,
    bodyLen: document.body?.innerHTML?.length ?? 0,
  }));
  console.log(`t=${(i+1)*10}s`, JSON.stringify(st));
  if (st.hasGlobal) break;
}
await browser.close();
