import { describe, expect, it } from "vitest";
import { createLightingRig, listLightingRigPresets, resolveSubjectRimPlacement } from "../../../packages/rendering/src/LightingRig";

/**
 * Lighting rig placements must be able to follow the subject.
 *
 * ## Why this capability was added
 *
 * `createLightingRig` presets are authored for a subject roughly 1 unit tall, so every showcase route ignored
 * the placements and hand-authored its own coordinates: Turbo as `SCENE_SIZE` multiples, Blockfall and Aura
 * Clash as bare numbers, Skyline as bare numbers. The *structure* each route built was identical -- ambient,
 * key, opposing rims -- and only the coordinates differed, because each route re-derived where a rim belongs
 * for its own subject size.
 *
 * That is the same defect class as the framing constants this pass already removed: a coordinate that is
 * correct for one subject reads as a design decision, survives an asset swap, and is then silently wrong.
 * Turbo's `CAR_SCENE_HEIGHT` and its hand-tuned chase height both outlived their assets exactly that way.
 */

describe("lighting rig placements can follow the rendered subject", () => {
  it("leaves placements untouched when no subject is supplied", () => {
    // Backward compatibility is load-bearing: Aura Clash already calls this without a subject.
    const withoutSubject = createLightingRig({ preset: "urban-neon", intensityScale: 1.08, shadows: true });
    const positions = withoutSubject.lights.map((light) => light.position);
    expect(positions).toEqual([[-3, 4, 2.5], [3.2, 2.1, -1.2], [1, 5, -5]]);
  });

  it("scales placements proportionally with subject height", () => {
    const small = createLightingRig({ preset: "urban-neon", subject: { height: 0.5 } });
    const large = createLightingRig({ preset: "urban-neon", subject: { height: 3 } });
    for (const [index, light] of small.lights.entries()) {
      const scaled = large.lights[index]!;
      // Vertical and depth placement scale by the 6x height ratio.
      expect(scaled.position[1]).toBeCloseTo(light.position[1] * 6, 3);
      expect(scaled.position[2]).toBeCloseTo(light.position[2] * 6, 3);
    }
  });

  it("places lateral rims from the subject's widest horizontal extent, not its height", () => {
    /*
     * A rim only does its job if it reaches the silhouette edge. A wide, low subject (a car) needs its rims
     * further out than its height alone would suggest, which is why lateral placement follows width.
     */
    const narrow = createLightingRig({ preset: "urban-neon", subject: { height: 1, width: 1 } });
    const wide = createLightingRig({ preset: "urban-neon", subject: { height: 1, width: 4 } });
    const narrowX = Math.abs(narrow.lights[0]!.position[0]);
    const wideX = Math.abs(wide.lights[0]!.position[0]);
    expect(wideX).toBeGreaterThan(narrowX);
    // Height and depth are unaffected by width.
    expect(wide.lights[0]!.position[1]).toBeCloseTo(narrow.lights[0]!.position[1], 4);
  });

  it("lifts the rig onto the subject's floor plane", () => {
    // Routes place subjects on a track or platform surface, not on world zero.
    const grounded = createLightingRig({ preset: "urban-neon", subject: { height: 1, floorY: -0.12 } });
    const atZero = createLightingRig({ preset: "urban-neon", subject: { height: 1, floorY: 0 } });
    for (const [index, light] of grounded.lights.entries()) {
      expect(light.position[1]).toBeCloseTo(atZero.lights[index]!.position[1] - 0.12, 4);
    }
  });

  it("does not change intensities with subject size", () => {
    // A rig that dimmed as subjects grew would make large subjects dark for no photographic reason.
    const baseline = createLightingRig({ preset: "urban-neon" }).lights.map((light) => light.intensity);
    for (const height of [0.25, 1, 12]) {
      const scaled = createLightingRig({ preset: "urban-neon", subject: { height } });
      expect(scaled.lights.map((light) => light.intensity)).toEqual(baseline);
    }
  });

  it("keeps intensityScale independent of subject scaling", () => {
    const dim = createLightingRig({ preset: "urban-neon", intensityScale: 0.5, subject: { height: 2 } });
    const bright = createLightingRig({ preset: "urban-neon", intensityScale: 1, subject: { height: 2 } });
    for (const [index, light] of dim.lights.entries()) {
      expect(light.intensity).toBeCloseTo(bright.lights[index]!.intensity * 0.5, 3);
      // ...and the placement is identical, since only exposure changed.
      expect(light.position).toEqual(bright.lights[index]!.position);
    }
  });

  it("works for every published preset", () => {
    // A capability that only worked for one preset would push routes straight back to hand-authoring.
    for (const preset of listLightingRigPresets()) {
      const rig = createLightingRig({ preset, subject: { height: 2, width: 3, floorY: -0.5 } });
      expect(rig.lights.length, `${preset} light count`).toBeGreaterThan(0);
      for (const light of rig.lights) {
        expect(light.position.every((value) => Number.isFinite(value)), `${preset} finite placement`).toBe(true);
      }
    }
  });

  it("is deterministic and safe for a degenerate subject", () => {
    const first = createLightingRig({ preset: "urban-neon", subject: { height: 0 } });
    const second = createLightingRig({ preset: "urban-neon", subject: { height: 0 } });
    expect(second.lights).toEqual(first.lights);
    for (const light of first.lights) {
      expect(light.position.every((value) => Number.isFinite(value))).toBe(true);
    }
  });

  it("preserves shadow and diagnostic behaviour alongside subject scaling", () => {
    const rig = createLightingRig({ preset: "urban-neon", shadows: false, subject: { height: 2 } });
    expect(rig.lights.some((light) => light.castsShadow)).toBe(false);
    expect(rig.diagnostics.preset).toBe("urban-neon");
    expect(rig.diagnostics.lightCount).toBe(rig.lights.length);
  });
});

