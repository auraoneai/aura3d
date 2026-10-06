// PRD-15 T3.10 — createProductionInstanceTransforms must honour the source
// node's `size` (R18 declared correctness fix): instances used to render at
// unit size regardless of the primitive's authored size.
import { describe, expect, it } from "vitest";
import { createProductionInstanceTransforms } from "../../../../packages/engine/src/agent-api/compiler/primitives";
import type { AuraPrimitiveNode } from "../../../../packages/engine/src/agent-api/nodes/types";

describe("createProductionInstanceTransforms (T3.10)", () => {
  it("folds node.size into each instance matrix (spec vectors)", () => {
    const node: AuraPrimitiveNode = { kind: "primitive", primitive: "box", size: [1, 4, 1] };
    const matrices = createProductionInstanceTransforms(
      [{ position: [2, 0, 0] }, { position: [-2, 0, 0], scale: [1, 0.5, 1] }],
      node
    );
    expect(matrices).toHaveLength(32);
    // Column-major 4x4: the size ⊙ scale diagonal sits at 0, 5, 10.
    expect(matrices[0]).toBeCloseTo(1, 5);
    expect(matrices[5]).toBeCloseTo(4, 5);
    expect(matrices[10]).toBeCloseTo(1, 5);
    expect(matrices[16 + 0]).toBeCloseTo(1, 5);
    expect(matrices[16 + 5]).toBeCloseTo(2, 5);
    expect(matrices[16 + 10]).toBeCloseTo(1, 5);
    // Translations ±2 on x.
    expect(matrices[12]).toBeCloseTo(2, 5);
    expect(matrices[16 + 12]).toBeCloseTo(-2, 5);
  });

  it("applies a scalar size uniformly to every instance", () => {
    const matrices = createProductionInstanceTransforms(
      [{ position: [0, 0, 0] }, { position: [1, 0, 0] }],
      { kind: "primitive", primitive: "box", size: 2 }
    );
    for (const offset of [0, 16]) {
      expect(matrices[offset + 0]).toBeCloseTo(2, 5);
      expect(matrices[offset + 5]).toBeCloseTo(2, 5);
      expect(matrices[offset + 10]).toBeCloseTo(2, 5);
    }
  });

  it("keeps unit scale when size is undefined", () => {
    const matrices = createProductionInstanceTransforms([{ position: [0, 0, 0] }], { kind: "primitive", primitive: "box" });
    expect(matrices[0]).toBeCloseTo(1, 5);
    expect(matrices[5]).toBeCloseTo(1, 5);
    expect(matrices[10]).toBeCloseTo(1, 5);
  });
});
