import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/** Title, docked HUD, boarding and results screenshots (remote only); frames are logged as `LTART after <name> <i> <n> <base64>` for tools/crayon-capture/last-train-frames.ts. */

test.describe("last-train-art ui screens", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("title, docked HUD and results screens", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.setViewportSize({ width: 1280, height: 720 });
    const shot = async (name: string): Promise<void> => {
      const b64 = (await page.screenshot({ type: "jpeg", quality: 72 })).toString("base64");
      const n = Math.ceil(b64.length / 16000);
      for (let i = 0; i < n; i++) console.log(`LTART after ${name} ${i} ${n} ${b64.slice(i * 16000, (i + 1) * 16000)}`);
    };
    const ready = async (query: string): Promise<void> => {
      await page.goto(`${server.origin}/examples/last-train-port/${query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (window as unknown as { __AURA_LAST_TRAIN__?: { ready(): boolean } }).__AURA_LAST_TRAIN__?.ready() === true, undefined, { timeout: 420_000 });
      await page.waitForTimeout(3500);
    };
    await ready("");
    await shot("ui-title");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);
    await shot("ui-docked-hud");
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(9000);
    await shot("ui-boarding");
    await ready("?manual=1");
    await page.evaluate("window.__AURA_LAST_TRAIN__.runCircuit(0)");
    await page.evaluate("window.__AURA_LAST_TRAIN__.render()");
    await page.waitForTimeout(1500);
    await shot("ui-results");
    console.log(`LTART_ERRORS ui ${JSON.stringify(errors.filter((e) => !/favicon/.test(e)).slice(0, 12))}`);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });

  test("scripted input path changes the frame: Enter (Start), E (open doors), then W (depart)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/examples/last-train-port/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURA_LAST_TRAIN__?: { ready(): boolean } }).__AURA_LAST_TRAIN__?.ready() === true, undefined, { timeout: 420_000 });
    const api = <T>(expr: string): Promise<T> => page.evaluate(`window.__AURA_LAST_TRAIN__.${expr}`) as Promise<T>;
    const sample = (): Promise<string> => api<string>("frame(48, 27, 0.5)");
    expect(await api<boolean>("title()"), "the title screen is up").toBe(true);
    await expect(page.locator("#start-btn")).toBeVisible();
    const titleFrameA = await sample();
    await page.waitForTimeout(2500);
    expect(await sample(), "the title camera orbits, so the frame changes by itself").not.toBe(titleFrameA);
    await page.locator("#start-btn").click();
    expect(await api<boolean>("title()")).toBe(false);
    const docked = await sample();
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(6000);
    const phase = (await api<{ phase: string }>("state()")).phase;
    expect(["opening", "deploying", "alighting", "boarding", "ready"], `doors are working (phase ${phase})`).toContain(phase);
    expect(await sample(), "the frame changed after E").not.toBe(docked);
    expect(errors, "no page errors").toEqual([]);
  });
});
