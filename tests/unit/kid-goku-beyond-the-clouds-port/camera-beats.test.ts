import { describe, expect, it } from "vitest";
import { LAUNCH_FOV_KICK_DEG, TITLE_FLYOVER_SECONDS, launchFovKick, titleFlyover, traumaFor, type V3 } from "../../../examples/kid-goku-beyond-the-clouds-port/art/camera";
import { CUMULUS_LOOK } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look";

const hero: V3 = [10, 70, -40];
const sun = CUMULUS_LOOK[0].sky.sunDir;

describe("CD-18 camera beats", () => {
  it("the title flyover is letterboxed, starts high on the sun side looking into the antisolar sky, and ends near the runner", () => {
    const first = titleFlyover(0, hero, sun, false)!;
    expect(first.bars).toBe(1);
    expect(first.eye[1] - hero[1]).toBeGreaterThan(15);
    // eye on the sun side: (eye - hero) points toward the sun horizontally
    expect((first.eye[0] - hero[0]) * sun[0] + (first.eye[2] - hero[2]) * sun[2]).toBeGreaterThan(0);
    // the view direction points away from the sun (toward the rainbow)
    const dir = [first.look[0] - first.eye[0], first.look[2] - first.eye[2]];
    expect(dir[0]! * sun[0] + dir[1]! * sun[2]).toBeLessThan(0);
    const late = titleFlyover(TITLE_FLYOVER_SECONDS - 0.01, hero, sun, false)!;
    expect(Math.hypot(late.eye[0] - hero[0], late.eye[1] - hero[1], late.eye[2] - hero[2])).toBeLessThan(12);
    expect(late.bars).toBeLessThan(0.05);
    expect(titleFlyover(TITLE_FLYOVER_SECONDS, hero, sun, false)).toBeNull();
  });

  it("is deterministic in t", () => {
    expect(titleFlyover(3.2, hero, sun, false)).toEqual(titleFlyover(3.2, hero, sun, false));
  });

  it("reduced motion: no flyover, no trauma, no FOV kick", () => {
    expect(titleFlyover(0, hero, sun, true)).toBeNull();
    expect(traumaFor(0, 0.6, true)).toBe(0);
    expect(launchFovKick(0.1, true)).toBe(0);
  });

  it("trauma follows impact rises only; the launch kick is +6 for 0.4 s", () => {
    expect(traumaFor(0, 0.6, false)).toBeGreaterThan(0);
    expect(traumaFor(0.6, 0.5, false)).toBe(0);
    expect(launchFovKick(0, false)).toBe(LAUNCH_FOV_KICK_DEG);
    expect(LAUNCH_FOV_KICK_DEG).toBe(6);
    expect(launchFovKick(0.5, false)).toBe(0);
    expect(launchFovKick(Infinity, false)).toBe(0);
  });
});
