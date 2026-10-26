import { test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { emit } from "./shotsd-lib";

// With runtime effects off by default, Links (a few shots), FC (demo kicks and goal) and Iron Crown (autopilot bout) must draw no bubble clouds and log no errors (remote only, software WebGL2) 1 and 2.
test.setTimeout(3_000_000);

// The slim remote context carries no model files: any binary the dev server 404s is fetched from production instead.
async function fillFromProduction(context: import("@playwright/test").BrowserContext, origin: string): Promise<void> {
  await context.route(/\.(glb|gltf|ktx2|png|jpe?g|webp|wav|mp3|ogg|bin|woff2?)(\?.*)?$/i, async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.continue();
    const local = await route.fetch().catch(() => null);
    if (local && local.status() < 400) return route.fulfill({ response: local });
    const remote = await route.fetch({ url: `https://aura3d.auraone.ai${url.pathname}${url.search}` }).catch(() => null);
    if (remote) return route.fulfill({ response: remote });
    return route.continue();
  });
}


for (const dpr of [1]) {
  test(`vfxoff iron-crown dpr${dpr}`, async ({ browser }) => {
    const server = await startExampleDevServer();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr });
    await fillFromProduction(context, server.origin);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    await page.goto(`${server.origin}/apps/showcase-iron-crown/`, { waitUntil: "load", timeout: 180_000 });
    await page.waitForFunction(() => Boolean(document.querySelector("canvas")), undefined, { timeout: 240_000 });
    await page.waitForTimeout(10_000);
    await page.locator("#ic-autopilot").first().evaluate((n) => (n as HTMLElement).click()).catch(() => undefined);
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(3_000);
      emit("iron-crown", "vfxoff", `dpr${dpr}-t${String(i).padStart(2, "0")}`, await page.screenshot({ type: "jpeg", quality: 82, timeout: 120_000 }));
    }
    console.log("VFXOFF_INFO", "iron-crown", "ERR", JSON.stringify(errors.slice(0, 4)));
    await context.close();
    await server.close();
  });
  test(`vfxoff fc dpr${dpr}`, async ({ browser }) => {
    const server = await startExampleDevServer();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr });
    await fillFromProduction(context, server.origin);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    await page.goto(`${server.origin}/apps/showcase-aura-fc-3d/`, { waitUntil: "load", timeout: 180_000 });
    await page.waitForFunction(() => Boolean(document.querySelector("canvas")), undefined, { timeout: 240_000 });
    await page.waitForTimeout(10_000);
    await page.getByText("Demo", { exact: true }).first().click({ timeout: 20_000 }).catch(() => undefined);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("KeyE");
      await page.keyboard.down("Space"); await page.waitForTimeout(450); await page.keyboard.up("Space");
      await page.keyboard.down("KeyD"); await page.waitForTimeout(900); await page.keyboard.up("KeyD");
      await page.waitForTimeout(2_500);
      emit("aura-fc-3d", "vfxoff", `dpr${dpr}-t${String(i).padStart(2, "0")}`, await page.screenshot({ type: "jpeg", quality: 82, timeout: 120_000 }));
    }
    console.log("VFXOFF_INFO", "fc", "ERR", JSON.stringify(errors.slice(0, 4)));
    await context.close();
    await server.close();
  });
  test(`vfxoff links dpr${dpr}`, async ({ browser }) => {
    const server = await startExampleDevServer();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr });
    await fillFromProduction(context, server.origin);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
    await page.goto(`${server.origin}/apps/showcase-aura-links-3d/`, { waitUntil: "load", timeout: 180_000 });
    await page.waitForFunction(() => Boolean(document.querySelector("canvas")), undefined, { timeout: 240_000 });
    await page.waitForTimeout(10_000);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Space"); await page.waitForTimeout(700);
      await page.keyboard.press("Space"); await page.waitForTimeout(700);
      await page.keyboard.press("Space"); await page.waitForTimeout(6_000);
      emit("aura-links-3d", "vfxoff", `dpr${dpr}-t${String(i).padStart(2, "0")}`, await page.screenshot({ type: "jpeg", quality: 82, timeout: 120_000 }));
    }
    console.log("VFXOFF_INFO", "links", "ERR", JSON.stringify(errors.slice(0, 4)));
    await context.close();
    await server.close();
  });
}
