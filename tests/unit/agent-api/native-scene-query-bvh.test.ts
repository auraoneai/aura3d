import { describe, expect, it, vi } from "vitest";
import { Geometry, IndexBuffer, VertexBuffer, VertexFormat } from "../../../packages/rendering/src";
import * as solverless from "@aura3d/physics/solverless";
import { raycast, type SceneRaycastInput } from "../../../packages/engine/src/agent-api/SceneQueries";
import { raycast as publicRaycast } from "../../../packages/engine/src/index";
import * as sceneQueryBvh from "../../../packages/engine/src/agent-api/SceneQueryBVH";
import { createRuntimeNodeHandle, setRuntimeQueryRenderItems } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { batched } from "../../../packages/engine/src/agent-api/nodes/batched";
import type { RenderItem } from "@aura3d/rendering";

const TRIANGLES = 128;
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

function triangleOrigin(triangle: number): readonly [number, number] {
  return [(triangle % 16) * 4, Math.floor(triangle / 16) * 4];
}

function mesh(options: { readonly indexed?: boolean; readonly skin?: boolean; readonly integer?: boolean } = {}): Geometry {
  const format = options.skin ? VertexFormat.P3J4W4 : options.integer
    ? new VertexFormat([{ semantic: "position", components: 3, offset: 0, type: "uint16" }], 6)
    : VertexFormat.P3N3T2;
  const vertices = new VertexBuffer(format, TRIANGLES * 3);
  for (let triangle = 0; triangle < TRIANGLES; triangle += 1) {
    const [x, y] = triangleOrigin(triangle);
    [[x, y, 0], [x + 2, y, 0], [x, y + 2, 0]].forEach((position, corner) => {
      const vertex = triangle * 3 + corner;
      vertices.setAttribute(vertex, "position", position);
      if (options.skin) {
        vertices.setAttribute(vertex, "joints", [0, 0, 0, 0]);
        vertices.setAttribute(vertex, "weights", [1, 0, 0, 0]);
      } else if (!options.integer) {
        vertices.setAttribute(vertex, "uv", corner === 1 ? [1, 0] : corner === 2 ? [0, 1] : [0, 0]);
      }
    });
  }
  const indices = options.indexed === false ? null : new IndexBuffer(
    Array.from({ length: TRIANGLES * 3 }, (_, index) => index), TRIANGLES * 3
  );
  return new Geometry(vertices, indices);
}

function queryHandle() {
  return createRuntimeNodeHandle({
    kind: "primitive", primitive: "box", name: "query-bvh"
  } as never, { id: "query-bvh" });
}

function rayAt(triangle: number, xOffset = 0, z = 10) {
  const [x, y] = triangleOrigin(triangle);
  return { origin: [x + 0.25 + xOffset, y + 0.25, z] as const, direction: [0, 0, -1] as const };
}

function cast(handle: ReturnType<typeof queryHandle>, ray: SceneRaycastInput = rayAt(0)) {
  return raycast(ray, { handles: [handle], mode: "mesh" });
}

function bruteItem(item: RenderItem): RenderItem {
  // A position-less morph with zero weight has identical geometry but
  // deliberately uses the live-deformation scan instead of the static tree.
  return { ...item, morphTargets: [{}], morphWeights: [0] };
}

