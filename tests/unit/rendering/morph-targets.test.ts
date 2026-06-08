import { describe, expect, it } from "vitest";
import {
  applyMorphTargets,
  createMorphTargetPlan,
  planMorphTargets,
  Geometry,
  MORPH_UNIFORM_MAX_TARGETS,
  MORPH_UNIFORM_MAX_VERTICES,
  type MorphTargetDelta
} from "../../../packages/rendering/src/index";
import {
  applyVisemeMorphInfluences,
  visemeSampleToMorphInfluences
} from "../../../packages/engine/src/agent-api/VisemeController";

function makeTargets(count: number, vertexCount: number, withNormals: boolean): MorphTargetDelta[] {
  return Array.from({ length: count }, (_, t) => ({
    positions: Array.from({ length: vertexCount }, (_, v) => [0.01 * (t + 1), 0.02 * v, 0] as const),
    ...(withNormals ? { normals: Array.from({ length: vertexCount }, () => [0, 0.1 * (t + 1), 0] as const) } : {})
  }));
}

describe("planMorphTargets", () => {
  it("uses the uniform fast path within the cap", () => {
    const plan = planMorphTargets(3, 40, false);
    expect(plan.mode).toBe("uniform");
  });

  it("switches to the texture path beyond the 4-target / 64-vertex cap", () => {
    expect(planMorphTargets(MORPH_UNIFORM_MAX_TARGETS + 1, 40, false).mode).toBe("texture");
    expect(planMorphTargets(2, MORPH_UNIFORM_MAX_VERTICES + 1, false).mode).toBe("texture");
    // ARKit-scale rig: 52 blendshapes over thousands of verts -> texture path.
    expect(planMorphTargets(52, 4000, true).mode).toBe("texture");
  });

  it("falls back to CPU only when even the texture limit is exceeded (cap is a function of device limits)", () => {
    expect(planMorphTargets(10, 100, false, { maxTextureSize: 4096 }).mode).toBe("texture");
    expect(planMorphTargets(10, 100, false, { maxTextureSize: 64 }).mode).toBe("cpu");
  });
});

describe("createMorphTargetPlan", () => {
  it("packs >4 targets / >64 verts into a texture of the right dimensions (positions + normals)", () => {
    const targets = makeTargets(8, 128, true);
    const weights = targets.map(() => 0.5);
    const plan = createMorphTargetPlan(targets, weights, 128);
    expect(plan.mode).toBe("texture");
    expect(plan.morphsNormals).toBe(true);
    expect(plan.rowsPerTarget).toBe(2);
    expect(plan.textureWidth).toBe(128);
    expect(plan.textureHeight).toBe(8 * 2);
    expect(plan.textureData.length).toBe(128 * 16 * 4);
    // target 0 position row, vertex 1 => positions[1] = [0.01, 0.02, 0]
    expect(plan.textureData[1 * 4]).toBeCloseTo(0.01, 6);
    // target 0 normal row (row 1), vertex 0 => [0, 0.1, 0]
    const normalRowOffset = (1 * 128 + 0) * 4;
    expect(plan.textureData[normalRowOffset + 1]).toBeCloseTo(0.1, 6);
  });

  it("packs small counts into the uniform arrays", () => {
    const targets = makeTargets(2, 16, true);
    const plan = createMorphTargetPlan(targets, [1, 0.3], 16);
    expect(plan.mode).toBe("uniform");
    expect(plan.uniformPositionDeltas.length).toBe(MORPH_UNIFORM_MAX_TARGETS * MORPH_UNIFORM_MAX_VERTICES * 4);
    expect(plan.uniformWeights[0]).toBe(1);
    expect(plan.uniformWeights[1]).toBeCloseTo(0.3, 6);
  });

  it("is deterministic", () => {
    const targets = makeTargets(6, 80, true);
    const a = createMorphTargetPlan(targets, targets.map(() => 0.4), 80);
    const b = createMorphTargetPlan(targets, targets.map(() => 0.4), 80);
    expect(Array.from(a.textureData)).toEqual(Array.from(b.textureData));
  });
});

describe("applyMorphTargets morphs normals (lighting follows the deformation)", () => {
  it("morphs the normal attribute, not just position", () => {
    const base = Geometry.litTriangle();
    const baseNormal = base.vertexBuffer.getAttribute(0, "normal");
    // A strong normal delta on vertex 0 should rotate the morphed normal away from the base.
    const target: MorphTargetDelta = {
      positions: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      normals: [[1, 0, 0], [0, 0, 0], [0, 0, 0]]
    };
    const morphed = applyMorphTargets(base, [target], [1]);
    const outNormal = morphed.vertexBuffer.getAttribute(0, "normal");
    // normal changed (lighting will follow), and stays unit length
    expect(Math.hypot(outNormal[0]! - baseNormal[0]!, outNormal[1]! - baseNormal[1]!, outNormal[2]! - baseNormal[2]!)).toBeGreaterThan(0.1);
    expect(Math.hypot(outNormal[0]!, outNormal[1]!, outNormal[2]!)).toBeCloseTo(1, 5);
  });
});

describe("viseme -> morph influences (GPU-face lip-sync)", () => {
  const sample = {
    time: 0.5,
    activeCues: [],
    visemeId: "aa" as const,
    primaryVisemeId: "aa" as const,
    mouthOpenness: 0.8,
    primitiveMouthCard: "wide" as const,
    weights: { aa: 0.8 },
    blendshapeWeights: { jawOpen: 0.7, mouthSmile: 0.2 }
  };

  it("maps a sampled viseme to named blendshape influences", () => {
    expect(visemeSampleToMorphInfluences(sample)).toEqual({ jawOpen: 0.7, mouthSmile: 0.2 });
  });

  it("applies the influences to a runtime node via setMorphTargets", () => {
    let applied: Record<string, number> | undefined;
    const node = { setMorphTargets: (w: Record<string, number>) => { applied = w; return node; } };
    applyVisemeMorphInfluences(node as never, sample);
    expect(applied).toEqual({ jawOpen: 0.7, mouthSmile: 0.2 });
  });

  it("falls back to morphInfluence when setMorphTargets is unavailable", () => {
    const set: Record<string, number> = {};
    const node = { morphInfluence: (name: string, weight?: number) => { if (weight !== undefined) set[name] = weight; return node; } };
    applyVisemeMorphInfluences(node as never, sample);
    expect(set).toEqual({ jawOpen: 0.7, mouthSmile: 0.2 });
  });
});
