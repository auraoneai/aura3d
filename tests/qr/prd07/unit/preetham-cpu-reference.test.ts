/**
 * Independently evaluated daylight limits from Preetham, Shirley and Smits,
 * "A Practical Analytic Model for Daylight" (1999), DOI 10.1145/311535.311545.
 * No reference renderer or external fixture is loaded.
 */
import { describe, expect, it } from "vitest";
import { preethamEvaluate, preethamFrame, sunDirection, type PreethamSpec } from "../../../../packages/rendering/src/atmosphere/PreethamSky";

const DAY: PreethamSpec = {
  model: "preetham",
  sun: { elevationDeg: 45, azimuthDeg: 180, discSize: 0 },
  turbidity: 4,
  rayleigh: 3,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8
};

describe("independent daylight model contracts", () => {
  it("uses +Y for zenith and azimuth from +Z toward +X", () => {
    const zenith = sunDirection({ elevationDeg: 90, azimuthDeg: 0 });
    expect(zenith[0]).toBeCloseTo(0, 12);
    expect(zenith[1]).toBeCloseTo(1, 12);
    expect(zenith[2]).toBeCloseTo(0, 12);
    const east = sunDirection({ elevationDeg: 0, azimuthDeg: 90 });
    expect(east[0]).toBeCloseTo(1, 12);
    expect(east[1]).toBeCloseTo(0, 12);
    expect(east[2]).toBeCloseTo(0, 12);
  });

  it("matches published zenith xyY at an overhead sun", () => {
    // Solar zenith angle theta is zero, reducing the published x/y cubics to
    // x_z = 0.00394*T + 0.25886 and y_z = 0.00516*T + 0.26688.
    const turbidity = 4;
    const frame = preethamFrame({ ...DAY, turbidity, sun: { elevationDeg: 90, azimuthDeg: 0, discSize: 0 } });
    const expectedY = (4.0453 * turbidity - 4.9710) * Math.tan((4 / 9 - turbidity / 120) * Math.PI) - 0.2155 * turbidity + 2.4192;
    expect(frame.zenithXyY[0]).toBeCloseTo(0.00394 * turbidity + 0.25886, 10);
    expect(frame.zenithXyY[1]).toBeCloseTo(0.00516 * turbidity + 0.26688, 10);
    expect(frame.zenithXyY[2]).toBeCloseTo(expectedY, 10);
  });

  it("produces finite nonnegative radiance in the hemisphere across weather and azimuth", () => {
    for (const turbidity of [2, 4, 6, 10]) {
      const frame = preethamFrame({ ...DAY, turbidity });
      for (const direction of [[0, 1, 0], [1, 0, 0], [0, 0.01, -1], [-1, 0.5, 0.3]] as const) {
        for (const channel of preethamEvaluate(frame, direction)) {
          expect(Number.isFinite(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("scales daylight with exposure and sun intensity without changing color ratios", () => {
    const direction = [0, 1, 0] as const;
    const base = preethamEvaluate(preethamFrame(DAY), direction);
    const doubledExposure = preethamEvaluate(preethamFrame({ ...DAY, exposure: 2 }), direction);
    const doubledIntensity = preethamEvaluate(preethamFrame({ ...DAY, sun: { ...DAY.sun, intensity: 2 } }), direction);
    for (let c = 0; c < 3; c += 1) {
      expect(base[c]).toBeGreaterThan(0);
      expect(doubledExposure[c]).toBeCloseTo(base[c]! * 2, 10);
      expect(doubledIntensity[c]).toBeCloseTo(base[c]! * 2, 10);
    }
  });

  it("respects sun disc, aerosol controls and lower-hemisphere ground color", () => {
    const withoutDisc = preethamFrame(DAY);
    const withDisc = preethamFrame({ ...DAY, sun: { ...DAY.sun, discSize: 0.02 } });
    const sunRay = withoutDisc.sunDirection;
    expect(preethamEvaluate(withDisc, sunRay)[0]).toBeGreaterThan(preethamEvaluate(withoutDisc, sunRay)[0]);
    const clear = preethamFrame({ ...DAY, mieCoefficient: 0 });
    const hazy = preethamFrame({ ...DAY, mieCoefficient: 0.05 });
    expect(preethamEvaluate(hazy, sunRay)[0]).toBeGreaterThan(preethamEvaluate(clear, sunRay)[0]);
    const ground = preethamFrame({ ...DAY, groundColor: [0.2, 0.4, 0.6] });
    const radiance = preethamEvaluate(ground, [0, -1, 0]);
    expect(radiance[0]).toBeCloseTo(0.008, 10);
    expect(radiance[1]).toBeCloseTo(0.016, 10);
    expect(radiance[2]).toBeCloseTo(0.024, 10);
  });
});