describe("scene mesh query BVH", () => {
  it("reuses a real tree, prunes triangle reads, and preserves exact indexed/non-indexed hits", () => {
    for (const indexed of [true, false]) {
      const geometry = mesh({ indexed });
      const handle = queryHandle();
      const item: RenderItem = { geometry };
      const candidates = vi.spyOn(sceneQueryBvh, "sceneQueryTriangleCandidates");
      const build = vi.spyOn(solverless, "buildMeshBVH");
      try {
        setRuntimeQueryRenderItems(handle, [item]);
        const initial = cast(handle);
        expect(initial[0]).toMatchObject({ faceIndex: 0, distance: 10, uv: [0.125, 0.125] });
        expect(candidates).toHaveBeenCalledOnce();
        expect(build).toHaveBeenCalledOnce();
        candidates.mockClear();
        const accelerated = cast(handle);
        expect(candidates).toHaveBeenCalledOnce();
        const selected = candidates.mock.results[0]!.value;
        expect(selected).toBeDefined();
        expect(selected!.length).toBeLessThan(16);
        expect(publicRaycast(rayAt(0), { handles: [handle], mode: "mesh" })).toEqual(accelerated);
        expect(candidates).toHaveBeenCalledTimes(2);
        expect(build).toHaveBeenCalledOnce();
        candidates.mockClear();
        setRuntimeQueryRenderItems(handle, [bruteItem(item)]);
        const reference = cast(handle);
        expect(accelerated).toEqual(reference);
        expect(candidates).not.toHaveBeenCalled();
      } finally {
        candidates.mockRestore();
        build.mockRestore();
        geometry.dispose();
      }
    }
  });

  it("matches the scan under shear, reflection, instances, clipping ranges and stable ties", () => {
    const geometry = mesh();
    const handle = queryHandle();
    const model = [-1, 0.25, 0, 0, 0.75, 1.5, 0, 0, 0, 0, 2, 0, 4, -3, 0, 1];
    const second: number[] = [...identity];
    second[12] = 100;
    // Two coincident faces must remain in original stream order even if their
    // BVH leaves are visited in another order.
    geometry.indexBuffer!.setIndices(3, [0, 1, 2]);
    const item: RenderItem = {
      geometry, modelMatrix: model, instanceTransforms: [...identity, ...second], instanceCount: 2, layerMask: 4
    };
    try {
      for (const triangle of [0, 17, 49, 100]) {
        for (const instance of [0, 1]) {
          const [x, y] = triangleOrigin(triangle);
          const localX = x + 0.25 + instance * 100;
          const localY = y + 0.25;
          const ray = { origin: [4 - localX + 0.75 * localY, -3 + 0.25 * localX + 1.5 * localY, 10] as const, direction: [0, 0, -1] as const };
          const options = { handles: [handle], mode: "mesh" as const, layers: 4, near: 9, far: 11 };
          setRuntimeQueryRenderItems(handle, [item]);
          const accelerated = raycast(ray, options);
          setRuntimeQueryRenderItems(handle, [bruteItem(item)]);
          expect(accelerated).toEqual(raycast(ray, options));
          expect(accelerated[0]?.instanceId).toBe(instance);
          expect(accelerated[0]?.faceIndex).toBe(triangle);
          if (triangle === 0) {
            expect(accelerated.map((hit) => hit.faceIndex)).toEqual([0, 1]);
            setRuntimeQueryRenderItems(handle, [item]);
            expect(raycast(ray, { ...options, firstHitOnly: true }).map((hit) => hit.faceIndex)).toEqual([0]);
          }
        }
      }
      setRuntimeQueryRenderItems(handle, [item]);
      expect(raycast({ origin: [4, -3, 10], direction: [0, 0, -1] }, { handles: [handle], mode: "mesh", far: 9 })).toEqual([]);
      expect(raycast({ origin: [4, -3, 10], direction: [0, 0, -1] }, { handles: [handle], mode: "mesh", layers: 1 })).toEqual([]);
    } finally {
      geometry.dispose();
    }
  });

  it("filters current aligned geometry and item draw ranges without rebuilding the tree", () => {
    const geometry = mesh();
    const handle = queryHandle();
    const item: RenderItem = { geometry, drawRange: { start: 50 * 3, count: 70 * 3 } };
    const build = vi.spyOn(solverless, "buildMeshBVH");
    try {
      geometry.drawRange = { start: 30 * 3, count: 80 * 3 };
      setRuntimeQueryRenderItems(handle, [item]);
      expect(cast(handle, rayAt(49))).toEqual([]);
      expect(cast(handle, rayAt(50))[0]?.faceIndex).toBe(50);
      expect(cast(handle, rayAt(109))[0]?.faceIndex).toBe(109);
      expect(cast(handle, rayAt(110))).toEqual([]);
      expect(build).toHaveBeenCalledOnce();
      geometry.drawRange = { start: 65 * 3, count: 50 * 3 };
      expect(cast(handle, rayAt(50))).toEqual([]);
      const actual = cast(handle, rayAt(70));
      expect(actual[0]?.faceIndex).toBe(70);
      expect(build).toHaveBeenCalledOnce();
      setRuntimeQueryRenderItems(handle, [bruteItem(item)]);
      expect(actual).toEqual(cast(handle, rayAt(70)));
    } finally {
      build.mockRestore();
      geometry.dispose();
    }
  });

  it("keeps tiny nonzero ray components and singular affine transforms conservative", () => {
    const geometry = mesh();
    const handle = queryHandle();
    // Zero Z scale is singular but leaves these XY-plane triangles intact.
    const singular = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
    const item: RenderItem = { geometry, modelMatrix: singular };
    const ray = { origin: [-1, 0.25, 1e13] as const, direction: [1.25e-13, 0, -1] as const };
    try {
      setRuntimeQueryRenderItems(handle, [item]);
      const accelerated = cast(handle, ray);
      expect(accelerated[0]).toMatchObject({ faceIndex: 0, distance: 1e13 });
      setRuntimeQueryRenderItems(handle, [bruteItem(item)]);
      expect(accelerated).toEqual(cast(handle, ray));
    } finally {
      geometry.dispose();
    }
  });

  it("matches the full scan for varied deterministic rays and affine placements", () => {
    const geometry = mesh();
    const handle = queryHandle();
    let seed = 0x1a2b3c4d;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    let hitCount = 0;
    try {
      for (let placement = 0; placement < 8; placement += 1) {
        const matrix = [
          (placement % 2 ? -1 : 1) * (0.4 + random() * 3), random() - 0.5, random() - 0.5, 0,
          random() - 0.5, 0.4 + random() * 3, random() - 0.5, 0,
          random() - 0.5, random() - 0.5, placement === 0 ? 0 : 0.4 + random() * 3, 0,
          random() * 50 - 25, random() * 50 - 25, random() * 10 - 5, 1
        ];
        const item: RenderItem = { geometry, modelMatrix: matrix };
        for (let sample = 0; sample < 16; sample += 1) {
          const [x, y] = triangleOrigin(Math.floor(random() * TRIANGLES));
          // Include points on edges as well as interior points and misses.
          const u = sample % 4 === 0 ? 0 : random() * 1.4;
          const v = sample % 4 === 1 ? 0 : random() * 1.4;
          const px = x + u, py = y + v;
          const point = [
            matrix[0]! * px + matrix[4]! * py + matrix[12]!,
            matrix[1]! * px + matrix[5]! * py + matrix[13]!,
            matrix[2]! * px + matrix[6]! * py + matrix[14]!
          ];
          const direction = [random() - 0.5, random() - 0.5, -1] as const;
          const ray = {
            origin: [point[0]! - direction[0] * 10, point[1]! - direction[1] * 10, point[2]! - direction[2] * 10] as const,
            direction
          };
          setRuntimeQueryRenderItems(handle, [item]);
          const accelerated = cast(handle, ray);
          hitCount += accelerated.length;
          setRuntimeQueryRenderItems(handle, [bruteItem(item)]);
          expect(accelerated).toEqual(cast(handle, ray));
        }
      }
      expect(hitCount).toBeGreaterThan(20);
    } finally {
      geometry.dispose();
    }
  });

  it("invalidates for API writes and unmarked direct vertex/index mutations", () => {
    const geometry = mesh();
    const handle = queryHandle();
    const vertices = geometry.vertexBuffer;
    const indices = geometry.indexBuffer!;
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry }]);
      expect(cast(handle)[0]?.faceIndex).toBe(0); // populate the tree
      [[150, 0, 0], [152, 0, 0], [150, 2, 0]].forEach((position, index) => vertices.setAttribute(index, "position", position));
      expect(cast(handle)).toEqual([]);
      expect(cast(handle, rayAt(0, 150))[0]?.faceIndex).toBe(0);

      const vertexRevision = vertices.revision;
      for (let index = 0; index < 3; index += 1) vertices.floats[index * 8]! += 100;
      expect(vertices.revision).toBe(vertexRevision);
      expect(cast(handle, rayAt(0, 150))).toEqual([]);
      expect(cast(handle, rayAt(0, 250))[0]?.faceIndex).toBe(0);

      indices.setIndices(0, [240, 241, 242]);
      expect(cast(handle, rayAt(80)).map((hit) => hit.faceIndex)).toEqual([0, 80]);
      const indexRevision = indices.revision;
      indices.data.set([210, 211, 212], 0);
      expect(indices.revision).toBe(indexRevision);
      expect(cast(handle, rayAt(70)).map((hit) => hit.faceIndex)).toEqual([0, 70]);
      indices.data.set([65535, 65535, 65535], 0);
      expect(cast(handle, rayAt(70)).map((hit) => hit.faceIndex)).toEqual([70]);

      geometry.dispose();
      expect(cast(handle, rayAt(70))).toEqual([]);
    } finally {
      geometry.dispose();
    }
  });

  it("invalidates when position and index buffers are replaced", () => {
    const geometry = mesh();
    const replacement = mesh();
    const oldVertices = geometry.vertexBuffer;
    const oldIndices = geometry.indexBuffer!;
    const handle = queryHandle();
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry }]);
      expect(cast(handle)[0]?.faceIndex).toBe(0);
      const nextVertices = replacement.vertexBuffer;
      [[150, 0, 0], [152, 0, 0], [150, 2, 0]].forEach((position, index) => nextVertices.setAttribute(index, "position", position));
      geometry.vertexBuffer = nextVertices;
      expect(cast(handle)).toEqual([]);
      expect(cast(handle, rayAt(0, 150))[0]?.faceIndex).toBe(0);
      replacement.indexBuffer!.setIndices(0, [240, 241, 242]);
      geometry.indexBuffer = replacement.indexBuffer;
      expect(cast(handle, rayAt(0, 150))).toEqual([]);
      expect(cast(handle, rayAt(80)).map((hit) => hit.faceIndex)).toEqual([0, 80]);
    } finally {
      geometry.dispose();
      replacement.dispose();
      // Plain replacement returns the old buffers to their caller.
      oldVertices.dispose();
      oldIndices.dispose();
    }
  });

  it("indexes a separate position stream and detects unmarked writes to that stream", () => {
    const format = new VertexFormat([
      { semantic: "uv", components: 2, offset: 0, bufferSlot: 0 },
      { semantic: "position", components: 3, offset: 0, bufferSlot: 1 }
    ], 8, [{ slot: 1, stride: 12, stepMode: "vertex" }]);
    const primary = new VertexBuffer(format, TRIANGLES * 3);
    const positions = new VertexBuffer(format, TRIANGLES * 3, 1);
    for (let triangle = 0; triangle < TRIANGLES; triangle += 1) {
      const [x, y] = triangleOrigin(triangle);
      [[x, y, 0], [x + 2, y, 0], [x, y + 2, 0]].forEach((point, corner) => {
        const index = triangle * 3 + corner;
        positions.setAttribute(index, "position", point);
        primary.setAttribute(index, "uv", corner === 1 ? [1, 0] : corner === 2 ? [0, 1] : [0, 0]);
      });
    }
    const geometry = new Geometry(primary, new IndexBuffer(
      Array.from({ length: TRIANGLES * 3 }, (_, index) => index), TRIANGLES * 3
    ), "triangles", undefined, [positions]);
    const handle = queryHandle();
    const build = vi.spyOn(solverless, "buildMeshBVH");
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry }]);
      expect(cast(handle)[0]).toMatchObject({ faceIndex: 0, uv: [0.125, 0.125] });
      expect(build).toHaveBeenCalledOnce();
      const revision = positions.revision;
      for (let index = 0; index < 3; index += 1) positions.floats[index * 3]! += 150;
      expect(positions.revision).toBe(revision);
      expect(cast(handle)).toEqual([]);
      expect(cast(handle, rayAt(0, 150))[0]?.faceIndex).toBe(0);
      expect(build).toHaveBeenCalledTimes(2);
      positions.dispose();
      expect(cast(handle, rayAt(0, 150))).toEqual([]);
    } finally {
      build.mockRestore();
      geometry.dispose();
    }
  });

  it("does not reuse undeformed bounds for live morph or skinning changes", () => {
    const geometry = mesh({ skin: true });
    const handle = queryHandle();
    const morph = Array.from({ length: TRIANGLES * 3 }, () => [100, 0, 2] as const);
    const weights = [1];
    const palette = Float32Array.from(identity);
    palette[12] = 100;
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry }]);
      expect(cast(handle)).toHaveLength(1); // populate a static tree
      setRuntimeQueryRenderItems(handle, [{ geometry, morphTargets: [{ positions: morph }], morphWeights: weights }]);
      expect(cast(handle, rayAt(0, 100))[0]).toMatchObject({ faceIndex: 0, distance: 8 });
      weights[0] = 2;
      expect(cast(handle, rayAt(0, 200))[0]).toMatchObject({ faceIndex: 0, distance: 6 });
      setRuntimeQueryRenderItems(handle, [{ geometry, skinning: { jointCount: 1, matrices: palette } }]);
      expect(cast(handle, rayAt(0, 100))[0]).toMatchObject({ faceIndex: 0, distance: 10 });
      palette[12] = 200;
      expect(cast(handle, rayAt(0, 200))[0]).toMatchObject({ faceIndex: 0, distance: 10 });
    } finally {
      geometry.dispose();
    }
  });

  it("falls back when a vertex reader can change positions without changing bytes", () => {
    const geometry = mesh();
    const handle = queryHandle();
    const vertices = geometry.vertexBuffer;
    const original = vertices.getDecodedAttribute.bind(vertices);
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry }]);
      expect(cast(handle)[0]?.faceIndex).toBe(0); // populate a static tree
      const revision = vertices.revision;
      let shift = 100;
      const reader = vi.spyOn(vertices, "getDecodedAttribute").mockImplementation((index, semantic) => {
        const value = original(index, semantic);
        return semantic === "position" ? [value[0]! + shift, value[1]!, value[2]!] : value;
      });
      try {
        expect(cast(handle, rayAt(0, 100))[0]?.faceIndex).toBe(0);
        shift = 200;
        expect(vertices.revision).toBe(revision);
        expect(cast(handle, rayAt(0, 200))[0]?.faceIndex).toBe(0);
      } finally {
        reader.mockRestore();
      }
      // The same fallback applies if an application patches the prototype
      // after the query module captured the native reader.
      const native = VertexBuffer.prototype.getDecodedAttribute;
      shift = 100;
      const prototype = vi.spyOn(VertexBuffer.prototype, "getDecodedAttribute").mockImplementation(function (this: VertexBuffer, index, semantic) {
        const value = native.call(this, index, semantic);
        return semantic === "position" ? [value[0]! + shift, value[1]!, value[2]!] : value;
      });
      try {
        expect(cast(handle, rayAt(0, 100))[0]?.faceIndex).toBe(0);
        shift = 200;
        expect(cast(handle, rayAt(0, 200))[0]?.faceIndex).toBe(0);
      } finally {
        prototype.mockRestore();
      }
    } finally {
      geometry.dispose();
    }
  });

  it("keeps unaligned draw ranges and non-float position formats on the exact scan", () => {
    const handle = queryHandle();
    const indexed = mesh();
    const integer = mesh({ integer: true });
    try {
      const item: RenderItem = { geometry: indexed, drawRange: { start: 1, count: 300 } };
      setRuntimeQueryRenderItems(handle, [item]);
      const actual = cast(handle, rayAt(17));
      setRuntimeQueryRenderItems(handle, [bruteItem(item)]);
      expect(actual).toEqual(cast(handle, rayAt(17)));

      const candidates = vi.spyOn(sceneQueryBvh, "sceneQueryTriangleCandidates");
      try {
        setRuntimeQueryRenderItems(handle, [{ geometry: integer }]);
        expect(cast(handle)[0]?.faceIndex).toBe(0);
        expect(candidates).toHaveBeenCalledOnce();
        expect(candidates.mock.results[0]!.value).toBeUndefined();
      } finally {
        candidates.mockRestore();
      }
    } finally {
      indexed.dispose();
      integer.dispose();
    }
  });

  it("reuses borrowed geometry for batch members while preserving live IDs and transforms", () => {
    const geometry = mesh();
    const batch = batched.mesh({ maxInstances: 2 });
    const id = batch.addGeometry(geometry);
    const first = batch.addInstance(id);
    const second = batch.addInstance(id);
    batch.setMatrixAt(second, [...identity.slice(0, 14), 2, 1]);
    const candidates = vi.spyOn(sceneQueryBvh, "sceneQueryTriangleCandidates");
    try {
      const options = { nodes: [batch.toJSON()], mode: "mesh" as const };
      expect(raycast(rayAt(0), options).map((hit) => [hit.batchMemberId, hit.distance]))
        .toEqual([[second, 8], [first, 10]]);
      candidates.mockClear();
      expect(raycast(rayAt(0), options)).toHaveLength(2);
      expect(candidates).toHaveBeenCalledTimes(2);
      expect(candidates.mock.results.every((result) => result.value !== undefined && result.value.length < 16)).toBe(true);
      // Public batch matrices can also be edited without a version bump.
      batch.state.matrices[second * 16 + 12] = 150;
      expect(raycast(rayAt(0), options).map((hit) => hit.batchMemberId)).toEqual([first]);
      expect(raycast(rayAt(0, 150), options).map((hit) => hit.batchMemberId)).toEqual([second]);
      batch.setVisibleAt(second, false);
      expect(raycast(rayAt(0), options).map((hit) => hit.batchMemberId)).toEqual([first]);
      batch.dispose();
      expect(raycast(rayAt(0), options)).toEqual([]);
      expect(geometry.vertexBuffer.getAttribute(0, "position")).toEqual([0, 0, 0]);
    } finally {
      candidates.mockRestore();
      batch.dispose();
      geometry.dispose();
    }
  });
});
