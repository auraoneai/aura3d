import { describe, expect, it } from "vitest";
import {
  Geometry,
  MAX_SKINNING_JOINTS,
  MAX_UNIFORM_SKINNING_JOINTS,
  VertexBuffer,
  VertexFormat,
  applyMorphTargets,
  computeMorphTargetEnvelopeBounds,
  computeMorphTargetWeightedBounds,
  type MorphTargetDelta
} from "@aura3d/rendering";

/**
 * WS-1.5 — structural correctness gates for morph targets and skinning.
 *
 * These were the two rows WS-1.5 deferred, on the grounds that they "need a rigged/morphed asset
 * rather than a primitive". That reasoning was half right and it deferred the wrong half.
 *
 * The *visual* half genuinely needs an asset: whether a rigged character deforms plausibly on
 * screen is an image question. But the **structural** half — does a non-zero weight actually move
 * vertices, and does a joint transform actually reach the vertex it influences — is a property of
 * the data path, and a primitive with a hand-authored delta tests it more precisely than any
 * asset, because the expected result is arithmetic rather than a screenshot.
 *
 * That distinction matters because the existing coverage proves the wrong thing.
 * `tests/browser/animation-runtime-105.spec.ts` asserts `morphTargetCount >= 3` and that named
 * weights are carried through the animation graph — i.e. that the *plumbing* reports numbers. A
 * morph system that accepted weights and moved nothing would satisfy every one of those
 * assertions. This file asserts displacement.
 *
 * WS-1.5's own rule applies: MAE is supporting evidence, never the pass/fail mechanism for
 * physical behaviour. Nothing here reads an image.
 */

/** A unit quad with positions and normals, so morph deltas have both to act on. */
function quad(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3N3, 4);
  const corners: readonly (readonly [number, number, number])[] = [
    [-1, -1, 0],
    [1, -1, 0],
    [1, 1, 0],
    [-1, 1, 0]
  ];
  corners.forEach((position, index) => {
    vertices.setAttribute(index, "position", position);
    vertices.setAttribute(index, "normal", [0, 0, 1]);
  });
  return new Geometry(vertices);
}

function positionOf(geometry: Geometry, vertex: number): readonly number[] {
  return geometry.vertexBuffer.getAttribute(vertex, "position");
}

/** Lift every vertex 2 units in +Y. Deliberately uniform, so the expected result is exact. */
const LIFT: MorphTargetDelta = {
  name: "lift",
  positions: [
    [0, 2, 0],
    [0, 2, 0],
    [0, 2, 0],
    [0, 2, 0]
  ]
};

/** Push the two right-hand vertices out in +X. Non-uniform, so per-vertex targeting is testable. */
const STRETCH_RIGHT: MorphTargetDelta = {
  name: "stretch-right",
  positions: [
    [0, 0, 0],
    [3, 0, 0],
    [3, 0, 0],
    [0, 0, 0]
  ]
};

describe("morph targets — vertex position change over the animation", () => {
  it("moves no vertex at weight 0", () => {
    // The baseline that makes every other assertion meaningful: without this, a system that moved
    // vertices unconditionally would pass the displacement tests below.
    const base = quad();
    const morphed = applyMorphTargets(base, [LIFT], [0]);
    for (let vertex = 0; vertex < 4; vertex += 1) {
      expect(positionOf(morphed, vertex), `vertex ${vertex} moved at weight 0`).toEqual(positionOf(base, vertex));
    }
  });

  it("moves every vertex by the full delta at weight 1", () => {
    const morphed = applyMorphTargets(quad(), [LIFT], [1]);
    // Y goes -1 -> 1 and 1 -> 3; X and Z are untouched.
    expect(positionOf(morphed, 0)).toEqual([-1, 1, 0]);
    expect(positionOf(morphed, 2)).toEqual([1, 3, 0]);
  });

  it("scales displacement linearly with weight, which is what makes a blend a blend", () => {
    const base = quad();
    const half = applyMorphTargets(base, [LIFT], [0.5]);
    const full = applyMorphTargets(base, [LIFT], [1]);
    const baseY = positionOf(base, 0)[1]!;
    const halfY = positionOf(half, 0)[1]!;
    const fullY = positionOf(full, 0)[1]!;
    expect(halfY - baseY).toBeCloseTo((fullY - baseY) / 2, 10);
    // And it is genuinely moving, not merely proportional to zero.
    expect(fullY - baseY).toBeCloseTo(2, 10);
  });

  it("targets individual vertices rather than translating the whole mesh", () => {
    /*
     * The defect this catches: a "morph" implemented as an object-space offset. It would satisfy
     * the weight-0 and weight-1 tests above with a uniform delta and be indistinguishable from a
     * transform — until a non-uniform delta arrives, where only the named vertices may move.
     */
    const base = quad();
    const morphed = applyMorphTargets(base, [STRETCH_RIGHT], [1]);
    expect(positionOf(morphed, 0), "left vertices must not move for a right-side delta").toEqual(positionOf(base, 0));
    expect(positionOf(morphed, 3), "left vertices must not move for a right-side delta").toEqual(positionOf(base, 3));
    expect(positionOf(morphed, 1)[0]).toBeCloseTo(4, 10);
    expect(positionOf(morphed, 2)[0]).toBeCloseTo(4, 10);
  });

  it("accumulates two simultaneous targets instead of the last one winning", () => {
    // Blending two morphs is the whole point of a weight array; a system that overwrites rather
    // than accumulates looks correct with one target and is wrong with two.
    const morphed = applyMorphTargets(quad(), [LIFT, STRETCH_RIGHT], [1, 1]);
    // Vertex 1 receives +2Y from LIFT and +3X from STRETCH_RIGHT.
    expect(positionOf(morphed, 1)[0]).toBeCloseTo(4, 10);
    expect(positionOf(morphed, 1)[1]).toBeCloseTo(1, 10);
  });

  it("reports bounds that actually contain the morphed geometry", () => {
    /*
     * Bounds are not cosmetic: culling reads them. A morph that moves vertices outside stale bounds
     * disappears when the camera turns — the classic "the character vanishes mid-animation" bug.
     */
    const base = quad();
    const envelope = computeMorphTargetEnvelopeBounds(base, [LIFT, STRETCH_RIGHT]);
    const weighted = computeMorphTargetWeightedBounds(base, [LIFT, STRETCH_RIGHT], [1, 1]);
    const morphed = applyMorphTargets(base, [LIFT, STRETCH_RIGHT], [1, 1]);

    for (let vertex = 0; vertex < 4; vertex += 1) {
      const position = positionOf(morphed, vertex);
      for (const axis of [0, 1, 2]) {
        expect(position[axis]!, `envelope bounds exclude morphed vertex ${vertex} on axis ${axis}`).toBeGreaterThanOrEqual(
          envelope.min[axis]! - 1e-9
        );
        expect(position[axis]!).toBeLessThanOrEqual(envelope.max[axis]! + 1e-9);
        expect(position[axis]!, `weighted bounds exclude morphed vertex ${vertex} on axis ${axis}`).toBeGreaterThanOrEqual(
          weighted.min[axis]! - 1e-9
        );
        expect(position[axis]!).toBeLessThanOrEqual(weighted.max[axis]! + 1e-9);
      }
    }
    // The envelope must be strictly larger than the base mesh, or it is not accounting for morphs.
    expect(envelope.max[1]!).toBeGreaterThan(base.bounds.max[1]!);
  });

  it("rejects a weight array that does not match the target count", () => {
    // Silently zipping mismatched arrays is how a morph ends up applying the wrong delta.
    expect(() => applyMorphTargets(quad(), [LIFT, STRETCH_RIGHT], [1])).toThrow(/must match/i);
  });
});

