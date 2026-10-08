// PRD-06 T3.9 — `prd06-ik-slope` lane spec: shared ramp/stairs terrain math
// and the spec wiring both adapters consume (footIk legs, analytic ground,
// non-reference admission).
import { describe, expect, it } from "vitest";
import { prd06IkSlope, PRD06_IK_SLOPE_TERRAIN } from "../../../../benchmarks/quality-rebuild/scenes/prd06/ik-slope";
import { rampStairsHeightAt, rampStairsRise } from "../../../../benchmarks/quality-rebuild/shared/terrain";
import { scenes as sharedScenes } from "../../../../benchmarks/quality-rebuild/scenes/prd06/index";
import { scenes as auraScenes } from "../../../../benchmarks/quality-rebuild/aura3d/scenes/prd06/index";
import { scenes as threeScenes } from "../../../../benchmarks/quality-rebuild/three/scenes/prd06/index";

const T = PRD06_IK_SLOPE_TERRAIN;
const RISE = T.rampLength * Math.tan((T.slopeDeg * Math.PI) / 180);
const TAN = Math.tan((T.slopeDeg * Math.PI) / 180);

describe("ramp-stairs terrain (T3.9)", () => {
  it("flat before rampStartX, rises along the ramp, plateaus at the rise", () => {
    expect(rampStairsHeightAt(T, -1, -1).height).toBe(0);
    expect(rampStairsHeightAt(T, -0.001, -1).height).toBe(0);
    // Smooth ramp on the z < splitZ half.
    expect(rampStairsHeightAt(T, 1, -1).height).toBeCloseTo(TAN, 6);
    expect(rampStairsHeightAt(T, T.rampStartX + T.rampLength, -1).height).toBeCloseTo(RISE, 6);
    expect(rampStairsHeightAt(T, 5, -1).height).toBeCloseTo(RISE, 6);
  });

  it("stairs quantize the same rise into 18 cm treads", () => {
    // Step 0 covers x in [0, 0.5) at 0.18; step 3 covers [1.5, 2) at 0.72.
    expect(rampStairsHeightAt(T, 0.1, 1).height).toBeCloseTo(0.18, 6);
    expect(rampStairsHeightAt(T, 0.49, 1).height).toBeCloseTo(0.18, 6);
    expect(rampStairsHeightAt(T, 0.51, 1).height).toBeCloseTo(0.36, 6);
    expect(rampStairsHeightAt(T, 1.99, 1).height).toBeCloseTo(0.72, 6);
    // Past the run both halves share the same plateau.
    expect(rampStairsHeightAt(T, 5, 1).height).toBeCloseTo(RISE, 6);
  });

  it("reports a slope normal on the ramp and vertical normals elsewhere", () => {
    const ramp = rampStairsHeightAt(T, 1, -1);
    const [nx, ny, nz] = ramp.normal;
    expect(nx).toBeCloseTo(-Math.sin(T.slopeDeg * Math.PI / 180), 6);
    expect(ny).toBeCloseTo(Math.cos(T.slopeDeg * Math.PI / 180), 6);
    expect(nz).toBe(0);
    expect(rampStairsHeightAt(T, 1, 1).normal).toEqual([0, 1, 0]);
    expect(rampStairsRise(T)).toBeCloseTo(RISE, 9);
  });
});

describe("prd06-ik-slope spec (T3.9)", () => {
  it("is a 20° ramp + 18 cm stairs on Soldier Idle with foot IK on", () => {
    const spec = prd06IkSlope;
    expect(spec.id).toBe("prd06-ik-slope");
    expect(spec.terrain).toBe(T);
    if (spec.terrain?.kind !== "ramp-stairs") throw new Error("prd06-ik-slope terrain must be ramp-stairs");
    expect(spec.terrain.slopeDeg).toBe(20);
    expect(spec.terrain.stepHeight).toBe(0.18);
    const soldier = spec.objects.find((o) => o.kind === "model" && o.name === spec.ikSlope.modelName);
    expect(soldier?.kind).toBe("model");
    if (soldier?.kind !== "model") return;
    expect(soldier.asset).toBe("soldier");
    expect(soldier.animation?.clip).toBe("Idle");
    expect(soldier.animation?.footIk?.legs.map((leg) => leg.side)).toEqual(["left", "right"]);
    expect(soldier.animation?.footIk?.legs.every((leg) => leg.hip && leg.knee && leg.ankle)).toBe(true);
  });

  it("stays non-reference on every scene index (acceptance = engine metric)", () => {
    expect(prd06IkSlope.admittedAsReference).toBe(false);
    for (const registration of [...sharedScenes, ...auraScenes, ...threeScenes].filter((s) => s.id === "prd06-ik-slope")) {
      expect(registration.admittedAsReference).toBe(false);
    }
    expect(sharedScenes.some((s) => s.id === "prd06-ik-slope")).toBe(true);
    expect(auraScenes.some((s) => s.id === "prd06-ik-slope")).toBe(true);
    expect(threeScenes.some((s) => s.id === "prd06-ik-slope")).toBe(true);
  });

  it("visual geometry matches the analytic terrain", () => {
    const spec = prd06IkSlope;
    const stairs = spec.objects.filter((o) => o.kind === "primitive" && o.name.startsWith("stair"));
    expect(stairs).toHaveLength(T.stepCount);
    for (const [i, step] of stairs.entries()) {
      if (step.kind !== "primitive") continue;
      // Box top sits exactly at the quantized step height.
      expect(step.position[1] + step.size[1] / 2).toBeCloseTo((i + 1) * T.stepHeight, 6);
    }
  });
});
