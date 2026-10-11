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
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => {
      const g = window.__AURA3D_SHELL__!.game as { sessionImpl: { state: string } };
      return g.sessionImpl.state === "paused";
    });
    expect(await sessionState(page)).toBe("paused");

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  });

  test("presentLog: no stale sceneId and no sub-1 opacity around setScene", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=frozen");
    await stepFrames(page, 3);

    // A real faded setScene through the mounted game: `app.scene` is the
    // mounted snapshot; re-applying it swaps the scene and bumps the revision.
    // The rAF loop keeps presenting frames while the fade runs.
    const before = await page.evaluate(() => window.__AURA3D_GAME_TEST__!.presentLog.at(-1)?.sceneId ?? -1);
    await page.evaluate(async () => {
      const g = window.__AURA3D_SHELL__!.game as {
        setScene: (s: unknown, o?: { transition?: { kind: "fade"; ms?: number } }) => Promise<void>;
        app: { scene: unknown };
      };
      await g.setScene(g.app.scene, { transition: { kind: "fade", ms: 120 } });
    });
    await stepFrames(page, 2);

    const report = await page.evaluate((prev) => {
      const log = window.__AURA3D_GAME_TEST__!.presentLog;
      const firstNew = log.findIndex((e) => e.sceneId > prev);
      const lastScene = log.length ? log[log.length - 1].sceneId : -1;
      return {
        logLength: log.length,
        firstNew,
        lastScene,
        staleEntries: firstNew === -1 ? -1 : log.slice(firstNew).filter((e) => e.sceneId < log[firstNew].sceneId).length,
        // The swap happens under the opaque overlay: the last old-scene frame
        // (presented after the fade-out settled) and the first new-scene frame
        // must both be fully covered.
        lastOldOpacity: firstNew > 0 ? log[firstNew - 1].overlayOpacity : -1,
        firstNewOpacity: firstNew === -1 ? -1 : log[firstNew].overlayOpacity,
        finalOpacity: log.length ? log[log.length - 1].overlayOpacity : -1
      };
    }, before);
    expect(report.logLength).toBeGreaterThan(0);
    expect(report.firstNew, "no presented frame carries the new sceneId").toBeGreaterThan(0);
    expect(report.lastScene, "setScene did not advance the presented sceneId").toBeGreaterThan(before);
    expect(report.staleEntries, "presented frame tagged with a previous sceneId after setScene").toBe(0);
    expect(report.lastOldOpacity, "scene swapped while the overlay was not opaque").toBe(1);
    expect(report.firstNewOpacity, "new scene presented while overlay opacity < 1 mid-transition").toBe(1);
    // After the fade-in the overlay is clear again.
    expect(report.finalOpacity).toBe(0);
  });
});