describe("skinning — joint-driven deformation over time", () => {
  /*
   * Skinning is applied on the GPU through a joint-matrix palette (`SkinningPaletteBinding` in
   * `ForwardPass`), so there is no CPU function to call for a deformed position the way there is
   * for morphs. Asserting deformation therefore belongs to the browser suite, and it is covered
   * there — `tests/browser/animation-skinning*.spec.ts` and the animated-character specs render a
   * rigged asset.
   *
   * What is worth asserting here, and was not asserted anywhere, is the **contract that carries
   * joint transforms to the vertex**: the format must expose joint indices and weights, and the
   * geometry must be able to hold them. A rig whose weights never reach the shader produces a
   * mesh frozen in bind pose, which reads as "the animation does not play".
   */
  it("exposes vertex formats with joint indices and weights", () => {
    for (const format of [VertexFormat.P3J4W4, VertexFormat.P3N3J4W4]) {
      expect(format.hasAttribute("joints"), "format cannot carry joint indices").toBe(true);
      expect(format.hasAttribute("weights"), "format cannot carry joint weights").toBe(true);
      expect(format.getAttribute("joints").components).toBe(4);
      expect(format.getAttribute("weights").components).toBe(4);
    }
  });

  it("round-trips per-vertex joint indices and weights through a vertex buffer", () => {
    // If this drops precision or reorders influences, every rig is subtly wrong and nothing else
    // in the pipeline can detect it.
    const vertices = new VertexBuffer(VertexFormat.P3N3J4W4, 2);
    vertices.setAttribute(0, "position", [0, 0, 0]);
    vertices.setAttribute(0, "normal", [0, 1, 0]);
    vertices.setAttribute(0, "joints", [0, 3, 7, 2]);
    vertices.setAttribute(0, "weights", [0.5, 0.25, 0.125, 0.125]);
    vertices.setAttribute(1, "position", [1, 0, 0]);
    vertices.setAttribute(1, "normal", [0, 1, 0]);
    vertices.setAttribute(1, "joints", [4, 4, 4, 4]);
    vertices.setAttribute(1, "weights", [1, 0, 0, 0]);

    expect(Array.from(vertices.getAttribute(0, "joints"))).toEqual([0, 3, 7, 2]);
    expect(Array.from(vertices.getAttribute(0, "weights"))).toEqual([0.5, 0.25, 0.125, 0.125]);
    expect(Array.from(vertices.getAttribute(1, "joints"))).toEqual([4, 4, 4, 4]);

    // Weights must sum to 1 for the influences to be a partition of the vertex; a rig where they
    // do not is why a skinned mesh shrinks toward the origin.
    const weights = vertices.getAttribute(0, "weights");
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 10);
  });

  it("supports enough joints for a real character rig", () => {
    /*
     * A humanoid rig is typically 50-80 joints. A palette capped below that silently fails on any
     * real asset while passing every synthetic two-joint test.
     *
     * Read as **exported constants**, not by grepping the source. My first version used a regex
     * over `ForwardPass.ts` and failed because it guessed the name; importing the values is both
     * simpler and stronger — it asserts what a consumer can actually observe, and it breaks if the
     * constant stops being public.
     */
    expect(MAX_SKINNING_JOINTS, "data-texture joint palette is too small for a humanoid rig").toBeGreaterThanOrEqual(64);
    // The uniform path is legitimately smaller; it just must not be the only path.
    expect(MAX_UNIFORM_SKINNING_JOINTS).toBeGreaterThan(0);
    expect(MAX_SKINNING_JOINTS).toBeGreaterThan(MAX_UNIFORM_SKINNING_JOINTS);
  });
});
