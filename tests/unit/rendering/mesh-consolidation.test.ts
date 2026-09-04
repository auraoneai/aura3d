import { describe, expect, it } from "vitest";
import {
  Geometry,
  PBRMaterial,
  UnlitMaterial,
  consolidateStaticMeshes,
  deindexGeometryToNonIndexed,
  type MeshConsolidationInput
} from "../../../packages/rendering/src";
import { composeMat4, type Mat4 } from "../../../packages/scene/src";

/**
 * `consolidateStaticMeshes` merges *distinct* static geometries that share a material into one buffer.
 *
 * This is the complement to `batchStaticRenderItems`, which instances one geometry many times. The
 * distinction is what makes it useful for architecture: measured on `auraClashDuelStage`, 85 mesh
 * primitives have 85 distinct attribute sets but only 13 distinct material definitions, so batching
 * collapses nothing while consolidation can collapse each shared-material set into a single draw.
 *
 * Correctness matters more than the draw-call win here, because the merge bakes each source model
 * matrix into vertex positions. These tests assert the baked result matches the transform that would
 * have been applied at draw time.
 */
function translate(x: number, y: number, z: number): Mat4 {
  return composeMat4([x, y, z], [0, 0, 0, 1], [1, 1, 1]) as Mat4;
}

function input(geometry: Geometry, material: PBRMaterial | UnlitMaterial, modelMatrix: Mat4, label?: string): MeshConsolidationInput {
  return { geometry, material, modelMatrix, ...(label ? { label } : {}) };
}

