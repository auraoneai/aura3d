/**
 * Shared helpers for the §15 game-shell suite: load the harness, reach the
 * mounted game, and drive the deterministic clock via
 * `window.__AURA3D_GAME_TEST__`.
 */
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

export async function loadHarness(page: Page, server: ExampleDevServer, query = ""): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${server.origin}/tests/browser/game-shell/harness.html${query}`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForFunction(() => window.__AURA3D_SHELL__?.status !== undefined, undefined, {
    timeout: 30_000
  });
  const status = await page.evaluate(() => ({
    status: window.__AURA3D_SHELL__?.status,
    error: window.__AURA3D_SHELL__?.error
  }));
  expect(status.status, status.error).toBe("ready");
}

export async function stepFrames(page: Page, n: number, dt = 1 / 60): Promise<void> {
  const hasHook = await page.evaluate(() => typeof window.__AURA3D_GAME_TEST__?.stepFrames === "function");
  expect(hasHook, "__AURA3D_GAME_TEST__.stepFrames must exist in the test build").toBe(true);
  await page.evaluate(
    ([count, delta]) => window.__AURA3D_GAME_TEST__!.stepFrames(count, delta),
    [n, dt] as const
  );
}

export async function sessionState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const g = window.__AURA3D_SHELL__!.game as { sessionImpl: { state: string } };
    return g.sessionImpl.state;
  });
}

/** Page-composite pixels (canvas + DOM layers), same 4×4 stride as readPixels. */
export async function pagePixels(page: Page, evidenceName?: string): Promise<number[] | null> {
  // These probes compare explicit simulation frames. Leave the game loop
  // paused between captures so wall-clock RAF ticks cannot consume the flash
  // envelope or particle lifetime while Playwright composites the page.
  // runtime.step() continues to render while paused.
  await page.evaluate(() => {
    const game = window.__AURA3D_SHELL__!.game as { runtime: { pause(): unknown } };
    game.runtime.pause();
  });
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });
  // Evidence frames land in test-results/ (uploaded as prd09-browser-macos).
  if (evidenceName) writeFileSync(test.info().outputPath(`${evidenceName}.png`), png);
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const probe = document.createElement("canvas");
    probe.width = bitmap.width;
    probe.height = bitmap.height;
    const ctx = probe.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const out: number[] = [];
    for (let i = 0; i < data.length; i += 16 * 4) out.push(data[i], data[i + 1], data[i + 2]);
    return out;
  }, png.toString("base64"));
}

export function withServer(fn: (getServer: () => ExampleDevServer) => void): void {
  let server: ExampleDevServer;
  test.beforeEach(async ({ page }) => {
    // Module evaluation failures occur before the harness can publish its status.
    // Preserve the actual browser error alongside any readiness timeout.
    page.on("pageerror", (error) => console.error("[game-shell pageerror]", error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") console.error("[game-shell console]", message.text());
    });
    page.on("requestfailed", (request) => console.error("[game-shell requestfailed]", request.url(), request.failure()?.errorText));
    page.on("response", (response) => {
      if (response.status() >= 400) console.error("[game-shell response]", response.status(), response.url());
    });
  });
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });
  fn(() => server);
}

export { expect, test, type Page, type ExampleDevServer };
