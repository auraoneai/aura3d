/**
 * IRON CROWN GU47 IC47-C1: three intro shots, a K.O. orbit and a win hero shot, all letterboxed, inside the existing
 * phase windows; reduced motion turns the dolly and the orbit into static cuts. Camera only (pure functions).
 */
import { describe, expect, it } from "vitest";
import {
  cinematicShot,
  createCinematicClock,
  INTRO_SECONDS,
  INTRO_SHOTS,
  letterboxWanted,
  type CinematicInput
} from "../../../apps/showcase-iron-crown/src/game/cinematics";

const base: CinematicInput = { phase: "intro", t: 0, p1: [-2.2, 0, 0], p2: [2.2, 0, 0], winner: null, reducedMotion: false };

describe("iron-crown cinematics (GU47 IC47-C1)", () => {
  it("plays three intro shots in order within the intro window (<= 4.0 s)", () => {
    const names = [0, 0.3, INTRO_SHOTS.p1 + 0.01, INTRO_SHOTS.p2 + 0.01, INTRO_SECONDS].map((t) => cinematicShot({ ...base, t })?.name);
    expect(names).toEqual(["venue-dolly", "venue-dolly", "p1-closeup", "p2-closeup", "p2-closeup"]);
    expect(INTRO_SECONDS).toBeLessThanOrEqual(4);
    expect(INTRO_SHOTS.p2).toBeLessThan(INTRO_SECONDS);
  });

  it("dollies in, and cuts to the end pose on reduced motion", () => {
    const start = cinematicShot({ ...base, t: 0 })!;
    const end = cinematicShot({ ...base, t: INTRO_SHOTS.p1 - 1e-6 })!;
    expect(start.position[2]).toBeGreaterThan(end.position[2] + 3);
    const reduced = cinematicShot({ ...base, t: 0, reducedMotion: true })!;
    expect(reduced.position[2]).toBeCloseTo(end.position[2], 3);
  });

  it("frames each fighter's close-up on that fighter", () => {
    const p1 = cinematicShot({ ...base, t: INTRO_SHOTS.p1 + 0.1 })!;
    const p2 = cinematicShot({ ...base, t: INTRO_SHOTS.p2 + 0.1 })!;
    expect(p1.target[0]).toBe(-2.2);
    expect(p2.target[0]).toBe(2.2);
  });

  it("orbits on K.O. and holds a static angle on reduced motion", () => {
    const a = cinematicShot({ ...base, phase: "ko", t: 0 })!;
    const b = cinematicShot({ ...base, phase: "ko", t: 1.2 })!;
    expect(a.name).toBe("ko-orbit");
    expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])).toBeGreaterThan(1);
    const ra = cinematicShot({ ...base, phase: "ko", t: 0, reducedMotion: true })!;
    const rb = cinematicShot({ ...base, phase: "ko", t: 1.2, reducedMotion: true })!;
    expect(rb.position).toEqual(ra.position);
  });

  it("gives the winner a low hero shot and leaves the fight to the rig", () => {
    const win = cinematicShot({ ...base, phase: "boutEnd", winner: [2.2, 0, 0] })!;
    expect(win.name).toBe("win-hero");
    expect(win.position[1]).toBeLessThan(win.target[1]);
    expect(cinematicShot({ ...base, phase: "boutEnd", winner: null })).toBeNull();
    for (const phase of ["fight", "attract", "roundEnd"] as const) expect(cinematicShot({ ...base, phase })).toBeNull();
  });

  it("letterboxes only the performed shots", () => {
    expect(letterboxWanted("intro", false)).toBe(true);
    expect(letterboxWanted("ko", false)).toBe(true);
    expect(letterboxWanted("boutEnd", true)).toBe(true);
    expect(letterboxWanted("boutEnd", false)).toBe(false);
    expect(letterboxWanted("fight", false)).toBe(false);
    expect(letterboxWanted("roundEnd", false)).toBe(false);
  });

  it("restarts the camera clock on every phase change", () => {
    const clock = createCinematicClock();
    expect(clock.tick("intro", 0.1)).toBe(0);
    expect(clock.tick("intro", 0.1)).toBeCloseTo(0.1);
    expect(clock.tick("fight", 0.1)).toBe(0);
  });
});
