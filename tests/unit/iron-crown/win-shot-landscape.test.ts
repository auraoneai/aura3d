/**
 * IRON CROWN win hero shot on 1280x720 (real-GPU bout-end frame: the winner was cut at the knees). The authored shot
 * aims at the winner's middle and main.ts dollies it back across the floor (same lens height) until the winner's whole
 * body box, feet to head with headroom, sits inside the letterbox with a margin. Pure camera maths (the same functions
 * main.ts calls).
 */
import { describe, expect, it } from "vitest";
import {
  cinematicLandscapeSafe,
  cinematicShot,
  dollyEye,
  FIGHTER_FRAME_HEIGHT,
  fitDollyFactor,
  landscapeFitsShot,
  projectNdc,
  shotSubjects,
  subjectsInFrame,
  type FrameSubject
} from "../../../apps/showcase-iron-crown/src/game/cinematics";
import { LETTERBOX_BAR } from "../../../apps/showcase-iron-crown/src/game/look";

const LANDSCAPE = 1280 / 720;
const SCALES = [0.92, 0.96, 1, 1.02, 1.08, 1.12];

describe("iron-crown win shot frames the winner head to feet on landscape", () => {
  const safe = cinematicLandscapeSafe(LETTERBOX_BAR);

  it("the safe band stays inside the letterbox bars with a margin", () => {
    expect(safe.top).toBeLessThan(1 - 2 * LETTERBOX_BAR);
    expect(safe.bottom).toBeGreaterThan(-(1 - 2 * LETTERBOX_BAR));
    expect(landscapeFitsShot("win-hero")).toBe(true);
    expect(landscapeFitsShot("p1-closeup")).toBe(false);
  });

  for (const scale of SCALES) {
    for (const wx of [-3.5, -2.2, 0, 2.2, 3.5]) {
      it(`scale ${scale} winner at x=${wx}: whole body inside the letterbox, still a large low hero shot`, () => {
        const h = FIGHTER_FRAME_HEIGHT * scale;
        const winner: FrameSubject = { position: [wx, 0, 0], height: h };
        const other: FrameSubject = { position: [wx > 0 ? wx - 3 : wx + 3, 0, 0], height: h };
        const shot = cinematicShot({ phase: "boutEnd", t: 0, p1: other.position, p2: winner.position, winner: winner.position, reducedMotion: false })!;
        expect(shot.name).toBe("win-hero");
        expect(shot.position[1]).toBeLessThan(shot.target[1]); // still a low shot looking up
        const subjects = shotSubjects(shot.name, other, winner, winner);
        const k = fitDollyFactor(shot.position, shot.target, shot.fov, LANDSCAPE, subjects, { minK: 1, maxK: 4, safe, keepHeight: true });
        expect(k).toBeLessThan(4);
        const eye = dollyEye(shot.position, shot.target, k, true);
        expect(eye[1]).toBeCloseTo(shot.position[1], 6);
        expect(subjectsInFrame(eye, shot.target, shot.fov, LANDSCAPE, subjects, safe)).toBe(true);
        const feet = projectNdc(eye, shot.target, shot.fov, LANDSCAPE, [wx, 0, 0])!;
        const head = projectNdc(eye, shot.target, shot.fov, LANDSCAPE, [wx, h, 0])!;
        // Feet and head both inside the visible band between the bars.
        expect(feet[1]).toBeGreaterThan(-(1 - 2 * LETTERBOX_BAR));
        expect(head[1]).toBeLessThan(1 - 2 * LETTERBOX_BAR);
        // Hero-sized: the winner fills at least 45% of the full frame height (smallest fighter ~48%, the largest ~58%).
        expect((head[1] - feet[1]) / 2).toBeGreaterThanOrEqual(0.45);
      });
    }
  }

  it("as authored before the fix (aim 1.5 m, no fit) the feet fell below the frame (the regression)", () => {
    const eye: [number, number, number] = [2.8, 0.85, 3.1];
    const feet = projectNdc(eye, [2.2, 1.5, 0], 36, LANDSCAPE, [2.2, 0, 0])!;
    expect(feet[1]).toBeLessThan(-(1 - 2 * LETTERBOX_BAR));
  });
});
