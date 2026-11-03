import { describe, expect, it } from "vitest";
import {
  planStaticGeneratedUnlitPair,
  type StaticGeneratedUnlitPairPlanInput
} from "../../../packages/rendering/src/renderer/StaticGeneratedUnlitPairPlan";
import type { StaticUnlitPairEnvelope } from "../../../packages/rendering/src/renderer/StaticUnlitPairPlan";

const vertices = [[-0.18, -0.12, 0], [0.18, -0.12, 0], [0, 0.12, 0]] as const;
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function models(left = -0.55, right = 0.55): Float32Array {
  const first = identity(), second = identity();
  first[12] = left;
  second[12] = right;
  return new Float32Array([...first, ...second]);
}

function fixture(
  byteOrder: StaticGeneratedUnlitPairPlanInput["byteOrder"] = "little-endian",
  indexType: StaticGeneratedUnlitPairPlanInput["indexType"] = "uint16"
): StaticGeneratedUnlitPairPlanInput {
  const little = byteOrder === "little-endian";
  const positions = new Uint8Array(new ArrayBuffer(88), 8, 76);
  const positionData = new DataView(positions.buffer, positions.byteOffset, positions.byteLength);
  for (let vertex = 0; vertex < vertices.length; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) positionData.setFloat32(4 + 20 * vertex + 4 * axis, vertices[vertex]![axis]!, little);
  }
  positionData.setFloat32(64, Number.NaN, little); // Unreferenced vertex.
  const elementSize = indexType === "uint16" ? 2 : 4;
  const indices = new Uint8Array(new ArrayBuffer(8 + 5 * elementSize), 8, 5 * elementSize);
  const indexData = new DataView(indices.buffer, indices.byteOffset, indices.byteLength);
  for (const [index, value] of [99, 0, 1, 2, 99].entries()) {
    if (elementSize === 2) indexData.setUint16(index * elementSize, value, little);
    else indexData.setUint32(index * elementSize, value, little);
  }
  return {
    positions, indices, byteOrder, indexType,
    positionLayout: { byteOffset: 4, byteStride: 20, vertexCount: 4 },
    indexByteOffset: elementSize, indexCount: 3,
    geometryMatrix: identity(), modelMatrixPair: models(), viewProjectionMatrix: identity(),
    viewport: { x: 0, y: 0, width: 100, height: 100 }, scissor: null,
    vertexPrecision: { precision: 23, rangeMin: 127, rangeMax: 127 }, subpixelBits: 4
  };
}

function envelopes(input: StaticGeneratedUnlitPairPlanInput): readonly [StaticUnlitPairEnvelope, StaticUnlitPairEnvelope] {
  const result = planStaticGeneratedUnlitPair(input);
  if (result.kind !== "disjoint") throw new Error(`Expected separated envelopes, got ${result.reason}`);
  return result.envelopes;
}

/** A particular separate-operation f32 evaluation of a matrix product. */
function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array {
  const result = new Float32Array(16);
  for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
    let sum = 0;
    for (let term = 0; term < 4; term += 1) {
      sum = Math.fround(sum + Math.fround(a[4 * term + row]! * b[4 * column + term]!));
    }
    result[4 * column + row] = sum;
  }
  return result;
}

function transform(matrix: ArrayLike<number>, vector: readonly number[]): number[] {
  return [0, 1, 2, 3].map((row) => {
    let sum = 0;
    for (let column = 0; column < 4; column += 1) {
      sum = Math.fround(sum + Math.fround(matrix[4 * column + row]! * vector[column]!));
    }
    return sum;
  });
}

