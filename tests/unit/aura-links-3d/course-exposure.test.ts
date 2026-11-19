import { describe, expect, it } from "vitest";
import { COURSES } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import {
  agxDisplay,
  COURSE_LOOKS,
  expectedDisplayLuminance,
  hasBlackSky,
  SUBJECT_FACE_NORMAL
} from "../../../apps/showcase-aura-links-3d/src/game/lighting";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

/**
 * Derived exposure metric per course look (game/lighting.ts `expectedDisplayLuminance`):
 *
 *   display = agxDisplay(FRAME_CALIBRATION x 2^exposureEv x rowSurfaceRadiance(row, albedo, normal))
 *   rowSurfaceRadiance = luminance(albedo x (sum over key and rim of I x color x max(0, n.L) / pi
 *                                             + HDRI_UP_IRRADIANCE x hdri.intensity x (1 + n.y) / 2))
 *
 * FRAME_CALIBRATION (0.45, about -1.15 EV) is fitted on the 2026-11-18 real-GPU tee frames of the four day courses; there
 * the metric lands within 0.04 of the measured turf luma (St Auroras 0.29, Maple 0.41, Cinder 0.26, Cloud 0.43). Mare
 * measured 0.27 with its ball a dark blue-grey disc: the sun backlit every tee. The bands below are the course's mood
 * (cold sunrise, dusk and floodlit night sit lower) and keep every course out of crushed and blown territory.
 */

const IDS = Object.keys(COURSES) as CourseId[];
const BALL = "#fcfdfa";

/** display-luma band of the fairway (ground) per course */
const GROUND_BAND: Record<CourseId, readonly [number, number]> = {
  stAuroras: [0.24, 0.4],
  mapleHollow: [0.35, 0.55],
  cinderRim: [0.22, 0.38],
  cloudTerrace: [0.35, 0.55],
  neonBay: [0.25, 0.45],
  // owner brief: bright sunlit grey regolith at mid-high luminance under a black sky
  mareCourse: [0.45, 0.65]
};

describe("Aura Links course exposure (derived ground luminance)", () => {
  it("agxDisplay is the AgX grey curve: monotonic, mid grey near 0.5, never above 1", () => {
    expect(agxDisplay(0.18)).toBeGreaterThan(0.45);
    expect(agxDisplay(0.18)).toBeLessThan(0.55);
    let last = -1;
    for (let ev = -12; ev <= 4; ev += 0.25) {
      const v = agxDisplay(2 ** ev);
      expect(v).toBeGreaterThanOrEqual(last - 1e-9);
      expect(v).toBeLessThanOrEqual(1);
      last = v;
    }
  });

  it("every course's fairway sits in its band: none crushed (< 0.22) or blown (> 0.7)", () => {
    for (const id of IDS) {
      const ground = expectedDisplayLuminance(COURSE_LOOKS[id], COURSES[id].palette.fairway);
      const [lo, hi] = GROUND_BAND[id];
      expect(ground, `${id} ground ${ground.toFixed(3)}`).toBeGreaterThanOrEqual(lo);
      expect(ground, `${id} ground ${ground.toFixed(3)}`).toBeLessThanOrEqual(hi);
      expect(ground, id).toBeGreaterThanOrEqual(0.22);
      expect(ground, id).toBeLessThanOrEqual(0.7);
    }
  });

  it("the white ball's camera-facing side reads light on every course (Mare's backlit ball was 0.26)", () => {
    for (const id of IDS) {
      const face = expectedDisplayLuminance(COURSE_LOOKS[id], BALL, SUBJECT_FACE_NORMAL);
      const ground = expectedDisplayLuminance(COURSE_LOOKS[id], COURSES[id].palette.fairway);
      expect(face, `${id} ball face ${face.toFixed(3)}`).toBeGreaterThanOrEqual(0.5);
      expect(face, `${id} ball face ${face.toFixed(3)}`).toBeLessThanOrEqual(0.92);
      // the ball is the brightest thing on the turf
      expect(face - ground, id).toBeGreaterThan(0.15);
    }
  });

  it("Mare: harsh sun in front of the figures (not behind them), earthshine from the far side, black sky", () => {
    const row = COURSE_LOOKS.mareCourse;
    // holes play toward +Z: the sun stands behind the address camera, the earthshine ahead of it
    const sunZ = Math.cos((row.sun.azimuthDeg * Math.PI) / 180);
    expect(sunZ).toBeLessThan(-0.5);
    expect(Math.cos((row.rim!.azimuthDeg * Math.PI) / 180)).toBeGreaterThan(0.5);
    expect(row.rim!.intensity).toBeLessThan(row.key.intensity * 0.15);
    expect(row.background).toBe("#000000");
    expect(row.fog).toBeNull();
    expect(row.hdri.id).toBe("deep_space_starfield");
    expect(IDS.filter((id) => hasBlackSky(COURSE_LOOKS[id]))).toEqual(["mareCourse"]);
  });
});
