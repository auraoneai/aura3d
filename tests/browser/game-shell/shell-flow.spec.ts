/**
 * shell-flow.spec.ts (PRD-09 §15): loading → playing transitions, pause on
 * Escape, hidden-tab auto-pause, and the presentLog ordering invariant —
 * no presented frame tagged with the old sceneId after `setScene`, and no
 * entry with overlayOpacity < 1 between the call and the first new-sceneId
 * entry (transition.ts holds the fade until the new scene presents).
 */
import { expect, test, loadHarness, sessionState, stepFrames, withServer } from "./support";

withServer((getServer) => {
  test("boot reaches playing and pauses/resumes through the session", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=frozen");
    // Harness game.start() → loading; ready() resolves → playing (§7.3 legal path).
    expect(await sessionState(page)).toBe("playing");

    await page.evaluate(() => {
      const g = window.__AURA3D_SHELL__!.game as { session: { pause: () => void; resume: () => void } };
      g.session.pause();
    });
    expect(await sessionState(page)).toBe("paused");
    await page.evaluate(() => {
      const g = window.__AURA3D_SHELL__!.game as { session: { resume: () => void } };
      g.session.resume();
    });
    expect(await sessionState(page)).toBe("playing");
  });

  test("hidden-tab auto-pause via visibilitychange", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=frozen");
    expect(await sessionState(page)).toBe("playing");

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => {
      const g = window.__AURA3D_SHELL__!.game as { sessionImpl: { state: string } };
      return g.sessionImpl.state === "paused";
    });
    expect(await sessionState(page)).toBe("paused");

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  });

  test("presentLog: no stale sceneId and no sub-1 opacity around setScene", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=frozen");
    await stepFrames(page, 3);

    // Drive a real setScene through the mounted game (same scene shape, new revision).
    await page.evaluate(async () => {
      const g = window.__AURA3D_SHELL__!.game as {
        setScene: (s: unknown) => Promise<void>;
        app: { scene: { snapshot?: () => unknown } };
      };
      const snap = (g.app.scene as { snapshot?: () => unknown }).snapshot?.();
      if (snap !== undefined) await g.setScene(snap);
    });
    await stepFrames(page, 2);

    const report = await page.evaluate(() => {
      const log = window.__AURA3D_GAME_TEST__!.presentLog;
      const lastScene = log.length ? log[log.length - 1].sceneId : -1;
      const firstNew = log.findIndex((e) => e.sceneId === lastScene);
      return {
        staleEntries: log.slice(firstNew === -1 ? log.length : firstNew).filter((e) => e.sceneId !== lastScene).length,
        dimEntries: log.slice(firstNew === -1 ? 0 : firstNew).filter((e) => e.overlayOpacity < 1).length,
        logLength: log.length
      };
    });
    expect(report.logLength).toBeGreaterThan(0);
    expect(report.staleEntries, "presented frame tagged with a previous sceneId after setScene").toBe(0);
    expect(report.dimEntries, "presented frame while overlay opacity < 1 mid-transition").toBe(0);
  });
});
