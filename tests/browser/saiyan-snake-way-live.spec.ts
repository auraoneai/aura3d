import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Serpentine Sky Run live loop (no `manual=1`): the renderer blends the last two simulation steps, so this
 * drives the real requestAnimationFrame path that the manual spec never touches. Remote-only
 * (tools/remote-acr/run.sh, software WebGL2); it proves the live path boots, advances, draws and logs no errors.
 */

const LAB = "/examples/saiyan-snake-way-port/";

interface Api { ready: boolean; state(): { s: number; phase: string }; frame(w?: number, h?: number, q?: number): Promise<string>; diagnostics(): { drawCalls?: number; errors?: readonly unknown[] } | null }

test.describe("saiyan-snake-way live loop", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("advances and draws through the blended live loop with no errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto(`${server.origin}${LAB}?autostart=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_SAIYAN_SNAKE_WAY__?: { ready: boolean }; __AURA_SAIYAN_SNAKE_WAY_ERROR__?: string };
        return w.__AURA_SAIYAN_SNAKE_WAY__?.ready === true || Boolean(w.__AURA_SAIYAN_SNAKE_WAY_ERROR__);
      },
      undefined,
      { timeout: 540_000 }
    );
    expect(await page.evaluate(() => (window as unknown as { __AURA_SAIYAN_SNAKE_WAY_ERROR__?: string }).__AURA_SAIYAN_SNAKE_WAY_ERROR__ ?? null), JSON.stringify(errors.slice(0, 8))).toBeNull();

    const api = <T>(fn: (o: Api) => T | Promise<T>): Promise<T> => page.evaluate(`(${fn.toString()})(window.__AURA_SAIYAN_SNAKE_WAY__)`) as Promise<T>;
    const before = await api((o) => o.state().s);
    await page.waitForTimeout(6000);
    const after = await api((o) => o.state().s);
    console.log(`SSWLIVE advanced ${before} -> ${after}`);
    expect(after).toBeGreaterThan(before + 1);

    const data = await api((o) => o.frame(320, 180, 0.6));
    console.log(`SSWLIVE frame ${data.split(",")[1]}`);
    expect(data.length).toBeGreaterThan(2000);
    const diag = await api((o) => o.diagnostics());
    console.log(`SSWLIVE diag ${JSON.stringify({ drawCalls: diag?.drawCalls, errors: diag?.errors?.length ?? 0 })}`);
    expect(errors.filter((e) => !/favicon|ENV_FETCH_FAILED/i.test(e))).toEqual([]);
  });
});
