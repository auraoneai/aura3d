import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/** A human path with real pointer and keyboard events (no hook-driven input): Start, E, wait for Ready, hold W. Remote only. */

type Api = { ready(): boolean; title(): boolean; state(): { phase: string; speed: number; distance: number }; frame(w: number, h: number, q: number): string };

test.describe("last-train human play", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  const open = async (page: Page): Promise<(expr: string) => Promise<unknown>> => {
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}/examples/last-train-port/?speed=30`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURA_LAST_TRAIN__?: Api }).__AURA_LAST_TRAIN__?.ready() === true, undefined, { timeout: 420_000 });
    await page.evaluate(() => {
      const w = window as unknown as { __toastLog: string[] };
      w.__toastLog = [];
      new MutationObserver(() => { const el = document.getElementById("toast"); if (el && !el.classList.contains("off") && el.textContent) w.__toastLog.push(el.textContent); }).observe(document.getElementById("toast")!, { childList: true, characterData: true, subtree: true, attributes: true });
    });
    return (expr) => page.evaluate(`window.__AURA_LAST_TRAIN__.${expr}`);
  };
  const toasts = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __toastLog: string[] }).__toastLog);
  const phaseOf = async (api: (e: string) => Promise<unknown>): Promise<string> => ((await api("state()")) as { phase: string }).phase;
  const waitPhase = async (page: Page, api: (e: string) => Promise<unknown>, wanted: string[], ms: number): Promise<string> => {
    const end = Date.now() + ms;
    let phase = await phaseOf(api);
    let last = "";
    while (!wanted.includes(phase) && Date.now() < end) {
      await page.waitForTimeout(500);
      phase = await phaseOf(api);
      if (phase !== last) { last = phase; console.log(`LTP phase ${phase} t=${Math.round(process.uptime())}s`); }
    }
    console.log(`LTP wait done ${phase} t=${Math.round(process.uptime())}s`);
    return phase;
  };

  test("Start by click, E, wait for Ready, hold W: the train moves and the frame changes", async ({ page }) => {
    test.skip(process.env.LT_PLAY_FULL !== "1", "full human path needs a GPU-class browser: cold software-GL shader compilation stalls the page for >10 minutes (set LT_PLAY_FULL=1 on a GPU runner)");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const api = await open(page);
    console.log(`LTP opened t=${Math.round(process.uptime())}s`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const startBox = await page.locator("#start-btn").boundingBox();
    expect(startBox, "Start button is on screen").not.toBeNull();
    await page.mouse.click(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
    console.log(`LTP clicked start t=${Math.round(process.uptime())}s`);
    expect(await api("title()")).toBe(false);
    await expect(page.locator("#prompt")).toBeVisible();
    await expect(page.locator("#prompt")).toContainText("Press E to open the doors");
    const box = await page.locator("#prompt").boundingBox();
    const note = await page.locator(".aura-port-note").boundingBox().catch(() => null);
    if (box && note) expect(box.y + box.height <= note.y || box.x + box.width <= note.x || note.x + note.width <= box.x, "prompt is not covered by the banner").toBe(true);
    const docked = (await api("frame(48, 27, 0.5)")) as string;
    console.log("LTP pressing E");
    await page.keyboard.press("KeyE");
    const ready = await waitPhase(page, api, ["ready"], 240_000);
    expect(ready, "doors, alighting and boarding finish").toBe("ready");
    await expect(page.locator("#prompt")).toContainText("Hold W to depart");
    const before = (await api("state()")) as { speed: number; distance: number };
    await page.keyboard.down("KeyW");
    const moving = await waitPhase(page, api, ["enroute"], 120_000);
    expect(moving, "W departs the platform").toBe("enroute");
    await page.waitForTimeout(8000);
    const after = (await api("state()")) as { speed: number; distance: number };
    await page.keyboard.up("KeyW");
    expect(after.speed, "speed rises above 0").toBeGreaterThan(0);
    expect(after.distance, "distance advances").toBeGreaterThan(before.distance);
    expect(Number(await page.locator("#speed").textContent())).toBeGreaterThan(0);
    expect((await api("frame(48, 27, 0.5)")) as string, "pixels changed since docking").not.toBe(docked);
    expect(errors).toEqual([]);
  });

  test("W alone works (opens the doors and explains), with focus never placed on the canvas", async ({ page }) => {
    const api = await open(page);
    await page.keyboard.press("Enter");
    expect(await api("title()")).toBe(false);
    expect(await phaseOf(api)).toBe("docked");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(400);
    await page.keyboard.up("KeyW");
    expect((await toasts(page)).join(" | "), "W explains what it did").toContain("Doors opening");
    expect(await waitPhase(page, api, ["opening", "deploying", "alighting", "boarding", "ready"], 30_000), "W started the stop").not.toBe("docked");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(300);
    await page.keyboard.up("KeyW");
    expect((await toasts(page)).join(" | ")).toMatch(/wait for Ready|Doors opening/);
  });
});
