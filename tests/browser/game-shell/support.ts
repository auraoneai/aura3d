/**
 * Shared helpers for the §15 game-shell suite: load the harness, reach the
 * mounted game, and drive the deterministic clock via
 * `window.__AURA3D_GAME_TEST__`.
 */
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

export function withServer(fn: (getServer: () => ExampleDevServer) => void): void {
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });
  fn(() => server);
}

export { expect, test, type Page, type ExampleDevServer };