describe("generated unlit pair interval planner", () => {
  it.each([
    ["little-endian", "uint16"], ["big-endian", "uint16"],
    ["little-endian", "uint32"], ["big-endian", "uint32"]
  ] as const)("reads %s positions and %s indices without modifying snapshots", (order, indexType) => {
    const input = fixture(order, indexType);
    const saved = [input.positions.slice(), input.indices.slice(), input.geometryMatrix.slice(), input.modelMatrixPair.slice(), input.viewProjectionMatrix.slice()];
    const [left, right] = envelopes(input);
    expect(left.minX).toBeLessThanOrEqual(14);
    expect(left.maxX).toBeGreaterThanOrEqual(31);
    expect(right.minX).toBeLessThanOrEqual(69);
    expect(right.maxX).toBeGreaterThanOrEqual(86);
    expect(left.maxX).toBeLessThan(right.minX);
    expect([input.positions, input.indices, input.geometryMatrix, input.modelMatrixPair, input.viewProjectionMatrix]).toEqual(saved);
  });

  it("encloses f32 geometry, model, identity-instance and perspective stages in draw order", () => {
    const input = fixture();
    const geometry = new Float32Array([0.7, 0.1, 0, 0, 0.2, 0.6, 0, 0, 0, 0, 1, 0, 0.05, -0.03, 0, 1]);
    const viewProjection = new Float32Array([0.95, 0, 0, 0.04, 0, 0.9, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 1]);
    const viewport = { x: 5, y: 7, width: 200, height: 100 };
    const result = envelopes({ ...input, geometryMatrix: geometry, viewProjectionMatrix: viewProjection, viewport });
    const positionData = new DataView(input.positions.buffer, input.positions.byteOffset, input.positions.byteLength);
    for (let draw = 0; draw < 2; draw += 1) {
      const model = input.modelMatrixPair.slice(draw * 16, draw * 16 + 16);
      const modelWithIdentity = multiply(model, identity());
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const position = [0, 1, 2].map((axis) => positionData.getFloat32(4 + vertex * 20 + axis * 4, true));
        const local = transform(geometry, [...position, 1]);
        const world = transform(modelWithIdentity, local);
        const clip = transform(viewProjection, world);
        const x = viewport.x + (clip[0]! / clip[3]! + 1) * viewport.width / 2;
        const y = viewport.y + (clip[1]! / clip[3]! + 1) * viewport.height / 2;
        expect(result[draw]!.minX).toBeLessThan(x);
        expect(result[draw]!.maxX).toBeGreaterThan(x);
        expect(result[draw]!.minY).toBeLessThan(y);
        expect(result[draw]!.maxY).toBeGreaterThan(y);
      }
    }
    expect(result[0].maxX).toBeLessThan(result[1].minX);
    const reversed = envelopes({ ...input, modelMatrixPair: models(0.55, -0.55) });
    expect(reversed[1].maxX).toBeLessThan(reversed[0].minX);
  });

  it("handles zero stride and conservatively encloses potentially flushed subnormals", () => {
    const input = fixture();
    const positions = new Uint8Array(36);
    const data = new DataView(positions.buffer);
    for (let vertex = 0; vertex < 3; vertex += 1) {
      data.setFloat32(vertex * 12, 2 ** 80, true);
      data.setFloat32(vertex * 12 + 4, vertex === 2 ? 2 ** 80 : 0, true);
      data.setFloat32(vertex * 12 + 8, 0, true);
    }
    const geometry = identity();
    geometry[0] = Number.MIN_VALUE; // Converts to zero on upload to Float32Array.
    geometry[5] = 2 ** -149;
    const [left, right] = envelopes({ ...input, positions, geometryMatrix: geometry,
      positionLayout: { byteOffset: 0, byteStride: 0, vertexCount: 3 } });
    // A driver flushing the subnormal geometry entries renders at each model's
    // translation. Those positions must lie inside the reported envelopes.
    expect(left.minX).toBeLessThan(22.5);
    expect(left.maxX).toBeGreaterThan(22.5);
    expect(right.minX).toBeLessThan(77.5);
    expect(right.maxX).toBeGreaterThan(77.5);
  });

  it("applies the scissor and declines overlapping or empty envelopes", () => {
    const input = fixture();
    const [left, right] = envelopes({ ...input, scissor: { x: 20, y: 0, width: 60, height: 100 } });
    expect(left.minX).toBe(20);
    expect(right.maxX).toBe(80);
    expect(planStaticGeneratedUnlitPair({ ...input, scissor: { x: 50, y: 0, width: 50, height: 100 } })).toEqual({
      kind: "fallback", reason: "empty-coverage"
    });
    expect(planStaticGeneratedUnlitPair({ ...input, modelMatrixPair: models(-0.1, 0.1) })).toEqual({
      kind: "fallback", reason: "overlap"
    });
  });

  it("declines near-w, clipping and unstable intermediate operations", () => {
    const input = fixture();
    const near = identity(); near[15] = 2 ** -12;
    expect(planStaticGeneratedUnlitPair({ ...input, viewProjectionMatrix: near })).toEqual({ kind: "fallback", reason: "clipped-or-degenerate" });
    expect(planStaticGeneratedUnlitPair({ ...input, modelMatrixPair: models(-0.55, 1.5) })).toEqual({
      kind: "fallback", reason: "clipped-or-degenerate"
    });
    const hugeGeometry = identity(); hugeGeometry[0] = 2 ** 125;
    const cancelModels = models(); cancelModels[0] = 2 ** -125; cancelModels[16] = 2 ** -125;
    expect(planStaticGeneratedUnlitPair({ ...input, geometryMatrix: hugeGeometry, modelMatrixPair: cancelModels })).toEqual({
      kind: "fallback", reason: "unstable-transform"
    });
    const beforeCancellation = identity(); beforeCancellation[0] = 2 ** 80; beforeCancellation[5] = 2 ** 80;
    const cancellation = models(); cancellation[0] = 2 ** 50; cancellation[4] = -(2 ** 50);
    expect(planStaticGeneratedUnlitPair({ ...input, geometryMatrix: beforeCancellation, modelMatrixPair: cancellation })).toEqual({
      kind: "fallback", reason: "unstable-transform"
    });
  });

  it("rejects invalid precision, raster state, matrices and indexed bytes", () => {
    const input = fixture();
    expect(planStaticGeneratedUnlitPair({ ...input, vertexPrecision: { precision: 22, rangeMin: 127, rangeMax: 127 } })).toEqual({
      kind: "fallback", reason: "unsupported-precision"
    });
    expect(planStaticGeneratedUnlitPair({ ...input, vertexPrecision: { precision: 23, rangeMin: 125, rangeMax: 127 } })).toEqual({
      kind: "fallback", reason: "unsupported-precision"
    });
    expect(planStaticGeneratedUnlitPair({ ...input, subpixelBits: 3 })).toEqual({ kind: "fallback", reason: "unsupported-raster" });
    expect(planStaticGeneratedUnlitPair({ ...input, viewport: { x: 0, y: 0, width: 0, height: 100 } })).toEqual({
      kind: "fallback", reason: "invalid-viewport"
    });
    expect(planStaticGeneratedUnlitPair({ ...input, geometryMatrix: new Float32Array(15) })).toEqual({ kind: "fallback", reason: "invalid-mvp" });
    const invalidMatrix = input.viewProjectionMatrix.slice(); invalidMatrix[0] = Number.NaN;
    expect(planStaticGeneratedUnlitPair({ ...input, viewProjectionMatrix: invalidMatrix })).toEqual({ kind: "fallback", reason: "invalid-mvp" });
    expect(planStaticGeneratedUnlitPair({ ...input, indexByteOffset: 1 })).toEqual({ kind: "fallback", reason: "invalid-index-range" });
    const badIndices = input.indices.slice(); new DataView(badIndices.buffer).setUint16(input.indexByteOffset, 9, true);
    expect(planStaticGeneratedUnlitPair({ ...input, indices: badIndices })).toEqual({ kind: "fallback", reason: "invalid-index-range" });
    const badPositions = input.positions.slice(); new DataView(badPositions.buffer).setFloat32(4, Infinity, true);
    expect(planStaticGeneratedUnlitPair({ ...input, positions: badPositions })).toEqual({ kind: "fallback", reason: "invalid-position" });
  });

  it("declines proxy and shared snapshots instead of trusting their contents", () => {
    const input = fixture();
    const proxy = new Proxy(input.positions, { getPrototypeOf() { throw new Error("unexpected proxy access"); } });
    expect(planStaticGeneratedUnlitPair({ ...input, positions: proxy })).toEqual({ kind: "fallback", reason: "invalid-buffer" });
    if (typeof SharedArrayBuffer !== "undefined") {
      expect(planStaticGeneratedUnlitPair({ ...input, positions: new Uint8Array(new SharedArrayBuffer(64)) })).toEqual({
        kind: "fallback", reason: "invalid-buffer"
      });
    }
  });
});