describe("static mesh consolidation", () => {
  it("merges distinct geometries that share a material into a single draw", () => {
    const material = new PBRMaterial({ name: "shared-wall" });
    const result = consolidateStaticMeshes([
      input(Geometry.litCube(1), material, translate(-2, 0, 0)),
      input(Geometry.litCube(1), material, translate(0, 0, 0)),
      input(Geometry.litCube(1), material, translate(2, 0, 0))
    ]);

    expect(result.inputItems).toBe(3);
    expect(result.submittedItems).toBe(1);
    expect(result.mergedMeshes).toBe(1);
    expect(result.drawCallReduction).toBe(2);
    // A merged item carries no model matrix: the transforms are baked into its vertices.
    expect(result.renderItems[0]?.modelMatrix).toBeUndefined();
  });

  it("keeps different materials in separate draws", () => {
    const wall = new PBRMaterial({ name: "wall" });
    const glass = new PBRMaterial({ name: "glass" });
    const result = consolidateStaticMeshes([
      input(Geometry.litCube(1), wall, translate(-1, 0, 0)),
      input(Geometry.litCube(1), wall, translate(1, 0, 0)),
      input(Geometry.litCube(1), glass, translate(0, 2, 0)),
      input(Geometry.litCube(1), glass, translate(0, 4, 0))
    ]);

    // One merged mesh per material, never merged across materials: a draw binds one material.
    expect(result.mergedMeshes).toBe(2);
    expect(result.submittedItems).toBe(2);
    const materials = new Set(result.renderItems.map((item) => item.material));
    expect(materials.size).toBe(2);
  });

  it("bakes each source model matrix into the merged vertex positions", () => {
    const material = new PBRMaterial({ name: "baked" });
    const offset = 7.5;
    const result = consolidateStaticMeshes([
      input(Geometry.litCube(1), material, translate(0, 0, 0)),
      input(Geometry.litCube(1), material, translate(offset, 0, 0))
    ]);

    const merged = result.renderItems[0]?.geometry;
    expect(merged).toBeDefined();
    // The merged bounds must span both cubes' world placements, which only holds if the second cube's
    // translation was actually applied to its vertices.
    expect(merged!.bounds.max[0]).toBeGreaterThan(offset - 0.51);
    expect(merged!.bounds.min[0]).toBeLessThan(-0.49);
    // Vertex and index counts are the sums of the sources.
    const single = Geometry.litCube(1);
    expect(merged!.vertexBuffer.vertexCount).toBe(single.vertexBuffer.vertexCount * 2);
    expect(merged!.indexBuffer?.data.length).toBe((single.indexBuffer?.data.length ?? 0) * 2);
  });

  it("offsets indices so the second mesh references its own vertices", () => {
    const material = new PBRMaterial({ name: "indexed" });
    const single = Geometry.litCube(1);
    const vertexCount = single.vertexBuffer.vertexCount;
    const result = consolidateStaticMeshes([
      input(Geometry.litCube(1), material, translate(0, 0, 0)),
      input(Geometry.litCube(1), material, translate(3, 0, 0))
    ]);

    const indices = Array.from(result.renderItems[0]!.geometry.indexBuffer!.data);
    // Without offsetting, the second mesh's indices would all be < vertexCount and it would render as
    // a duplicate of the first mesh at the wrong position.
    expect(Math.max(...indices)).toBeGreaterThanOrEqual(vertexCount);
    expect(Math.max(...indices)).toBeLessThan(vertexCount * 2);
    // Every index must be in range for the merged buffer.
    expect(indices.every((index) => index >= 0 && index < vertexCount * 2)).toBe(true);
  });

  it("passes a lone item through unmerged rather than wrapping it", () => {
    const material = new PBRMaterial({ name: "solo" });
    const result = consolidateStaticMeshes([input(Geometry.litCube(1), material, translate(0, 0, 0), "solo-item")]);

    expect(result.mergedMeshes).toBe(0);
    expect(result.passthroughItems).toBe(1);
    expect(result.drawCallReduction).toBe(0);
    // A passthrough item keeps its own matrix, because nothing was baked.
    expect(result.renderItems[0]?.modelMatrix).toBeDefined();
    expect(result.renderItems[0]?.label).toBe("solo-item");
  });

  it("respects the vertex cap by splitting a group into multiple merged meshes", () => {
    const material = new PBRMaterial({ name: "capped" });
    const single = Geometry.litCube(1);
    const perMesh = single.vertexBuffer.vertexCount;
    const items = Array.from({ length: 6 }, (_, index) => input(Geometry.litCube(1), material, translate(index, 0, 0)));

    // Cap at three meshes' worth of vertices, so six inputs must become two merged meshes.
    const result = consolidateStaticMeshes(items, { maxVerticesPerMesh: perMesh * 3 });
    expect(result.mergedMeshes).toBe(2);
    expect(result.submittedItems).toBe(2);
    for (const item of result.renderItems) {
      expect(item.geometry.vertexBuffer.vertexCount).toBeLessThanOrEqual(perMesh * 3);
    }
  });

  it("rejects a non-finite model matrix instead of producing corrupt geometry", () => {
    const material = new PBRMaterial({ name: "bad-matrix" });
    const broken = Array.from({ length: 16 }, () => Number.NaN);
    expect(() => consolidateStaticMeshes([
      input(Geometry.litCube(1), material, broken as unknown as Mat4),
      input(Geometry.litCube(1), material, translate(1, 0, 0))
    ])).toThrow(/finite mat4/);
  });

  it("rejects an invalid vertex cap", () => {
    expect(() => consolidateStaticMeshes([], { maxVerticesPerMesh: 2 })).toThrow(/maxVerticesPerMesh/);
  });

  it("does not merge non-indexed geometry, whose primitive assembly would change", () => {
    const material = new UnlitMaterial({ name: "lines" });
    const lines = Geometry.lineSegments([[0, 0, 0], [1, 0, 0]]);
    expect(lines.indexBuffer).toBeNull();
    const result = consolidateStaticMeshes([
      input(lines, material, translate(0, 0, 0)),
      input(lines, material, translate(2, 0, 0))
    ]);
    // Both pass through: concatenating non-indexed buffers would reinterpret primitives.
    expect(result.mergedMeshes).toBe(0);
    expect(result.passthroughItems).toBe(2);
  });
});

describe("de-index to non-indexed (BufferGeometryUtils.toNonIndexed equivalent)", () => {
  it("expands one vertex per index, in index order, preserving every attribute", () => {
    const cube = Geometry.litCube(1);
    const indexCount = cube.indexBuffer!.data.length;
    const expanded = deindexGeometryToNonIndexed(cube);

    expect(expanded.indexBuffer).toBeNull();
    expect(expanded.topology).toBe(cube.topology);
    expect(expanded.vertexBuffer.vertexCount).toBe(indexCount);
    // Vertex i of the output equals the indexed source vertex the i-th index points at.
    for (let i = 0; i < indexCount; i += 1) {
      const sourceVertex = cube.indexBuffer!.data[i]!;
      expect([...expanded.vertexBuffer.getAttribute(i, "position")]).toEqual([
        ...cube.vertexBuffer.getAttribute(sourceVertex, "position")
      ]);
      expect([...expanded.vertexBuffer.getAttribute(i, "normal")]).toEqual([
        ...cube.vertexBuffer.getAttribute(sourceVertex, "normal")
      ]);
    }
  });

  it("returns already non-indexed geometry unchanged", () => {
    const lines = Geometry.lineSegments([[0, 0, 0], [1, 0, 0]]);
    expect(deindexGeometryToNonIndexed(lines)).toBe(lines);
  });
});
