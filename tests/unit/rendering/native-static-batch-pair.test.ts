import { describe, expect, it } from "vitest";
import {
  planStaticUnlitPair,
  type StaticUnlitPairEnvelope,
  type StaticUnlitPairPlanInput
} from "../../../packages/rendering/src/renderer/StaticUnlitPairPlan";

const vertices = [
  [-0.25, -0.25, 0],
  [0.25, -0.25, 0],
  [0, 0.25, 0]
] as const;

function matrices(left = -0.5, right = 0.5): Float32Array {
  return new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, left, 0, 0, 1,
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, right, 0, 0, 1
  ]);
}

function fixture(
  byteOrder: StaticUnlitPairPlanInput["byteOrder"] = "little-endian",
  indexType: StaticUnlitPairPlanInput["indexType"] = "uint16"
): StaticUnlitPairPlanInput {
  const little = byteOrder === "little-endian";
  // Both views start within larger ArrayBuffers. Positions have a nonzero
  // attribute offset and interleaved padding; the fourth vertex is unused.
  const positions = new Uint8Array(new ArrayBuffer(96), 8, 84);
  const positionData = new DataView(positions.buffer, positions.byteOffset, positions.byteLength);
  for (let i = 0; i < vertices.length; i += 1) {
    for (let axis = 0; axis < 3; axis += 1) positionData.setFloat32(4 + i * 20 + axis * 4, vertices[i]![axis]!, little);
  }
  positionData.setFloat32(64, Number.NaN, little);
  const size = indexType === "uint16" ? 2 : 4;
  const indices = new Uint8Array(new ArrayBuffer(8 + size * 5), 8, size * 5);
  const indexData = new DataView(indices.buffer, indices.byteOffset, indices.byteLength);
  const writeIndex = (at: number, value: number): void => {
    if (indexType === "uint16") indexData.setUint16(at * size, value, little);
    else indexData.setUint32(at * size, value, little);
  };
  writeIndex(0, 99);
  writeIndex(1, 0);
  writeIndex(2, 1);
  writeIndex(3, 2);
  writeIndex(4, 99);
  return {
    positions,
    indices,
    byteOrder,
    positionLayout: { byteOffset: 4, byteStride: 20, vertexCount: 4 },
    indexType,
    indexByteOffset: size,
    indexCount: 3,
    effectiveMvpPair: matrices(),
    viewport: { x: 0, y: 0, width: 100, height: 100 },
    scissor: null,
    vertexPrecision: { precision: 23, rangeMin: 127, rangeMax: 127 },
    subpixelBits: 4
  };
}

function envelopes(input: StaticUnlitPairPlanInput): readonly [StaticUnlitPairEnvelope, StaticUnlitPairEnvelope] {
  const result = planStaticUnlitPair(input);
  if (result.kind !== "disjoint") throw new Error(`Expected disjoint envelopes, got ${result.reason}`);
  return result.envelopes;
}

