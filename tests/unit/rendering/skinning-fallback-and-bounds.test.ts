import { describe, expect, it } from "vitest";
import {
  Geometry,
  IndexBuffer,
  VertexBuffer,
  VertexFormat,
  computeAnimatedSkinnedBoundsUnion,
  createMorphTargetPlan,
  decideSkinningPalettePath,
  planMorphTargets,
  resolveWrinkleMapStrength
} from "../../../packages/rendering/src";

/**
 * E1 — joint-palette fallback reason codes, culling-correct animated bounds,
 * tangent-domain morph rows, and the wrinkle-map hook. All pure/deterministic:
 * no GPU, no screenshots.
 */

function skinnedTriangle(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
  vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
  vertices.setAttribute(0, "joints", [0, 0, 0, 0]);
  vertices.setAttribute(0, "weights", [1, 0, 0, 0]);
  vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
  vertices.setAttribute(1, "joints", [1, 0, 0, 0]);
  vertices.setAttribute(1, "weights", [1, 0, 0, 0]);
  vertices.setAttribute(2, "position", [0, 0.5, 0]);
  vertices.setAttribute(2, "joints", [0, 1, 0, 0]);
  vertices.setAttribute(2, "weights", [0.5, 0.5, 0, 0]);
  return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
}

function translationPalette(jointCount: number, tx: number): { jointCount: number; matrices: Float32Array } {
  const matrices = new Float32Array(jointCount * 16);
  for (let joint = 0; joint < jointCount; joint += 1) {
    matrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, 0, 0, 1], joint * 16);
  }
  return { jointCount, matrices };
}

describe("decideSkinningPalettePath — CPU-fallback reason codes", () => {
  it("stays on the uniform array at/below the cap with reason none-uniform-array", () => {
    const decision = decideSkinningPalettePath({ jointCount: 34, maxUniformJoints: 96, maxDataTextureJoints: 1024 });
    expect(decision).toMatchObject({ path: "uniform-array", reason: "none-uniform-array", cpuFallback: false });
  });

  it("uses the data-texture path above the uniform cap with reason none-data-texture", () => {
    // showcaseAnimatedRunnerHero ships 136 joints: over the 96 uniform cap, inside the data-texture ceiling.
    const decision = decideSkinningPalettePath({ jointCount: 136, maxUniformJoints: 96, maxDataTextureJoints: 1024 });
    expect(decision).toMatchObject({ path: "data-texture", reason: "none-data-texture", cpuFallback: false });
  });

  it("falls back to CPU past the data-texture ceiling with an over-limit reason", () => {
    // rooftopDefender ships 191 joints: this is the row that must name the cause, not just "cpu".
    const decision = decideSkinningPalettePath({ jointCount: 2048, maxUniformJoints: 96, maxDataTextureJoints: 1024 });
    expect(decision).toMatchObject({ path: "cpu", reason: "joint-count-exceeds-data-texture-limit", cpuFallback: true });
  });

  it("names a shader without data-texture palette uniforms as the fallback cause", () => {
    const decision = decideSkinningPalettePath({
      jointCount: 100,
      maxUniformJoints: 96,
      maxDataTextureJoints: 1024,
      shaderHasDataTexturePalette: false
    });
    expect(decision).toMatchObject({ path: "cpu", reason: "shader-lacks-data-texture-palette", cpuFallback: true });
  });

  it("names a shader without any skinning uniforms as the fallback cause", () => {
    const decision = decideSkinningPalettePath({ jointCount: 4, shaderHasSkinningUniforms: false });
    expect(decision).toMatchObject({ path: "cpu", reason: "shader-lacks-skinning-uniforms", cpuFallback: true });
  });

  it("rejects non-integer joint counts instead of guessing", () => {
    expect(() => decideSkinningPalettePath({ jointCount: -1 })).toThrow(/non-negative integer/);
  });
});

describe("computeAnimatedSkinnedBoundsUnion — no disappearing heroes", () => {
  it("unions per-frame palettes so the bound survives the whole motion", () => {
    const geometry = skinnedTriangle();
    const union = computeAnimatedSkinnedBoundsUnion(geometry, [
      translationPalette(2, 0),
      translationPalette(2, 5)
    ]);
    // Frame 0 spans x in [-0.5, 0.5]; frame 1 shifts everything +5 in x.
    expect(union.min[0]).toBeCloseTo(-0.5, 6);
    expect(union.max[0]).toBeCloseTo(5.5, 6);
  });

  it("a single-frame bound would cull the shifted frame (the bug this prevents)", () => {
    const geometry = skinnedTriangle();
    const union = computeAnimatedSkinnedBoundsUnion(geometry, [translationPalette(2, 5)]);
    expect(union.min[0]).toBeCloseTo(4.5, 6);
  });

  it("returns rest-pose bounds for an empty palette list", () => {
    const geometry = skinnedTriangle();
    const union = computeAnimatedSkinnedBoundsUnion(geometry, []);
    expect(union.min).toEqual(geometry.bounds.min);
    expect(union.max).toEqual(geometry.bounds.max);
  });
});

describe("tangent-domain morph rows", () => {
  it("packs a third texture row per target when tangents are present", () => {
    const decision = planMorphTargets(6, 1000, true, undefined, { morphsTangents: true });
    expect(decision.rowsPerTarget).toBe(3);
    expect(decision.morphsTangents).toBe(true);
    expect(decision.textureHeight).toBe(18);
  });

  it("auto-detects tangents from the target set when planning + packing", () => {
    const plan = createMorphTargetPlan(
      [{ positions: [[1, 0, 0]], normals: [[0, 1, 0]], tangents: [[0, 0, 1]] }],
      [1],
      128
    );
    expect(plan.mode).toBe("texture");
    expect(plan.rowsPerTarget).toBe(3);
    expect(plan.textureData.length).toBe(128 * 3 * 4);
    // Tangent row sits after position + normal rows: vertex 0 tangent delta (0,0,1).
    const tangentOffset = (2 * 128 + 0) * 4;
    expect(plan.textureData[tangentOffset]).toBeCloseTo(0, 10);
    expect(plan.textureData[tangentOffset + 2]).toBeCloseTo(1, 10);
  });

  it("stays at two rows for position+normal sets (no behavior change)", () => {
    const decision = planMorphTargets(6, 1000, true);
    expect(decision.rowsPerTarget).toBe(2);
    expect(decision.morphsTangents).toBe(false);
  });
});

describe("resolveWrinkleMapStrength — face-rig wrinkle hook", () => {
  const hook = {
    textureUniform: "u_wrinkleTexture",
    bindings: [
      { target: "browRaise", amount: 0.8 },
      { target: "squint", amount: 1 },
      { target: 7, amount: 0.5 }
    ]
  };

  it("sums weight × amount over bound targets", () => {
    expect(resolveWrinkleMapStrength({ browRaise: 0.5, squint: 1 }, hook)).toBeCloseTo(1.4, 10);
  });

  it("supports index-keyed targets and ignores unbound weights", () => {
    expect(resolveWrinkleMapStrength({ smile: 1, 7: 0.5 } as Record<string | number, number>, hook)).toBeCloseTo(0.25, 10);
  });

  it("clamps negative accumulation at zero and skips non-finite weights", () => {
    expect(resolveWrinkleMapStrength({ browRaise: -2 }, hook)).toBe(0);
    expect(resolveWrinkleMapStrength({ squint: Number.NaN }, hook)).toBe(0);
  });
});
