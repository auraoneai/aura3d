import { expect, test } from "@playwright/test";
import { builtDist, serve, watchConsole, soakIfNeeded } from "./lib/serve";

/**
 * S1 boot/framed row for the single-path Blockfall Reactor. This is the
 * successor of the retired blockfall-reactor-dispatch, showcase-blockfall-
 * reactor-framing and showcase-blockfall-reactor-v2 specs: PR #1360 rebuilt
 * the route single-path on the falling-blocks-starter scaffold and deleted
 * the legacy/v2 dispatcher those specs exercised, so there are no flags to
 * dispatch on — every URL boots apps/showcase-blockfall-reactor/src/main.ts.
 * The `-dispatch` filename is retained only because the lane's S-category
 * matching keys on it (playwright.webkit/firefox testMatch and
 * write-evidence's S1 row). Keyboard/fall playthrough assertions live in
 * apps/showcase-blockfall-reactor/tests/playable.spec.ts, not here.
 */

const APP_DIR = "showcase-blockfall-reactor";

test.describe("blockfall-reactor single-path boot (S1)", () => {
  test("boots framed with a sized canvas and no console errors", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.goto(`${url}/`);
      await expect.poll(() =>
        page.evaluate(() => Boolean((window as Record<string, unknown>).__aura3dGameSnapshot)),
        { timeout: 30_000 }).toBe(true);
      // publishEvidence sets `framed` once draw calls are submitted for a
      // board with settled cells; the first snapshot can precede the first
      // presented frame, so poll the flag itself (as playable.spec.ts does).
      await expect.poll(() =>
        page.evaluate(() =>
          ((window as Record<string, unknown>).__aura3dGameSnapshot as { framed?: boolean }).framed),
        { timeout: 30_000 }).toBe(true);
      const snapshot = await page.evaluate(() =>
        (window as Record<string, unknown>).__aura3dGameSnapshot as {
          framed: boolean;
          board: { filledCells: number; drawCalls: number };
        });
      expect(snapshot.framed).toBe(true);
      expect(snapshot.board.filledCells).toBeGreaterThan(0);
      expect(snapshot.board.drawCalls).toBeGreaterThan(0);
      const canvas = await page.evaluate(() => {
        const el = document.querySelector("canvas");
        return el === null ? null : { width: el.clientWidth, height: el.clientHeight };
      });
      expect(canvas, "no canvas element mounted").not.toBeNull();
      expect(canvas!.width).toBeGreaterThan(0);
      expect(canvas!.height).toBeGreaterThan(0);
      await soakIfNeeded(page);
      expect(errors).toEqual([]);
    } finally {
      server.close();
    }
  });
});
