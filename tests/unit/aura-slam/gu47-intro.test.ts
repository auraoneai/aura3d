/**
 * GU47 TT-C2: the broadcast director's match intro (4 s, 3 shots) and changeover shot (2 s), letterboxed, skippable,
 * ending on the TT-C1 broadcast pose; reduced motion holds each shot still. Presentation only.
 */
import { describe, expect, it } from "vitest";
import { CAMERA_V2 } from "../../../examples/aura-slam/view/camera";
import {
  CHANGEOVER_SECONDS, CHANGEOVER_SHOTS, CUT_WALL_SLACK, INTRO_SECONDS, INTRO_SHOTS, createBroadcastDirector, introParam, shotAt
} from "../../../examples/aura-slam/view/intro";

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const serve = (games = 0) => ({ mode: "playing", phase: "serve", score: { playerGames: games, aiGames: 0 } });
const DT = 1 / 60;

describe("GU47 TT-C2: match intro and changeover", () => {
  it("the intro is 4 s over 3 shots, the changeover 2 s over 1", () => {
    expect(INTRO_SHOTS).toHaveLength(3);
    expect(INTRO_SECONDS).toBeCloseTo(4, 9);
    expect(CHANGEOVER_SHOTS).toHaveLength(1);
    expect(CHANGEOVER_SECONDS).toBeCloseTo(2, 9);
  });

  it("?intro=1: the shot at 1.5 s is >= 10 m from the broadcast eye", () => {
    const f = shotAt(INTRO_SHOTS, 1.5)!;
    expect(f).not.toBeNull();
    expect(dist(f.pose.eye, CAMERA_V2.eye)).toBeGreaterThanOrEqual(10);
    expect(introParam("?intro=1")).toBe("boot");
    expect(introParam("?intro=0")).toBe("off");
    expect(introParam("")).toBe("auto");
  });

  it("a match start plays the intro through, then hands back to the broadcast pose (null frame)", () => {
    const d = createBroadcastDirector();
    expect(d.step({ mode: "menu", phase: "menu" }, DT, false)).toBeNull();
    let frames = 0;
    let frame = d.step(serve(), DT, false);
    while (frame) { frames += 1; frame = d.step(serve(), DT, false); expect(frames).toBeLessThan(400); }
    expect(frames).toBeGreaterThanOrEqual(Math.floor(INTRO_SECONDS / DT) - 2);
    expect(d.active).toBeNull();
    expect(d.played.intro).toBe(1);
  });

  it("a boot intro (?intro=1) plays over the menu", () => {
    const d = createBroadcastDirector();
    d.start("intro");
    expect(d.step({ mode: "menu", phase: "menu" }, DT, false)).not.toBeNull();
    // dt is clamped to 0.25 s per frame (a stalled tab never skips a shot): six more frames reach 1.5 s.
    let f = null;
    for (let i = 0; i < 6; i++) f = d.step({ mode: "menu", phase: "menu" }, 0.25, false);
    expect(f?.shot).toBe("far-baseline");
  });

  it("a slow renderer (seconds per frame) ends the cut after CUT_WALL_SLACK x its length in wall-clock time", () => {
    const d = createBroadcastDirector();
    d.start("intro");
    // Software WebGL2 pace: frame dt clamps to 0.05 s, but each frame takes 3 s of real time.
    let f = d.step(serve(), 0.05, false, 3);
    expect(f).not.toBeNull();
    for (let i = 0; i < 2; i++) f = d.step(serve(), 0.05, false, 3);
    expect(f).toBeNull();
    expect(d.active).toBeNull();
    expect(3 * 3).toBeGreaterThan(INTRO_SECONDS * CUT_WALL_SLACK);
    // At 60 fps the wall clock matches the frame clock, so the whole intro still plays.
    const e = createBroadcastDirector();
    e.start("intro");
    let frames = 0;
    while (e.step(serve(), DT, false, DT)) { frames += 1; expect(frames).toBeLessThan(400); }
    expect(frames).toBeGreaterThanOrEqual(Math.floor(INTRO_SECONDS / DT) - 2);
  });

  it("skip ends the cut on the next frame; the ball in play ends it too", () => {
    const d = createBroadcastDirector();
    d.step({ mode: "menu" }, DT, false);
    expect(d.step(serve(), DT, false)).not.toBeNull();
    d.skip();
    expect(d.step(serve(), DT, false)).toBeNull();
    expect(d.played.skipped).toBe(1);

    const e = createBroadcastDirector();
    e.start("intro");
    expect(e.step(serve(), DT, false)).not.toBeNull();
    expect(e.step({ mode: "playing", phase: "rally" }, DT, false)).toBeNull();
    expect(e.active).toBeNull();
  });

  it("a changeover shot plays after odd games only", () => {
    const d = createBroadcastDirector({ autoIntro: false });
    d.step(serve(0), DT, false);
    expect(d.step(serve(1), DT, false)?.shot).toBe("changeover-stands");
    d.skip();
    d.step(serve(1), DT, false);
    expect(d.step(serve(2), DT, false)).toBeNull();
    expect(d.step(serve(3), DT, false)?.shot).toBe("changeover-stands");
    expect(d.played.changeover).toBe(2);
  });

  it("reduced motion: every shot holds its opening framing (cuts only)", () => {
    for (const shots of [INTRO_SHOTS, CHANGEOVER_SHOTS]) {
      let start = 0;
      for (const shot of shots) {
        for (const k of [0.1, 0.5, 0.9]) {
          const f = shotAt(shots, start + shot.seconds * k, true)!;
          expect(f.pose.eye).toEqual(shot.from.eye);
          expect(f.fov).toBe(shot.fovFrom);
        }
        start += shot.seconds;
      }
    }
  });
});
