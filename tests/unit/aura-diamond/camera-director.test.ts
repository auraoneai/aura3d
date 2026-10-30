import { describe, expect, it } from "vitest";
import {
  CameraDirector,
  halfInningShot,
  homeRunShot,
  introShot,
  shotPose,
  walkupShot,
  type Shot
} from "../../../apps/showcase-aura-diamond-3d/art/cameraDirector";
import { fenceRadius, PARKS, PARK_ORDER, type ParkId, type Vec3 } from "../../../apps/showcase-aura-diamond-3d/src/rules";

const shotsOf = (park: ParkId): Shot[] => [
  introShot(PARKS[park]),
  walkupShot(),
  homeRunShot(PARKS[park], [-38, 0, -105]),
  homeRunShot(PARKS[park], [12, 0, -140]),
  halfInningShot()
];

describe("aura-diamond camera director (DIA-C1)", () => {
  it("keeps every sequence short; the home run runs at most 4.5 s", () => {
    for (const park of PARK_ORDER) {
      for (const shot of shotsOf(park)) {
        expect(shot.duration).toBeLessThanOrEqual(4.5);
        expect(shot.keys.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("never frames from inside geometry: the eye stays inside the bowl or above the stands, clear of the batter", () => {
    const batter: Vec3 = [-0.6, 1.15, 0.4];
    for (const park of PARK_ORDER) {
      for (const shot of shotsOf(park)) {
        for (let u = 0; u <= 1.0001; u += 0.05) {
          const { eye, fov } = shotPose(shot, u);
          const r = Math.hypot(eye[0], eye[2]);
          const theta = (Math.atan2(eye[0], -eye[2]) * 180) / Math.PI;
          const insideBowl = eye[2] > 0 || r < fenceRadius(PARKS[park], theta) - 2;
          expect(insideBowl || eye[1] > 25).toBe(true);
          expect(eye[1]).toBeGreaterThan(1.5);
          expect(Math.hypot(eye[0] - batter[0], eye[1] - batter[1], eye[2] - batter[2])).toBeGreaterThan(3);
          expect(fov).toBeGreaterThan(20);
          expect(fov).toBeLessThan(60);
        }
      }
    }
  });

  it("lets a home run take over a walk-up, not the other way round, and ends any shot when play turns interactive", () => {
    const d = new CameraDirector(false);
    expect(d.play(walkupShot(), 0)).toBe(true);
    expect(d.play(homeRunShot(PARKS.sandlot, [0, 0, -110]), 0.2)).toBe(true);
    expect(d.play(walkupShot(), 0.3)).toBe(false);
    expect(d.active).toBe("homerun");
    expect(d.update(0.4, false)?.kind).toBe("homerun");
    expect(d.update(0.5, true)).toBeNull();
    expect(d.active).toBeNull();
    expect(d.played).toMatchObject({ walkup: 1, homerun: 1 });
  });

  it("draws letterbox bars only in the home-run sequence, eased in and out, and ends on time or on skip", () => {
    const d = new CameraDirector(false);
    d.play(homeRunShot(PARKS.canyon, [20, 0, -120]), 10);
    expect(d.update(10, false)?.bars).toBe(0);
    expect(d.update(11.6, false)?.bars).toBe(1);
    expect(d.update(13.3, false)).toBeNull();
    d.play(halfInningShot(), 20);
    expect(d.update(20.5, false)?.bars).toBe(0);
    d.skip();
    expect(d.update(20.6, false)).toBeNull();
  });

  it("turns sequences into cuts under reduced motion: no intro or half-inning sweep, held walk-up and home run", () => {
    const d = new CameraDirector(true);
    expect(d.play(introShot(PARKS.ivy), 0)).toBe(false);
    expect(d.play(halfInningShot(), 0)).toBe(false);
    expect(d.play(walkupShot(), 0)).toBe(true);
    const a = d.update(0.1, false)!;
    const b = d.update(1.4, false)!;
    expect(a.pose).toEqual(b.pose);
    d.skip();
    d.play(homeRunShot(PARKS.dome, [0, 0, -100]), 5);
    const h1 = d.update(5.05, false)!;
    const h2 = d.update(7.5, false)!;
    expect(h1.pose).toEqual(h2.pose);
    expect(h1.bars).toBe(1);
  });

  it("blurs motion on the home-run track only, and never under reduced motion (DIA-P2)", () => {
    const live = new CameraDirector(false);
    live.play(walkupShot(), 0);
    expect(live.update(0.5, false)!.motionBlur).toBe(false);
    live.play(homeRunShot(PARKS.sandlot, [10, 0, -120]), 1);
    expect(live.update(1.5, false)!.motionBlur).toBe(true);
    for (const shot of [introShot(PARKS.ivy), walkupShot(), halfInningShot()]) expect(shot.motionBlur ?? false).toBe(false);
    const calm = new CameraDirector(true);
    calm.play(homeRunShot(PARKS.sandlot, [10, 0, -120]), 0);
    expect(calm.update(0.5, false)!.motionBlur).toBe(false);
  });
});
