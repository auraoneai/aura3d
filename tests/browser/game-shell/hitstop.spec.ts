/**
 * hitstop.spec.ts (PRD-09 §15): scenario "light-hit" freezes the struck actor
 * (cue ball, session actor id "cue") for ≥2 stepped frames (0.045 s ≥ 2 ticks
 * at 60 Hz) and releases it by frame 4; the uninvolved "eight ball" control
 * node changes on every frame throughout.
 */
import { expect, test, loadHarness, sessionState, stepFrames, withServer } from "./support";

withServer((getServer) => {
  test("light-hit freezes only the struck actor for 2+ frames", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=light-hit");
    expect(await sessionState(page)).toBe("playing");

    const positions = await page.evaluate(async () => {
      const g = window.__AURA3D_SHELL__!.game as {
        app: { scene: { node(id: string): { position: readonly number[] } } };
      };
      const hook = window.__AURA3D_GAME_TEST__!;
      const cue = g.app.scene.node("cue ball");
      const eight = g.app.scene.node("eight ball");
      const track = { cue: [] as number[][], eight: [] as number[][] };
      for (let i = 0; i < 5; i += 1) {
        track.cue.push([cue.position[0], cue.position[1], cue.position[2]]);
        track.eight.push([eight.position[0], eight.position[1], eight.position[2]]);
        await hook.stepFrames(1);
      }
      return track;
    });

    const moved = (a: readonly number[], b: readonly number[]) =>
      Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 1e-6;

    // Frames 0→1 and 1→2: the struck actor must not move (0.045 s ≥ 2 ticks).
    expect(moved(positions.cue[0], positions.cue[1]), "cue moved during hit-stop frame 1").toBe(false);
    expect(moved(positions.cue[1], positions.cue[2]), "cue moved during hit-stop frame 2").toBe(false);
    // By frame 4 the freeze (45 ms ≈ 2.7 ticks) has expired.
    expect(moved(positions.cue[3], positions.cue[4]), "cue still frozen past hit-stop").toBe(true);
    // The control node is uninvolved — it changes on every frame.
    for (let i = 0; i < positions.eight.length - 1; i += 1) {
      expect(moved(positions.eight[i], positions.eight[i + 1]), `control node static at frame ${i}`).toBe(true);
    }
  });
});
