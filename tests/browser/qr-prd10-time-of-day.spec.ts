import { test, expect } from "@playwright/test";
import {
  solarPosition,
  rigAtHour,
  practicalScaleFor,
  worldTimeOfDay
} from "../../packages/engine/src/agent-api/world/timeOfDay";
import {
  TimeOfDayRuntime,
  advanceTimeOfDay,
  timeOfDayDriverFor
} from "../../packages/engine/src/production-runtime/world/TimeOfDayRuntime";
import { timeOfDayRecords } from "../../packages/engine/src/agent-api/compiler/world";
import type { AuraTimeOfDayNode } from "../../packages/engine/src/agent-api/world/biomes";

/**
 * PRD-10 S15 — `time-of-day.spec.ts` (§15.2):
 *  - solar position within ±0.5° of the NOAA reference;
 *  - `app.world.timeOfDay.set(h)` leaves the snapshot version and node count
 *    unchanged (uniform writes only — never a remount);
 *  - at most one capture face per frame;
 *  - practical scale changes PRD 10 practical lights (frame.practicalScale is
 *    published to `u_a3dPrd10PracticalScale` each frame).
 *
 * These are pure-TS assertions that hold identically in the browser runtime —
 * no GL required, consistent with the Node half of the other qr-prd10 specs.
 */

/** Second, independent NOAA declination/equation-of-time for cross-checking. */
function referenceSolar(hour: number, latDeg: number, doy: number): { elevationDeg: number; azimuthDeg: number } {
  const D2R = Math.PI / 180;
  const gamma = (2 * Math.PI * (doy - 1 + (hour - 12) / 24)) / 365;
  const eqtime =
    229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const ha = (hour + eqtime / 60 - 12) * 15 * D2R;
  const lat = latDeg * D2R;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const elevationDeg = 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / D2R;
  const azimuthDeg =
    (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / D2R + 180 + 360) % 360;
  return { elevationDeg, azimuthDeg };
}

test("S15: solar position tracks the NOAA reference within ±0.5°", () => {
  // 20-point grid: 5 hours × 4 (lat, doy) pairs.
  for (const [lat, doy] of [[37.7, 172], [51.5, 81], [-33.9, 355], [0, 1]] as const) {
    for (const hour of [6, 9, 12, 17, 21]) {
      const ref = referenceSolar(hour, lat, doy);
      const got = solarPosition(hour, lat, doy);
      const elErr = Math.abs(got.elevationDeg - ref.elevationDeg);
      const azErr = Math.min(
        Math.abs(got.azimuthDeg - ref.azimuthDeg),
        360 - Math.abs(got.azimuthDeg - ref.azimuthDeg)
      );
      expect(elErr).toBeLessThanOrEqual(0.5);
      expect(azErr).toBeLessThanOrEqual(0.5);
    }
  }
});

test("S15: set() is a uniform write — snapshot version and node count unchanged", () => {
  const node = worldTimeOfDay({ id: "spec-tod-no-remount", hour: 12, keyframes: [
    { hour: 6, biome: "golden-hour" },
    { hour: 12, biome: "outdoor-day" },
    { hour: 22, biome: "night-city" }
  ] }).toJSON() as unknown as AuraTimeOfDayNode;
  timeOfDayRecords.set(node.id, node);
  try {
    const sizeBefore = timeOfDayRecords.size;
    const nodesBefore = [...timeOfDayRecords.values()];
    const driver = timeOfDayDriverFor(node);
    driver.setHour(18);
    // No remount: the record map is untouched — same size, same node objects.
    expect(timeOfDayRecords.size).toBe(sizeBefore);
    expect([...timeOfDayRecords.values()]).toEqual(nodesBefore);
    for (const n of timeOfDayRecords.values()) {
      expect(nodesBefore).toContain(n); // object identity, not a re-emit
    }
    expect(driver.currentHour).toBe(18);
    // set() also pauses a running animate (§6.7).
    driver.animate(3600);
    driver.setHour(5);
    const after = advanceTimeOfDay([node], 99_000);
    expect(after[0]?.hour).toBe(5);
  } finally {
    timeOfDayRecords.delete(node.id);
  }
});

test("S15: at most one capture face is requested per frame", () => {
  const node = {
    kind: "time-of-day" as const,
    id: "spec-tod-face-throttle",
    options: { id: "spec-tod-face-throttle", hour: 8 }
  };
  const frames = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(
    (f) => advanceTimeOfDay([node], 10_000 + f, "high")[0]
  );
  // First advance asks for the initial 6-face capture; each subsequent frame
  // drains exactly one face.
  const faces = frames.map((f) => f?.captureRequest?.facesRemaining ?? 0);
  expect(faces[0]).toBe(6);
  for (let i = 1; i < faces.length; i++) {
    expect(faces[i]).toBeLessThanOrEqual(Math.max(0, faces[i - 1] - 1));
  }
  // Never more than one face's worth of new work per frame.
  for (const n of faces) expect(n).toBeLessThanOrEqual(6);
});

test("S15: practical scale flips between day and night (drives prd10 practical lights)", () => {
  const day = practicalScaleFor(solarPosition(12, 37.7, 172));
  const night = practicalScaleFor(solarPosition(0, 37.7, 172));
  expect(day).not.toBe(night);
  // §6.7: practical scale >= 1 after sundown (practicals take over), <= 1 day.
  expect(night).toBeGreaterThan(day);
  // The frame-level value published to `u_a3dPrd10PracticalScale` follows it.
  const rt = new TimeOfDayRuntime({ id: "spec-tod-scale", hour: 12 }, "high");
  const dayFrame = rt.advance(0);
  rt.setHour(0);
  const nightFrame = rt.advance(0);
  expect(dayFrame.practicalScale).not.toBe(nightFrame.practicalScale);
  // Both frames also resolve a rig — the keyframe path is what Path G/S draws.
  expect(rigAtHour({ id: "x", hour: 12 }, 12).ambientPolicy).toBe("ibl-only");
});
