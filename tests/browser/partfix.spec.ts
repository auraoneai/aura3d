import { test } from "@playwright/test";
import { emit } from "./shotsd-lib";

// Particle size repro against a deployed origin (default production; remote only, software WebGL2): Iron Crown autopilot bout and FC demo at deviceScaleFactor 1 and 2.
test.setTimeout(3_000_000);

for (const dpr of [1, 2]) {
  test(`partfix iron-crown dpr${dpr}`, async ({ browser }) => {
    const server = { origin: process.env.PARTFIX_ORIGIN ?? "https://aura3d.auraone.ai", close: async () => undefined };
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    await page.goto(`${server.origin}/apps/showcase-iron-crown/`, { waitUntil: "load", timeout: 180_000 });
    await page.waitForFunction(() => Boolean(document.querySelector("canvas")), undefined, { timeout: 240_000 });
    await page.waitForTimeout(10_000);
    await page.locator("#ic-autopilot").first().evaluate((n) => (n as HTMLElement).click()).catch(() => undefined);
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(3_000);
      emit("iron-crown", "partfix", `dpr${dpr}-t${String(i).padStart(2, "0")}`, await page.screenshot({ type: "jpeg", quality: 82, timeout: 120_000 }));
    }
    const info = await page.evaluate(() => {
      const c = document.querySelector("canvas") as HTMLCanvasElement;
      return { dpr: window.devicePixelRatio, w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight };
    });
    console.log("PARTFIX_INFO", "iron-crown", dpr, JSON.stringify(info), "ERR", JSON.stringify(errors.slice(0, 3)));
    await context.close();
    await server.close();
  });
  test(`partfix fc dpr${dpr}`, async ({ browser }) => {
    const server = { origin: process.env.PARTFIX_ORIGIN ?? "https://aura3d.auraone.ai", close: async () => undefined };
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    await page.goto(`${server.origin}/apps/showcase-aura-fc-3d/`, { waitUntil: "load", timeout: 180_000 });
    await page.waitForFunction(() => Boolean(document.querySelector("canvas")), undefined, { timeout: 240_000 });
    await page.waitForTimeout(10_000);
    await page.getByText("Demo", { exact: true }).first().click({ timeout: 20_000 }).catch(() => undefined);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("KeyE");
      await page.keyboard.down("Space"); await page.waitForTimeout(450); await page.keyboard.up("Space");
      await page.keyboard.down("KeyD"); await page.waitForTimeout(900); await page.keyboard.up("KeyD");
      await page.waitForTimeout(2_500);
      emit("aura-fc-3d", "partfix", `dpr${dpr}-t${String(i).padStart(2, "0")}`, await page.screenshot({ type: "jpeg", quality: 82, timeout: 120_000 }));
    }
    const info = await page.evaluate(() => {
      const c = document.querySelector("canvas") as HTMLCanvasElement;
      return { dpr: window.devicePixelRatio, w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight };
    });
    console.log("PARTFIX_INFO", "fc", dpr, JSON.stringify(info), "ERR", JSON.stringify(errors.slice(0, 3)));
    await context.close();
    await server.close();
  });
}