describe("static unlit pair resident-byte planner", () => {
  it.each([
    ["little-endian", "uint16"],
    ["big-endian", "uint16"],
    ["little-endian", "uint32"],
    ["big-endian", "uint32"]
  ] as const)("encloses a separated pair using %s bytes and %s indices", (order, indexType) => {
    const input = fixture(order, indexType);
    const beforePositions = [...input.positions], beforeIndices = [...input.indices], beforeMatrices = [...input.effectiveMvpPair];
    const [left, right] = envelopes(input);
    // Direct hand calculation: x maps to [12.5, 37.5] and [62.5, 87.5];
    // y maps to [37.5, 62.5]. Padding must expand, never shrink, those bounds.
    expect(left.minX).toBeLessThanOrEqual(12);
    expect(left.maxX).toBeGreaterThanOrEqual(38);
    expect(right.minX).toBeLessThanOrEqual(62);
    expect(right.maxX).toBeGreaterThanOrEqual(88);
    expect(left.minY).toBeLessThanOrEqual(37);
    expect(left.maxY).toBeGreaterThanOrEqual(63);
    expect(left.maxX).toBeLessThan(right.minX);
    expect([...input.positions]).toEqual(beforePositions);
    expect([...input.indices]).toEqual(beforeIndices);
    expect([...input.effectiveMvpPair]).toEqual(beforeMatrices);
  });

  it("keeps envelopes associated with the original draw order", () => {
    const input = { ...fixture(), effectiveMvpPair: matrices(0.5, -0.5) };
    const [first, second] = envelopes(input);
    expect(second.maxX).toBeLessThan(first.minX);
  });

  it("accepts WebGL's zero stride for tightly packed float32 positions", () => {
    const input = fixture();
    const positions = new Uint8Array(36);
    const view = new DataView(positions.buffer);
    for (let i = 0; i < vertices.length; i += 1) {
      for (let axis = 0; axis < 3; axis += 1) view.setFloat32(i * 12 + axis * 4, vertices[i]![axis]!, true);
    }
    const [left, right] = envelopes({
      ...input, positions, positionLayout: { byteOffset: 0, byteStride: 0, vertexCount: 3 }
    });
    expect(left.maxX).toBeLessThan(right.minX);
  });

  it("encloses independently projected vertices under perspective and an offset viewport", () => {
    const input = fixture();
    const mvp = matrices();
    mvp[3] = 0.1;
    mvp[19] = 0.1;
    const viewport = { x: 5, y: 7, width: 200, height: 100 };
    const pair = envelopes({ ...input, effectiveMvpPair: mvp, viewport });
    for (let draw = 0; draw < 2; draw += 1) {
      for (const [x, y] of vertices) {
        const w = 1 + mvp[draw * 16 + 3]! * x;
        const projectedX = viewport.x + ((x + mvp[draw * 16 + 12]!) / w + 1) * viewport.width / 2;
        const projectedY = viewport.y + (y / w + 1) * viewport.height / 2;
        expect(pair[draw]!.minX).toBeLessThan(projectedX);
        expect(pair[draw]!.maxX).toBeGreaterThan(projectedX);
        expect(pair[draw]!.minY).toBeLessThan(projectedY);
        expect(pair[draw]!.maxY).toBeGreaterThan(projectedY);
      }
    }
  });

  it("intersects the submitted scissor and falls back if a draw has no represented coverage", () => {
    const input = fixture();
    const [left, right] = envelopes({ ...input, scissor: { x: 20, y: 0, width: 60, height: 100 } });
    expect(left.minX).toBe(20);
    expect(right.maxX).toBe(80);
    expect(planStaticUnlitPair({ ...input, scissor: { x: 50, y: 0, width: 50, height: 100 } })).toEqual({
      kind: "fallback", reason: "empty-coverage"
    });
  });

  it("declines overlapping or almost touching coverage, including raster padding", () => {
    const input = fixture();
    expect(planStaticUnlitPair({ ...input, effectiveMvpPair: matrices(-0.2, 0.2) })).toEqual({ kind: "fallback", reason: "overlap" });
    expect(planStaticUnlitPair({ ...input, effectiveMvpPair: matrices(-0.26, 0.26) })).toEqual({ kind: "fallback", reason: "overlap" });
  });

  it("rejects near-plane clipping, nonpositive w and transform overflow", () => {
    const input = fixture();
    const nearPlane = matrices();
    nearPlane[14] = -1;
    expect(planStaticUnlitPair({ ...input, effectiveMvpPair: nearPlane })).toEqual({ kind: "fallback", reason: "clipped-or-degenerate" });
    const behindCamera = matrices();
    behindCamera[15] = 0;
    expect(planStaticUnlitPair({ ...input, effectiveMvpPair: behindCamera })).toEqual({ kind: "fallback", reason: "clipped-or-degenerate" });
    const overflow = matrices();
    overflow[0] = 3e38;
    expect(planStaticUnlitPair({ ...input, effectiveMvpPair: overflow })).toEqual({ kind: "fallback", reason: "unstable-transform" });
  });

  it("rejects invalid index ranges, out-of-range indices and referenced nonfinite positions", () => {
    const input = fixture();
    expect(planStaticUnlitPair({ ...input, indexByteOffset: 1 })).toEqual({ kind: "fallback", reason: "invalid-index-range" });
    expect(planStaticUnlitPair({ ...input, indexCount: 4 })).toEqual({ kind: "fallback", reason: "invalid-index-range" });
    const badIndices = input.indices.slice();
    new DataView(badIndices.buffer).setUint16(input.indexByteOffset, 9, true);
    expect(planStaticUnlitPair({ ...input, indices: badIndices })).toEqual({ kind: "fallback", reason: "invalid-index-range" });
    const badPositions = input.positions.slice();
    new DataView(badPositions.buffer).setFloat32(4, Number.POSITIVE_INFINITY, true);
    expect(planStaticUnlitPair({ ...input, positions: badPositions })).toEqual({ kind: "fallback", reason: "invalid-position" });
    expect(planStaticUnlitPair({ ...input, positionLayout: { byteOffset: 2, byteStride: 20, vertexCount: 4 } })).toEqual({
      kind: "fallback", reason: "invalid-position-layout"
    });
  });

  it("rejects insufficient precision, raster evidence and invalid matrices", () => {
    const input = fixture();
    expect(planStaticUnlitPair({ ...input, vertexPrecision: { precision: 16, rangeMin: 127, rangeMax: 127 } })).toEqual({
      kind: "fallback", reason: "unsupported-precision"
    });
    expect(planStaticUnlitPair({ ...input, subpixelBits: 3 })).toEqual({ kind: "fallback", reason: "unsupported-raster" });
    expect(planStaticUnlitPair({ ...input, vertexPrecision: { precision: 23, rangeMin: 125, rangeMax: 127 } })).toEqual({
      kind: "fallback", reason: "unsupported-precision"
    });
    expect(planStaticUnlitPair({ ...input, viewport: { x: 0, y: 0, width: 0, height: 100 } })).toEqual({
      kind: "fallback", reason: "invalid-viewport"
    });
    expect(planStaticUnlitPair({ ...input, scissor: { x: 0, y: 0, width: 2 ** 20, height: 100 } })).toEqual({
      kind: "fallback", reason: "invalid-scissor"
    });
    const invalid = matrices();
    invalid[0] = Number.NaN;
    expect(planStaticUnlitPair({ ...input, effectiveMvpPair: invalid })).toEqual({ kind: "fallback", reason: "invalid-mvp" });
    expect(planStaticUnlitPair({ ...input, effectiveMvpPair: new Float32Array(31) })).toEqual({ kind: "fallback", reason: "invalid-mvp" });
  });

  it("does not inspect proxied or shared typed-array snapshots", () => {
    const input = fixture();
    const proxy = new Proxy(input.positions, {
      get() { throw new Error("proxy getter was invoked"); },
      getPrototypeOf() { throw new Error("proxy prototype was inspected"); }
    });
    expect(planStaticUnlitPair({ ...input, positions: proxy })).toEqual({ kind: "fallback", reason: "invalid-buffer" });
    if (typeof SharedArrayBuffer !== "undefined") {
      expect(planStaticUnlitPair({ ...input, positions: new Uint8Array(new SharedArrayBuffer(64)) })).toEqual({
        kind: "fallback", reason: "invalid-buffer"
      });
    }
  });
});
