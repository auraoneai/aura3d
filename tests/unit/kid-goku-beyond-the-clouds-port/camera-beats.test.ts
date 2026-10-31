import { describe, expect, it } from "vitest";
import { LAUNCH_FOV_KICK_DEG, TITLE_FLYOVER_SECONDS, launchFovKick, titleFlyover, titleHold, traumaFor, type V3 } from "../../../examples/kid-goku-beyond-the-clouds-port/art/camera";
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

  it("the storm title hold stays on the sun side, looks into the antisolar sky near the horizon, and does not sway on reduced motion", () => {
    for (const t of [0, 10, 40]) {
      const p = titleHold(t, hero, sun, false);
      const toEye = [p.eye[0] - hero[0], p.eye[2] - hero[2]];
      expect(toEye[0] * sun[0] + toEye[1] * sun[2]).toBeGreaterThan(0);
      const dir = [p.look[0] - p.eye[0], p.look[1] - p.eye[1], p.look[2] - p.eye[2]];
      expect(dir[0] * sun[0] + dir[2] * sun[2]).toBeLessThan(0);
      const pitch = Math.atan2(dir[1], Math.hypot(dir[0], dir[2])) * 180 / Math.PI;
      expect(pitch).toBeGreaterThan(-8);
      expect(pitch).toBeLessThan(2);
    }
    expect(titleHold(3, hero, sun, true)).toEqual(titleHold(50, hero, sun, true));
  });
});