describe("subject rim placement follows a moving subject", () => {
  /**
   * Aura Clash computed per-fighter rim placement inline as `(x ± 0.34, y + 1.22, -0.72)` with `range = 1.5`.
   * Against its 1.829-unit fighter rig those are 0.186x, 0.667x, -0.394x and 0.820x of subject height: correct
   * photographic ratios frozen as absolute numbers, and therefore silently wrong for any other rig — the rim
   * drifts off the silhouette and stops separating the subject from the backdrop, the one thing a rim does.
   */
  const FIGHTER_HEIGHT = 1.829;

  it("reproduces the previous hardcoded placement exactly for the current rig", () => {
    // Adoption must be a provable no-op, or a visual regression hides inside a refactor.
    for (const [x, y] of [[0, 0], [1.4, 0.55], [-2.1, 0.2]] as const) {
      const left = resolveSubjectRimPlacement({ subjectPosition: [x, y, 0], subjectHeight: FIGHTER_HEIGHT, side: "left" });
      const right = resolveSubjectRimPlacement({ subjectPosition: [x, y, 0], subjectHeight: FIGHTER_HEIGHT, side: "right" });
      expect(left.position[0]).toBeCloseTo(x - 0.34, 3);
      expect(right.position[0]).toBeCloseTo(x + 0.34, 3);
      for (const placement of [left, right]) {
        expect(placement.position[1]).toBeCloseTo(y + 1.22, 3);
        expect(placement.position[2]).toBeCloseTo(-0.72, 3);
        expect(placement.range).toBeCloseTo(1.5, 3);
      }
    }
  });

  it("scales placement and range with a different rig height", () => {
    const tall = resolveSubjectRimPlacement({ subjectPosition: [0, 0, 0], subjectHeight: 3, side: "left" });
    const short = resolveSubjectRimPlacement({ subjectPosition: [0, 0, 0], subjectHeight: 1, side: "left" });
    expect(tall.position[1]).toBeCloseTo(short.position[1] * 3, 3);
    expect(tall.range).toBeCloseTo(short.range * 3, 3);
    expect(Math.abs(tall.position[0])).toBeGreaterThan(Math.abs(short.position[0]));
  });

  it("places the rim behind the subject so it grazes the silhouette", () => {
    // A camera looking down -z means a negative depth offset is *behind* the subject. A positive value would
    // front-light the body and destroy the separation the rim exists to create.
    const placement = resolveSubjectRimPlacement({ subjectPosition: [0, 0, 0], subjectHeight: FIGHTER_HEIGHT, side: "left" });
    expect(placement.position[2]).toBeLessThan(0);
  });

  it("mirrors left and right about the subject", () => {
    const left = resolveSubjectRimPlacement({ subjectPosition: [5, 0, 0], subjectHeight: 2, side: "left" });
    const right = resolveSubjectRimPlacement({ subjectPosition: [5, 0, 0], subjectHeight: 2, side: "right" });
    expect(left.position[0] + right.position[0]).toBeCloseTo(10, 3);
    expect(left.position[1]).toBeCloseTo(right.position[1], 6);
    expect(left.position[2]).toBeCloseTo(right.position[2], 6);
  });

  it("honours explicit fractions when a caller needs different framing", () => {
    const custom = resolveSubjectRimPlacement({
      subjectPosition: [0, 0, 0],
      subjectHeight: 2,
      side: "right",
      heightFraction: 1,
      lateralFraction: 0.5,
      depthFraction: -1,
      rangeFraction: 2
    });
    expect(custom.position).toEqual([1, 2, -2]);
    expect(custom.range).toBe(4);
  });

  it("stays finite for a degenerate subject height", () => {
    const placement = resolveSubjectRimPlacement({ subjectPosition: [0, 0, 0], subjectHeight: 0, side: "left" });
    expect(placement.position.every((value) => Number.isFinite(value))).toBe(true);
    expect(Number.isFinite(placement.range)).toBe(true);
  });
});
