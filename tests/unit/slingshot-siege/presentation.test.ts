// GU47 WP-22 (lane g12): pure presentation helpers — the signature tilt-shift band (SS47-P1) and the E-I QA crops.
import { describe, expect, it } from "vitest";
import {
  INTRO_CUT_SECONDS, INTRO_SECONDS, QA_WORLD_BOXES, bandChanged, boxCorners, introEnabled, introShot, releaseKick, screenCrop, tiltShiftBand
} from "../../../apps/showcase-slingshot-siege/src/game/presentation";

describe("slingshot-siege tilt-shift band (SS47-P1)", () => {
  it("holds every point inside the band and never drops below the chapter width", () => {
    const ys = [0.42, 0.55, 0.61, 0.48];
    const band = tiltShiftBand(ys, 0.32);
    expect(band.bandWidth).toBeGreaterThanOrEqual(0.32);
    for (const y of ys) expect(Math.abs(y - band.bandCenter)).toBeLessThanOrEqual(band.bandWidth / 2);
  });

  it("widens for a high arc but caps at 0.62 so the frame never turns all sharp", () => {
    expect(tiltShiftBand([0.1, 0.5], 0.3).bandWidth).toBeCloseTo(0.56, 3);
    expect(tiltShiftBand([0.0, 0.95], 0.3).bandWidth).toBe(0.62);
  });

  it("falls back to the authored band when nothing projects, and patches only on real movement", () => {
    expect(tiltShiftBand([], 0.34)).toEqual({ bandCenter: 0.52, bandWidth: 0.34 });
    const a = tiltShiftBand([0.5], 0.3);
    expect(bandChanged(null, a)).toBe(true);
    expect(bandChanged(a, { bandCenter: a.bandCenter + 0.002, bandWidth: a.bandWidth })).toBe(false);
    expect(bandChanged(a, { bandCenter: a.bandCenter + 0.02, bandWidth: a.bandWidth })).toBe(true);
  });
});

describe("slingshot-siege QA crops (E-I)", () => {
  it("normalises projected points to a clamped 0..1 rect with a valid crop name", () => {
    const c = screenCrop("fort", [{ x: 640, y: 200 }, { x: 900, y: 420 }], 1280, 720, 0)!;
    expect(c).toEqual({ name: "fort", x: 0.5, y: 0.2778, w: 0.2031, h: 0.3056 });
    expect(/^[a-z0-9][a-z0-9_-]{0,31}$/.test(c.name)).toBe(true);
    const clipped = screenCrop("sea", [{ x: -50, y: 700 }, { x: 200, y: 900 }], 1280, 720, 0)!;
    expect(clipped.x).toBe(0);
    expect(clipped.y + clipped.h).toBeLessThanOrEqual(1);
  });

  it("drops points behind the camera and empty crops", () => {
    expect(screenCrop("fort", [{ x: 10, y: 10, behind: true }], 100, 100)).toBeNull();
    expect(screenCrop("fort", [], 100, 100)).toBeNull();
  });

  it("box corners span the box; the fixed boxes are well formed", () => {
    expect(boxCorners([0, 0, 0], [1, 2, 3])).toHaveLength(8);
    for (const box of Object.values(QA_WORLD_BOXES)) for (let i = 0; i < 3; i += 1) expect(box.max[i]!).toBeGreaterThanOrEqual(box.min[i]!);
  });
});

describe("slingshot-siege intro and release kick (SS47-C1, PRD §6.3)", () => {
  it("frames the fort wide, then cuts to the sling, inside 3 s", () => {
    expect(INTRO_SECONDS).toBe(3);
    expect(introShot(0).shot).toBe("fort");
    expect(introShot(INTRO_CUT_SECONDS - 0.01).shot).toBe("fort");
    expect(introShot(INTRO_CUT_SECONDS).shot).toBe("sling");
    expect(introShot(0).tgt[0]).toBeGreaterThan(5);
    expect(introShot(2.5).tgt[0]).toBeLessThan(-6);
  });

  it("reduced motion, demo and ?intro=0 skip the intro; reduced motion has no FOV kick or punch", () => {
    expect(introEnabled({ reducedMotion: false, demo: false, param: null })).toBe(true);
    expect(introEnabled({ reducedMotion: true, demo: false, param: null })).toBe(false);
    expect(introEnabled({ reducedMotion: false, demo: true, param: null })).toBe(false);
    expect(introEnabled({ reducedMotion: false, demo: false, param: "0" })).toBe(false);
    expect(releaseKick(true)).toEqual({ fovDeg: 0, punch: 0 });
    expect(releaseKick(false).fovDeg).toBeGreaterThan(0);
  });
});
