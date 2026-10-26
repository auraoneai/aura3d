import { test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { emit, shootGame, type GameShot } from "./shotsd-lib";

// Iron Crown roster frames (remote only, software WebGL2): the Versus pick screen, then each fighter in a bout, then the standard final-screens set.
const CFG: GameShot = { slug: "iron-crown", route: "/apps/showcase-iron-crown/", auto: "#ic-autopilot", modes: [{ name: "versus", click: "[data-mode=\"versus\"]" }], keys: [["KeyD"], ["KeyJ"], ["KeyK"]] };
const PAIRS: ReadonlyArray<readonly [string, string]> = [["boulder", "seraph"], ["jinx", "sovereign"], ["kenji", "volt"], ["sovereign", "boulder"], ["seraph", "jinx"]];

const FAST = false;
test.setTimeout(3_000_000);

test("p1crown roster", async ({ browser }) => {
  const server = await startExampleDevServer();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  for (const [p1, cpu] of FAST ? PAIRS.slice(0, 1) : PAIRS) {
    const page = await context.newPage();
    const errors: string[] = [];
    const bad: string[] = [];
    page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(server.origin, "")}`.slice(0, 140)); });
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    await page.goto(`${server.origin}${CFG.route}`, { waitUntil: "load", timeout: 180_000 });
    await page.waitForFunction(() => Boolean(document.querySelector("canvas")), undefined, { timeout: 240_000 });
    await page.waitForTimeout(12_000);
    await page.locator("[data-mode=\"versus\"]").first().evaluate((n) => (n as HTMLElement).click());
    await page.waitForTimeout(2_000);
    await page.locator(`[data-grid="fighter-p1"] [data-pick="${p1}"]`).first().evaluate((n) => (n as HTMLElement).click());
    await page.locator(`[data-grid="fighter-cpu"] [data-pick="${cpu}"]`).first().evaluate((n) => (n as HTMLElement).click());
    emit("iron-crown", "roster", `${p1}-vs-${cpu}-select`, await page.screenshot({ type: "jpeg", quality: 84, timeout: 120_000 }));
    await page.locator("#versus-fight").evaluate((n) => (n as HTMLElement).click());
    await page.waitForTimeout(9_000);
    emit("iron-crown", "roster", `${p1}-vs-${cpu}-fight`, await page.screenshot({ type: "jpeg", quality: 86, timeout: 120_000 }));
    await page.keyboard.down("KeyD"); await page.waitForTimeout(700); await page.keyboard.up("KeyD");
    await page.keyboard.down("KeyJ"); await page.waitForTimeout(250); await page.keyboard.up("KeyJ");
    await page.waitForTimeout(500);
    emit("iron-crown", "roster", `${p1}-vs-${cpu}-attack`, await page.screenshot({ type: "jpeg", quality: 86, timeout: 120_000 }));
    console.log("P1CROWN_ERRORS", p1, cpu, JSON.stringify(errors.slice(0, 4)), "BAD", JSON.stringify([...new Set(bad)].slice(0, 14)));
    await page.close();
  }
  await context.close();
  if (!FAST) await shootGame(browser, CFG, server.origin);
  await server.close();
});
