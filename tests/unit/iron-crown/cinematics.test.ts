/**
 * IRON CROWN GU47 IC47-C1: three intro shots, a K.O. orbit and a win hero shot, all letterboxed, inside the existing
 * phase windows; reduced motion turns the dolly and the orbit into static cuts. Camera only (pure functions).
 */
import { describe, expect, it } from "vitest";
import {
  cinematicPost,
  cinematicShot,
  createCinematicClock,
  FIGHT_LENS,
  hudSlamFor,
  INTRO_SECONDS,
  INTRO_SHOTS,
  letterboxWanted,
  POST_PULSE,
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

  it("IC47-C2: the fight lens sits at fov 40-45, lowered and aimed at the torsos", () => {
    expect(FIGHT_LENS.fov).toBeGreaterThanOrEqual(40);
    expect(FIGHT_LENS.fov).toBeLessThanOrEqual(45);
    expect(FIGHT_LENS.lift).toBeLessThan(0.82);
    expect(FIGHT_LENS.aim).toBeGreaterThan(0.72);
  });
});

describe("iron-crown cinematic post (GU47 IC47-P3)", () => {
  const shot = (name: "venue-dolly" | "p1-closeup" | "ko-orbit") =>
    cinematicShot({ ...base, phase: name === "ko-orbit" ? "ko" : "intro", t: name === "p1-closeup" ? INTRO_SHOTS.p1 + 0.1 : 0 });

  it("runs DOF only on the performed shots, focused on the subject", () => {
    expect(cinematicPost(null, Infinity, 0.2, false).dof).toBeNull();
    const close = cinematicPost(shot("p1-closeup"), Infinity, 0.2, false).dof!;
    expect(close.fStop).toBe(2);
    expect(close.focusDistance).toBeGreaterThan(2);
    expect(cinematicPost(shot("ko-orbit"), Infinity, 0.2, false).dof!.fStop).toBe(4);
  });

  it("pulses CA and vignette after a special or K.O., decaying to the venue base", () => {
    const at0 = cinematicPost(null, 0, 0.2, false);
    expect(at0.chromaticAberration).toBeCloseTo(POST_PULSE.chromaticAberration);
    expect(at0.vignette).toBeCloseTo(0.2 + POST_PULSE.vignette);
    const after = cinematicPost(null, POST_PULSE.seconds + 0.01, 0.2, false);
    expect(after.chromaticAberration).toBe(0);
    expect(after.vignette).toBe(0.2);
  });

  it("never pulses on reduced motion", () => {
    const cue = cinematicPost(null, 0, 0.2, true);
    expect(cue.chromaticAberration).toBe(0);
    expect(cue.vignette).toBe(0.2);
  });
});

describe("IRON CROWN HUD slams synced to the intro (IC47-H1)", () => {
  it("slams P1 on the P1 close-up, P2 on the P2 close-up and the timer when the fight lens returns", () => {
    expect(hudSlamFor(null, "venue-dolly")).toBeNull();
    expect(hudSlamFor("venue-dolly", "p1-closeup")).toBe("p1");
    expect(hudSlamFor("p1-closeup", "p1-closeup")).toBeNull();
    expect(hudSlamFor("p1-closeup", "p2-closeup")).toBe("p2");
    expect(hudSlamFor("p2-closeup", null)).toBe("center");
    expect(hudSlamFor("ko-orbit", null)).toBeNull();
    expect(hudSlamFor(null, null)).toBeNull();
  });

  it("walks one intro: three slams in order", () => {
    const slams: string[] = [];
    let prev: Parameters<typeof hudSlamFor>[0] = null;
    for (let t = 0; t <= INTRO_SECONDS + 0.2; t += 1 / 60) {
      const phase = t < INTRO_SECONDS ? "intro" : "fight";
      const shot = cinematicShot({ phase, t, p1: [-2.2, 0, 0], p2: [2.2, 0, 0], winner: null, reducedMotion: false });
      const slam = hudSlamFor(prev, shot?.name ?? null);
      prev = shot?.name ?? null;
      if (slam) slams.push(slam);
    }
    expect(slams).toEqual(["p1", "p2", "center"]);
  });
});
