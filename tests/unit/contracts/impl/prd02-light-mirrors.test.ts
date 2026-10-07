/**
 * PRD-02 item 1911 — CPU mirrors match three r185 within 1e-6:
 *   - `a3dDistanceFalloff` vs `getDistanceAttenuation`,
 *     d ∈ {0.05, 0.3, 1, 5, 20} m, decay ∈ {0, 1, 2}
 *   - `a3dHemisphereIrradiance` vs `getHemisphereLightIrradiance`,
 *     default +Y direction and `position: [1, 0, 0]`.
 * three formulas transcribed from node_modules/three@0.185.1
 * lights_pars_begin.glsl.js (r185).
 */
import { describe, expect, it } from "vitest";
import {
  a3dDistanceFalloff,
  a3dHemisphereIrradiance
} from "../../../../packages/rendering/src/shaders/chunks/lighting_mirrors";

// ---- three r185 references (verbatim ports for assertion) ----
const threeDistanceAttenuation = (d: number, cutoff: number, decay: number): number => {
  let falloff = 1.0 / Math.max(Math.pow(d, decay), 0.01);
  if (cutoff > 0.0) {
    const x = Math.min(Math.max(1.0 - Math.pow(d / cutoff, 4.0), 0.0), 1.0);
    falloff *= x * x;
  }
  return falloff;
};

const threeHemisphereIrradiance = (
  sky: readonly [number, number, number],
  ground: readonly [number, number, number],
  dir: readonly [number, number, number],
  normal: readonly [number, number, number]
): readonly [number, number, number] => {
  const nl = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const norm = (v: readonly number[]) => {
    const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
    return [v[0]! / l, v[1]! / l, v[2]! / l];
  };
  const w = 0.5 * nl(norm(normal), norm(dir)) + 0.5;
  return [
    ground[0] + (sky[0] - ground[0]) * w,
    ground[1] + (sky[1] - ground[1]) * w,
    ground[2] + (sky[2] - ground[2]) * w
  ];
};

describe("PRD-02 §8 CPU mirrors vs three r185 (≤1e-6)", () => {
  it("a3dDistanceFalloff == getDistanceAttenuation for the spec grid", () => {
    for (const d of [0.05, 0.3, 1, 5, 20]) {
      for (const decay of [0, 1, 2]) {
        // Infinite range (cutoff 0) and a finite 4 m cutoff both covered.
        for (const cutoff of [0, 4]) {
          expect(a3dDistanceFalloff(d, cutoff, decay)).toBeCloseTo(
            threeDistanceAttenuation(d, cutoff, decay), 9
          );
        }
      }
    }
  });

  it("a3dHemisphereIrradiance == getHemisphereLightIrradiance (+Y and position [1,0,0])", () => {
    const sky: [number, number, number] = [0.9, 0.95, 1.0];
    const ground: [number, number, number] = [0.25, 0.2, 0.15];
    const normals: [number, number, number][] = [
      [0, 1, 0], [1, 0, 0], [0, -1, 0], [0.3, -0.7, 0.64]
    ];
    for (const dir of [[0, 1, 0] as const, [1, 0, 0] as const]) {
      for (const n of normals) {
        const ours = a3dHemisphereIrradiance(sky, ground, dir, n);
        const theirs = threeHemisphereIrradiance(sky, ground, dir, n);
        for (let i = 0; i < 3; i += 1) {
          expect(ours[i]).toBeCloseTo(theirs[i], 9);
        }
      }
    }
  });
});
