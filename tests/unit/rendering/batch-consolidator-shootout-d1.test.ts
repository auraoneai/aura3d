import { describe, expect, it } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { consolidateBatchedMeshes } from "../../../packages/rendering/src/InstancingDiagnostics";

/**
 * D1 batch-consolidator shootout math (muse3jsparity-PRD): the browser
 * harness in `tests/browser/batch-consolidator-shootout.spec.ts` proves the
 * same-scene draw + memory verdict against `three.BatchedMesh`; this file
 * pins the telemetry contract it relies on.
 */
describe("D1 consolidator shared-memory telemetry", () => {
  it("reports shared-geometry bytes once plus per-instance transforms", () => {
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const material = new UnlitMaterial({ name: "shootout-test" });
    const geometry = Geometry.triangle();
    const items = Array.from({ length: 6 }, (_, i) => ({
      geometry,
      material,
      modelMatrix: identity,
      batchKey: "shootout-block",
      label: `block-${i}`,
    }));
    const result = consolidateBatchedMeshes(items);
    expect(result.draws).toBe(1);
    // Legacy summed fields keep their naive-scene meaning.
    expect(result.telemetry.indexBytes).toBe(6 * 3 * 4);
    // Shared view uploads the geometry once + one mat4 per instance.
    expect(result.telemetry.sharedIndexBytes).toBe(3 * 4);
    expect(result.telemetry.sharedVertexBytes).toBeGreaterThan(0);
    expect(result.telemetry.sharedVertexBytes).toBeLessThan(result.telemetry.vertexBytes);
    expect(result.telemetry.instanceTransformBytes).toBe(6 * 16 * 4);
    expect(result.telemetry.consolidatedBytes).toBe(
      result.telemetry.sharedIndexBytes + result.telemetry.sharedVertexBytes + result.telemetry.instanceTransformBytes
    );
    // Sharing wins once the geometry is bigger than a mat4 per instance:
    // 60 cubes consolidate to far less than the naive per-mesh upload.
    const cube = Geometry.cube(1);
    const many = consolidateBatchedMeshes(
      Array.from({ length: 60 }, (_, i) => ({
        geometry: cube,
        material,
        modelMatrix: identity,
        batchKey: "shootout-cubes",
        label: `cube-${i}`,
      }))
    );
    expect(many.draws).toBe(1);
    expect(many.telemetry.consolidatedBytes).toBeLessThan(
      many.telemetry.indexBytes + many.telemetry.vertexBytes
    );
  });

  it("counts each unique geometry once across batch groups", () => {
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const material = new UnlitMaterial({ name: "shootout-groups" });
    const triangle = Geometry.triangle();
    const quad = Geometry.cube(1);
    const items = [
      ...Array.from({ length: 4 }, (_, i) => ({
        geometry: triangle, material, modelMatrix: identity, batchKey: "tri", label: `tri-${i}`,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        geometry: quad, material, modelMatrix: identity, batchKey: "quad", label: `quad-${i}`,
      })),
    ];
    const result = consolidateBatchedMeshes(items);
    expect(result.draws).toBe(2);
    expect(result.telemetry.drawsSaved).toBe(6);
    expect(result.telemetry.instanceTransformBytes).toBe(8 * 16 * 4);
    expect(result.telemetry.sharedIndexBytes).toBe(
      (triangle.indexBuffer?.count ?? 0) * 4 + (quad.indexBuffer?.count ?? 0) * 4
    );
  });
});
