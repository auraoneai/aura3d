/**
 * hitstop.spec.ts (PRD-09 §15): a light hit freezes only the struck actor for
 * ≥2 stepped frames (0.045 s ≥ 2 ticks at 60 Hz) and releases it by frame 4,
 * while an uninvolved third node changes on every frame throughout.
 *
 * Runs twice: on the game-shell table harness (struck actor "cue", control
 * node "eight ball") and on the T1 fighter fixture served from
 * packages/game/fixtures/fighter (struck actor "target", control node
 * "corner beacon").
 *
 * The scenarios' own hit lands on the real rAF loop, so its 45 ms freeze has
 * expired by the time a spec can observe it. Each test therefore waits for
 * the scenario to reach `playing` (and, for the fighter, to land its jab),
 * waits for that freeze to release, then lands the same `session.hitStop`
 * call inside one evaluate and advances the clock only through
 * `__AURA3D_GAME_TEST__.stepFrames` — no rAF tick can interleave there, so
 * the frame count is exact.
 */
import { expect, test, loadHarness, sessionState, stepFrames, withServer, type Page } from "./support";

type Track = { struck: number[][]; control: number[][] };

const moved = (a: readonly number[], b: readonly number[]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 1e-6;

async function trackHit(
  page: Page,
  globalName: "__AURA3D_SHELL__" | "__AURA3D_FIXTURE__",
  actor: string,
  struckNode: string,
  controlNode: string
): Promise<Track> {
  return page.evaluate(
    async ([globalKey, actorId, struckName, controlName]) => {
      const g = (window as unknown as Record<string, { game: unknown }>)[globalKey]!.game as {
        app: { scene: { node(id: string): { position: readonly number[] } } };
        session: { hitStop(seconds: number, o?: { actors?: readonly string[] }): void };
      };
      const hook = window.__AURA3D_GAME_TEST__!;
      const struck = g.app.scene.node(struckName);
      const control = g.app.scene.node(controlName);
      const track = { struck: [] as number[][], control: [] as number[][] };
      g.session.hitStop(0.045, { actors: [actorId] });
      for (let i = 0; i < 5; i += 1) {
        track.struck.push([struck.position[0], struck.position[1], struck.position[2]]);
        track.control.push([control.position[0], control.position[1], control.position[2]]);
        await hook.stepFrames(1);
      }
      return track;
    },
    [globalName, actor, struckNode, controlNode] as const
  );
}

function assertHitStop(track: Track): void {
  // Frames 0→1 and 1→2: the struck actor must not move (0.045 s ≥ 2 ticks).
  expect(moved(track.struck[0], track.struck[1]), "struck actor moved during hit-stop frame 1").toBe(false);
  expect(moved(track.struck[1], track.struck[2]), "struck actor moved during hit-stop frame 2").toBe(false);
  // By frame 4 the freeze (45 ms ≈ 2.7 ticks) has expired.
  expect(moved(track.struck[3], track.struck[4]), "struck actor still frozen past hit-stop").toBe(true);
  // The control node is uninvolved — it changes on every frame.
  for (let i = 0; i < track.control.length - 1; i += 1) {
    expect(moved(track.control[i], track.control[i + 1]), `control node static at frame ${i}`).toBe(true);
  }
}

withServer((getServer) => {
  test("light-hit freezes only the struck actor for 2+ frames", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=light-hit");
    await expect.poll(() => sessionState(page)).toBe("playing");
    // Sync on the test clock, and let the scenario's own real-time freeze end.
    await stepFrames(page, 1);
    await page.waitForFunction(() => {
      const g = window.__AURA3D_SHELL__!.game as { sessionImpl: { isFrozen(a?: string): boolean } };
      return !g.sessionImpl.isFrozen("cue");
    });
    assertHitStop(await trackHit(page, "__AURA3D_SHELL__", "cue", "cue ball", "eight ball"));
  });

  test("fighter fixture: light-hit freezes the target, beacon keeps orbiting", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${getServer().origin}/packages/game/fixtures/fighter/index.html?scenario=light-hit`, {
      waitUntil: "domcontentloaded"
    });
    // The fixture is served (bundled) from its own index.html and reaches
    // playing; the scenario lands its jab after the first presented frame.
    await page.waitForFunction(() => document.body.dataset.a3gFixture === "ready", undefined, { timeout: 30_000 });
    await page.waitForFunction(() => document.body.dataset.a3gScenario === "light-hit:landed", undefined, { timeout: 15_000 });
    await expect
      .poll(() => page.evaluate(() => typeof window.__AURA3D_GAME_TEST__?.stepFrames))
      .toBe("function");
    const state = await page.evaluate(() => {
      const fx = (window as unknown as { __AURA3D_FIXTURE__?: { game: { sessionImpl: { state: string } } } }).__AURA3D_FIXTURE__;
      return fx?.game.sessionImpl.state;
    });
    expect(state).toBe("playing");
    await page.evaluate(() => window.__AURA3D_GAME_TEST__!.stepFrames(1));
    await page.waitForFunction(() => {
      const fx = (window as unknown as { __AURA3D_FIXTURE__: { game: { sessionImpl: { isFrozen(a?: string): boolean } } } }).__AURA3D_FIXTURE__;
      return !fx.game.sessionImpl.isFrozen("target");
    });
    assertHitStop(await trackHit(page, "__AURA3D_FIXTURE__", "target", "target", "corner beacon"));
  });
});
