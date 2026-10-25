import path from "node:path";
import { test } from "@playwright/test";
import { emit, serve } from "./shotsd-lib";

test.setTimeout(3_000_000);

test("fixdl cross-hop", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/fixdl-dist"));
  for (const profile of [
    { name: "1280", width: 1280, height: 720, mobile: false },
    { name: "390", width: 390, height: 844, mobile: true }
  ]) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1, isMobile: profile.mobile, hasTouch: profile.mobile });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    const t0 = Date.now();
    await page.goto(`${origin}/apps/showcase-cross-hop/`, { waitUntil: "load", timeout: 180_000 });
    await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 600_000 });
    await page.waitForTimeout(6_000);
    const measure = () => page.evaluate(() => {
      const r = (el: Element | null) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), h: Math.round(b.height) }; };
      const bar = document.querySelector(".aura3d-top-bar");
      const buttons = [...document.querySelectorAll(".aura3d-top-bar button")].map((b) => ({ text: b.textContent, active: b.classList.contains("active"), top: Math.round(b.getBoundingClientRect().top) }));
      const rows = new Set(buttons.map((b) => b.top)).size;
      const credit = document.querySelector(".aura3d-top-bar .a3d-credit");
      return {
        bar: r(bar), rows, buttons: buttons.length, active: buttons.filter((b) => b.active).map((b) => b.text),
        creditVisible: !!credit && getComputedStyle(credit).display !== "none",
        top: r(document.getElementById("ch-top")), score: r(document.getElementById("ch-score-wrap")),
        theme: document.getElementById("ch-theme")?.textContent ?? "", barSpace: getComputedStyle(document.documentElement).getPropertyValue("--a3d-bar-space")
      };
    });
    console.log(`@@FIXDL ch ${profile.name} ready ${Math.round((Date.now() - t0) / 1000)}s`);
    console.log(`@@FIXDL ch ${profile.name} title ${JSON.stringify(await measure())}`);
    emit("cross-hop", profile.name, "01-title", await page.screenshot({ type: "jpeg", quality: 86, timeout: 120_000 }));
    await page.evaluate(() => (document.querySelector('[data-ch-theme="4"]') as HTMLElement).click());
    await page.waitForTimeout(6_000);
    console.log(`@@FIXDL ch ${profile.name} neon ${JSON.stringify(await measure())}`);
    emit("cross-hop", profile.name, "02-neon-run", await page.screenshot({ type: "jpeg", quality: 86, timeout: 120_000 }));
    await page.evaluate(() => (document.getElementById("ch-bar-quick") as HTMLElement).click());
    await page.waitForTimeout(4_000);
    console.log(`@@FIXDL ch ${profile.name} quick ${JSON.stringify(await measure())}`);
    emit("cross-hop", profile.name, "03-quick-run", await page.screenshot({ type: "jpeg", quality: 86, timeout: 120_000 }));
    console.log(`@@FIXDL ch ${profile.name} errors ${JSON.stringify(errors)}`);
    await context.close();
  }
  await close();
});
