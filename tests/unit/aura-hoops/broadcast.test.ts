import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  INTRO_SECONDS, LIVE_CAM, REPLAY_RATE, REPLAY_SECONDS, REPLAY_SOURCE_SECONDS, ReplayRing, createBroadcast, introRail, railPose, replayPose, replaySourceTime
} from "../../../apps/showcase-aura-hoops-3d/src/broadcast";
import { COURT_IDS } from "../../../apps/showcase-aura-hoops-3d/src/courtRigs";

const MAIN = readFileSync(path.resolve(__dirname, "../../../apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");

/** The poles main.ts `cameraObstacles` avoids (x, z, radius) with their height; Manila has none on the new look. */
const POLES: Record<string, readonly [number, number, number, number][]> = {
  rucker: [[-11, -7, 2.2, 9.2], [11, -7, 2.2, 9.2], [-11, 13, 2.2, 9.2], [11, 13, 2.2, 9.2]],
  shanghai: [[-9, -3.2, 1.8, 4.6], [9, -3.2, 1.8, 4.6], [-9, 11.5, 1.8, 4.6], [9, 11.5, 1.8, 4.6], [-12, 4, 1.8, 4.6], [12, 4, 1.8, 4.6]],
  venice: [[-12, -8, 2.2, 6.4], [12.5, -10, 2.2, 7.7], [-14, 12, 2.2, 5.8], [14, 14, 2.2, 6.8], [-9, 16, 2.2, 5.2]]
};

function segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

describe("Aura Hoops broadcast camera (H47-C1 / H47-P2)", () => {
  it("every court has a 6 s rail whose first and last eyes stand >= 8 m apart", () => {
    expect(INTRO_SECONDS).toBe(6);
    for (const court of COURT_IDS) {
      const rail = introRail(court);
      expect(rail.length).toBeGreaterThanOrEqual(3);
      const a = rail[0]!, b = rail[rail.length - 1]!;
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThanOrEqual(8);
      expect(railPose(court, 0).eye).toEqual(a);
      const end = railPose(court, INTRO_SECONDS);
      for (let i = 0; i < 3; i++) expect(end.eye[i]).toBeCloseTo(b[i]!, 6);
    }
  });

  it("intro eyes never stand in, or look through, a pole below its top", () => {
    for (const court of COURT_IDS) {
      for (let t = 0; t <= INTRO_SECONDS; t += 0.1) {
        const { eye, target } = railPose(court, t);
        for (const [px, pz, r, h] of POLES[court] ?? []) {
          if (eye[1] > h) continue;
          expect(Math.hypot(eye[0] - px, eye[2] - pz), `${court} t=${t.toFixed(1)}`).toBeGreaterThan(r);
          expect(segDist(eye[0], eye[2], target[0], target[2], px, pz), `${court} sight t=${t.toFixed(1)}`).toBeGreaterThan(r * 0.5);
        }
      }
    }
  });

  it("the replay runs 2.4 s at 0.4x over the last 0.96 s of play", () => {
    expect(REPLAY_SECONDS).toBe(2.4);
    expect(REPLAY_RATE).toBe(0.4);
    expect(REPLAY_SOURCE_SECONDS).toBeCloseTo(0.96, 9);
    expect(replaySourceTime(0)).toBeCloseTo(-0.96, 9);
    expect(replaySourceTime(REPLAY_SECONDS)).toBeCloseTo(0, 9);
    const pose = replayPose(1.2, [0, 3, -0.5], [0, 3.05, -0.4]);
    expect(pose.eye[1]).toBeLessThan(2);
    expect(pose.fov).toBeLessThan(32);
  });

  it("the ring returns the step nearest the requested source time", () => {
    const ring = new ReplayRing(4);
    for (let i = 0; i < 6; i++) ring.push({ time: i * 0.25, athletes: [], ball: [i, 0, 0] });
    expect(ring.size).toBe(4);
    expect(ring.at(0)?.ball[0]).toBe(5);
    expect(ring.at(-0.5)?.ball[0]).toBe(3);
    expect(ring.at(-9)?.ball[0]).toBe(2);
    const snap = ring.snapshot();
    ring.clear();
    expect(snap.size).toBe(4);
  });

  it("shots end on time, skip at once, and DOF / motion blur run only during a shot", () => {
    const b = createBroadcast({ disabled: false });
    expect(b.post()).toEqual({ depthOfField: false, motionBlur: false });
    expect(b.startIntro("rucker")).toBe(true);
    expect(b.post([0, 0, 10], [0, 0, 0])).toEqual({ depthOfField: true, motionBlur: true, focusDistance: 10 });
    for (let i = 0; i < 60; i++) b.update(0.1);
    expect(b.active).toBe(true);
    expect(b.update(0.1)).toBeNull();
    expect(b.active).toBe(false);
    b.startReplay();
    expect(b.post().motionBlur).toBe(false);
    expect(b.post().depthOfField).toBe(true);
    b.skip();
    expect(b.active).toBe(false);
    expect(b.update(0.016)).toBeNull();
  });

  it("the intro runs on wall-clock time at 1-2 fps (software WebGL2), capped at 1 s a frame", () => {
    const b = createBroadcast({ disabled: false });
    b.startIntro("orbit");
    for (let i = 0; i < 11; i++) b.update(0.5);
    expect(b.active).toBe(true);
    expect(b.update(0.5)).toBeNull();
    b.startIntro("orbit");
    for (let i = 0; i < 5; i++) b.update(30);
    expect(b.active).toBe(true);
  });

  it("reduced motion and the measurement paths disable intros and replays", () => {
    const off = createBroadcast({ disabled: true });
    expect(off.startIntro("orbit")).toBe(false);
    expect(off.startReplay()).toBe(false);
    expect(MAIN).toMatch(/LOOK_PARAM === "original" \|\|/);
    expect(MAIN).toMatch(/const BROADCAST_OFF = BOOT_LOOK_ORIGINAL \|\|[^;]*intro"\) === "0"[^;]*diag"\) === "1"[^;]*simsteps[^;]*reducedMotion[^;]*prefers-reduced-motion/s);
  });

  it("the live lens is long (fov 30-34) and the replay only follows a Jam dunk", () => {
    expect(LIVE_CAM.chase.fov).toBeGreaterThanOrEqual(30);
    expect(LIVE_CAM.chase.fov).toBeLessThanOrEqual(34);
    expect(LIVE_CAM.shot.fov).toBeLessThanOrEqual(34);
    expect(LIVE_CAM.shot.offset[1]).toBeCloseTo(4.9 - 2, 6);
    expect(MAIN).toMatch(/cue\("fireIgnite"\);\s*jamDunkPending = true;/);
    expect(MAIN.match(/broadcast\.startReplay\(\)/g)).toHaveLength(1);
  });
});
