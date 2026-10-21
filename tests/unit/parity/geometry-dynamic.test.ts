/**
 * threejs-parity §5.2 lane L2-03/04/05 (SG-05) — typed-array dynamic geometry,
 * `handle.setGeometry`/`updateAttribute` in-place buffer writes (no realloc
 * while vertex count is stable), and the BufferGeometryUtils helpers
 * (computeNormals / bounds / applyMatrix4 / toNonIndexed / merge) checked
 * against three.js 0.185.1.
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  applyAuraGeometryMatrix4,
  auraGeometryToNonIndexed,
  computeAuraGeometryBounds,
  computeAuraGeometryNormals,
  defineAuraCustomGeometry,
  defineAuraDynamicGeometry,
  mergeAuraGeometries,
  normalizeGeometryAttributes
} from "../../../packages/engine/src/agent-api/RootGeometry";
import { geometry } from "../../../packages/engine/src/agent-api/nodes/geometry";
import { primitive } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import {
  createProductionPrimitiveGeometry,
  createProductionRuntimePrimitiveEntries,
  resolveProductionPrimitiveRuntimeState,
  selectProductionPrimitiveResource
} from "../../../packages/engine/src/agent-api/compiler/primitives";
import type { AuraCustomGeometrySpec } from "../../../packages/engine/src/agent-api/RootGeometry";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";

const NEPS = 1e-5;

function makeRibbon(vertices: number): { positions: Float32Array; uvs: Float32Array; colors: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2);
  const colors = new Float32Array(vertices * 4);
  for (let i = 0; i < vertices; i += 1) {
    const t = i / Math.max(1, vertices - 1);
    positions[i * 3] = t * 8 - 4;
    positions[i * 3 + 1] = Math.sin(t * Math.PI * 4) * 0.5;
    positions[i * 3 + 2] = 0;
    uvs[i * 2] = t;
    uvs[i * 2 + 1] = i % 2;
    colors[i * 4] = t;
    colors[i * 4 + 1] = 1 - t;
    colors[i * 4 + 2] = 0.5;
    colors[i * 4 + 3] = 1;
  }
  // Two-triangle-per-pair strip as an explicit index stream (Uint32 exercise).
  const indices = new Uint32Array((vertices - 2) * 3);
  for (let i = 0; i < vertices - 2; i += 1) {
    indices[i * 3] = i;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = i + 2;
  }
  return { positions, uvs, colors, indices };
}

function threeGeometry(positions: Float32Array, indices: ArrayLike<number>): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
  geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices as ArrayLike<number>), 1));
  return geo;
}

describe("SG-05 dynamic geometry spec + normalization", () => {
  it("accepts a 10k-vertex typed-array ribbon with colors/groups/drawRange", () => {
    const { positions, uvs, colors, indices } = makeRibbon(10_000);
    const spec = defineAuraDynamicGeometry({
      positions,
      uvs,
      colors,
      indices,
      groups: [{ start: 0, count: indices.length, materialIndex: 0 }],
      drawRange: { start: 0, count: indices.length }
    });
    expect(spec.kind).toBe("aura-custom-geometry");
    expect(spec.dynamic).toBe(true);
    expect(spec.positions).toBe(positions);
    expect(spec.indices instanceof Uint32Array || spec.indices instanceof Uint16Array).toBe(true);

    const normalized = normalizeGeometryAttributes(spec);
    expect(normalized.vertexCount).toBe(10_000);
    expect(normalized.positions).toBe(positions);
    expect(normalized.uvs).toBe(uvs);
    expect(normalized.colors).toBe(colors);
    // >65535 max index → uint32 index storage.
    expect(normalized.indices).toBeInstanceOf(Uint32Array);
  });

  it("normalizes tuple + plain-array inputs identically", () => {
    const tuples = defineAuraCustomGeometry({
      positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      indices: [0, 1, 2]
    });
    const flat = defineAuraDynamicGeometry({
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint16Array.from([0, 1, 2])
    });
    const a = normalizeGeometryAttributes(tuples);
    const b = normalizeGeometryAttributes(flat);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.indices!)).toEqual(Array.from(b.indices!));
  });
});

describe("L2-05 helpers vs three 0.185.1", () => {
  const { positions, indices } = makeRibbon(64);
  const spec = defineAuraDynamicGeometry({ positions, indices });

  it("computeNormals matches three's computeVertexNormals within 1e-5", () => {
    const geo = threeGeometry(positions, indices);
    geo.computeVertexNormals();
    const theirs = (geo.getAttribute("normal") as THREE.BufferAttribute).array;
    const ours = computeAuraGeometryNormals({ positions, indices });
    expect(ours.length).toBe(theirs.length);
    for (let i = 0; i < ours.length; i += 1) {
      expect(Math.abs(ours[i]! - theirs[i]!), `normal[${i}]`).toBeLessThanOrEqual(NEPS);
    }
  });

  it("computeBounds matches three's boundingBox", () => {
    const geo = threeGeometry(positions, indices);
    geo.computeBoundingBox();
    const ours = computeAuraGeometryBounds({ positions });
    expect(ours.min[0]).toBeCloseTo(geo.boundingBox!.min.x, 6);
    expect(ours.min[1]).toBeCloseTo(geo.boundingBox!.min.y, 6);
    expect(ours.min[2]).toBeCloseTo(geo.boundingBox!.min.z, 6);
    expect(ours.max[0]).toBeCloseTo(geo.boundingBox!.max.x, 6);
    expect(ours.max[1]).toBeCloseTo(geo.boundingBox!.max.y, 6);
    expect(ours.max[2]).toBeCloseTo(geo.boundingBox!.max.z, 6);
  });

  it("applyMatrix4 matches three's applyMatrix4 on positions+normals", () => {
    const geo = threeGeometry(positions, indices);
    geo.computeVertexNormals();
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(1, 2, 3),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.7, -0.2)),
      new THREE.Vector3(2, 1, 0.5)
    );
    geo.applyMatrix4(matrix);
    const withNormals = {
      ...spec,
      normals: computeAuraGeometryNormals({ positions, indices })
    } as AuraCustomGeometrySpec;
    const moved = applyAuraGeometryMatrix4(withNormals, matrix.elements);
    const threePos = (geo.getAttribute("position") as THREE.BufferAttribute).array;
    const threeNorm = (geo.getAttribute("normal") as THREE.BufferAttribute).array;
    const ours = normalizeGeometryAttributes(moved);
    for (let i = 0; i < threePos.length; i += 1) {
      expect(Math.abs(ours.positions[i]! - threePos[i]!), `position[${i}]`).toBeLessThanOrEqual(1e-4);
      expect(Math.abs(ours.normals![i]! - threeNorm[i]!), `normal[${i}]`).toBeLessThanOrEqual(1e-3);
    }
  });

  it("toNonIndexed matches three's BufferGeometry.toNonIndexed", () => {
    const geo = threeGeometry(positions, indices);
    const theirs = geo.toNonIndexed();
    const theirsPos = (theirs.getAttribute("position") as THREE.BufferAttribute).array;
    const ours = auraGeometryToNonIndexed(spec);
    const flat = normalizeGeometryAttributes(ours);
    expect(flat.positions.length).toBe(theirsPos.length);
    for (let i = 0; i < theirsPos.length; i += 1) {
      expect(Math.abs(flat.positions[i]! - theirsPos[i]!), `position[${i}]`).toBeLessThanOrEqual(NEPS);
    }
  });

  it("merge matches three's mergeGeometries counts and index offsets", () => {
    const a = threeGeometry(positions, indices);
    const b = threeGeometry(positions, indices);
    b.translate(10, 0, 0);
    const theirs = mergeGeometries([a, b], true)!;
    const specB = defineAuraDynamicGeometry({ positions: Float32Array.from(positions, (v, i) => (i % 3 === 0 ? v + 10 : v)), indices });
    const ours = mergeAuraGeometries([spec, specB]);
    const flat = normalizeGeometryAttributes(ours);
    const theirsPos = (theirs.getAttribute("position") as THREE.BufferAttribute).array;
    const theirsIdx = theirs.getIndex()!.array;
    expect(flat.positions.length).toBe(theirsPos.length);
    expect(flat.indices!.length).toBe(theirsIdx.length);
    for (let i = 0; i < theirsIdx.length; i += 1) {
      expect(flat.indices![i], `index[${i}]`).toBe(theirsIdx[i]);
    }
    for (let i = 0; i < theirsPos.length; i += 1) {
      expect(Math.abs(flat.positions[i]! - theirsPos[i]!), `position[${i}]`).toBeLessThanOrEqual(NEPS);
    }
  });
});

describe("SG-04 edges/wireframe spec helpers", () => {
  const cubeSpec = defineAuraCustomGeometry({
    positions: [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
    ],
    indices: [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
      0, 1, 5, 0, 5, 4,
      3, 7, 6, 3, 6, 2
    ]
  });

  it("geometry.edges emits a lines-topology spec matching EdgesGeometry count", () => {
    const geo = threeGeometry(
      Float32Array.from((cubeSpec.positions as readonly (readonly [number, number, number])[]).flatMap((p) => p)),
      cubeSpec.indices as readonly number[]
    );
    const three = new THREE.EdgesGeometry(geo, 1);
    const spec = geometry.edges(cubeSpec, 1);
    expect(spec.topology).toBe("lines");
    const flat = normalizeGeometryAttributes(spec);
    expect(flat.positions.length).toBe((three.getAttribute("position") as THREE.BufferAttribute).array.length);
  });

  it("geometry.wireframe emits a lines-topology spec matching WireframeGeometry count", () => {
    const geo = threeGeometry(
      Float32Array.from((cubeSpec.positions as readonly (readonly [number, number, number])[]).flatMap((p) => p)),
      cubeSpec.indices as readonly number[]
    );
    const three = new THREE.WireframeGeometry(geo);
    const spec = geometry.wireframe(cubeSpec);
    expect(spec.topology).toBe("lines");
    const flat = normalizeGeometryAttributes(spec);
    expect(flat.positions.length).toBe((three.getAttribute("position") as THREE.BufferAttribute).array.length);
  });
});

describe("SG-03 compiler dispatch — no fail-closed kinds remain", () => {
  const kinds = [
    "cone", "circle", "ring", "torusKnot", "polyhedron", "roundedBox",
    "tube", "lathe", "extrude", "shape"
  ] as const;

  for (const kind of kinds) {
    it(`primitives.${kind} compiles to non-empty geometry`, () => {
      const node: AuraPrimitiveNode = {
        kind: "primitive",
        primitive: kind,
        params:
          kind === "tube"
            ? { path: { getPoint: (t: number) => [t * 2 - 1, Math.sin(t * Math.PI), 0] }, tubularSegments: 8, radius: 0.2 }
            : kind === "lathe"
              ? { points: [[0, 0, 0] as const, [0.4, 0.2, 0] as const, [0.2, 0.8, 0] as const] }
              : kind === "extrude" || kind === "shape"
                ? { shape: [[0, 0], [1, 0], [1, 1], [0, 1]], depth: 0.4 }
                : {},
        size: [1, 1, 1]
      };
      const geo = createProductionPrimitiveGeometry(node);
      expect(geo.vertexBuffer.vertexCount).toBeGreaterThan(0);
      expect(geo.topology).toBe("triangles");
      expect(geo.bounds.min[0]).toBeLessThanOrEqual(geo.bounds.max[0]);
    });
  }
});

describe("L2-04 runtime setGeometry/updateAttribute — no realloc on stable vertex count", () => {
  function dynamicNode(vertices: number) {
    const { positions, uvs, indices } = makeRibbon(vertices);
    return {
      node: primitive("custom", {
        geometry: defineAuraDynamicGeometry({ positions, uvs, indices })
      }).runtime({ id: "dyn" }).toJSON() as AuraPrimitiveNode,
      positions,
      uvs,
      indices
    };
  }

  const snap = (node: AuraPrimitiveNode) =>
    ({ nodes: [node] }) as unknown as import("../../../packages/engine/src/agent-api/nodes/types").AuraSceneSnapshot;

  it("setGeometry with same vertex count keeps the VertexBuffer and dirty-marks it", () => {
    const { node, positions, uvs, indices } = dynamicNode(128);
    const registry = createAuraRuntimeNodeRegistry(snap(node));
    const [entry] = createProductionRuntimePrimitiveEntries([node]);
    const state = resolveProductionPrimitiveRuntimeState(entry!, registry);
    const resource = selectProductionPrimitiveResource(entry!, state.node, [0, 0, 10]);
    const buffer = resource.geometry.vertexBuffer;
    expect(buffer.uploadedBuffer).toBeNull();

    const handle = registry.get("dyn")!;
    const moved = Float32Array.from(positions);
    moved[1] += 2;
    handle.setGeometry!({ positions: moved, uvs, indices });

    const nextState = resolveProductionPrimitiveRuntimeState(entry!, registry);
    const next = selectProductionPrimitiveResource(entry!, nextState.node, [0, 0, 10]);
    // No realloc: identical VertexBuffer + Geometry, dirty byte range queued.
    expect(next.geometry.vertexBuffer).toBe(buffer);
    expect(next.geometry).toBe(resource.geometry);
    expect(buffer.getDirtyRange()).not.toBeNull();
    expect(buffer.getAttribute(0, "position")[1]).toBeCloseTo(moved[1]!, 6);
  });

  it("setGeometry with a different vertex count rebuilds the geometry once", () => {
    const { node, positions, uvs, indices } = dynamicNode(64);
    const registry = createAuraRuntimeNodeRegistry(snap(node));
    const [entry] = createProductionRuntimePrimitiveEntries([node]);
    const first = selectProductionPrimitiveResource(
      entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]
    );
    // `first` and `next` are the SAME resource — capture the buffer before the swap.
    const firstBuffer = first.geometry.vertexBuffer;
    const handle = registry.get("dyn")!;
    const grown = makeRibbon(256);
    handle.setGeometry!({ positions: grown.positions, uvs: grown.uvs, indices: grown.indices });
    const next = selectProductionPrimitiveResource(
      entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]
    );
    expect(next.geometry.vertexBuffer).not.toBe(firstBuffer);
    expect(next.geometry.vertexBuffer.vertexCount).toBe(256);
    expect(positions.length / 3).toBe(64);
  });

  it("updateAttribute writes a partial range into the live vertex buffer", () => {
    const { node, positions, uvs, indices } = dynamicNode(32);
    const registry = createAuraRuntimeNodeRegistry(snap(node));
    const [entry] = createProductionRuntimePrimitiveEntries([node]);
    const resource = selectProductionPrimitiveResource(
      entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]
    );
    const buffer = resource.geometry.vertexBuffer;
    buffer.getDirtyRange();

    const handle = registry.get("dyn")!;
    const patch = Float32Array.from([0, 9, 0, 0, -9, 0]); // two positions at offset 4
    handle.updateAttribute!("position", { array: patch, offset: 4 });

    selectProductionPrimitiveResource(
      entry!, resolveProductionPrimitiveRuntimeState(entry!, registry).node, [0, 0, 10]
    );
    expect(buffer.getAttribute(4, "position")).toEqual([0, 9, 0]);
    expect(buffer.getAttribute(5, "position")).toEqual([0, -9, 0]);
    // Queued writes drain exactly once — a second resolve applies nothing new.
    expect(positions.length / 3).toBe(32);
    expect(uvs.length / 2).toBe(32);
    expect(indices.length).toBe(30 * 3);
  });
});
