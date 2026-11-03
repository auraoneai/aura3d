import { describe, expect, it } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import type { MorphTargetDelta } from "../../../packages/rendering/src/MorphTarget";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { buildMorphTargetTexture, float32ArrayToFloat16 } from "../../../packages/rendering/src/resources/MorphTargetTexture";

const limits = { maxTextureSize: 4, maxArrayLayers: 32 };
const zero = [0, 0, 0, 0];

function geometry(vertexCount: number): Geometry {
  return new Geometry(new VertexBuffer(VertexFormat.P3N3T4T2, vertexCount), null);
}

function textureResult(result: ReturnType<typeof buildMorphTargetTexture>) {
  if (!("texture" in result)) throw new Error(`Expected a texture: ${result.reason}`);
  return result;
}

const positions0 = [[1, 2, 3], [4, -1, 0.5], [-2, 0, 1]] as const;
const positions1 = [[-2, 4, 1], [1, 3, -1]] as const;
const normals0 = [[0.5, 1, -1], [2, 0, -2]] as const;
const tangents0 = [[-1, 2, 0.5], [3, -2, 1], [4, 1, -0.5]] as const;
const tangents1 = [[2, -1, 4]] as const;

// Literal IEEE-754 binary16 encodings, independent of the production converter.
const halfBits = new Map<number, number>([
  [0, 0x0000], [0.5, 0x3800], [-0.5, 0xb800], [1, 0x3c00], [-1, 0xbc00],
  [2, 0x4000], [-2, 0xc000], [3, 0x4200], [4, 0x4400]
]);

const layouts: readonly {
  name: string;
  normals: boolean;
  tangents: boolean;
  stride: number;
  width: number;
  height: number;
  layers: readonly (readonly (readonly number[])[])[];
}[] = [
  {
    name: "positions only", normals: false, tangents: false, stride: 1, width: 3, height: 1,
    layers: [
      [[1, 2, 3, 0], [4, -1, 0.5, 0], [-2, 0, 1, 0]],
      [[-2, 4, 1, 0], [1, 3, -1, 0], zero]
    ]
  },
  {
    name: "normals only", normals: true, tangents: false, stride: 2, width: 4, height: 2,
    layers: [
      [[1, 2, 3, 0], [0.5, 1, -1, 0], [4, -1, 0.5, 0], [2, 0, -2, 0], [-2, 0, 1, 0], zero, zero, zero],
      [[-2, 4, 1, 0], zero, [1, 3, -1, 0], zero, zero, zero, zero, zero]
    ]
  },
  {
    name: "tangents only", normals: false, tangents: true, stride: 3, width: 4, height: 3,
    layers: [
      [[1, 2, 3, 0], zero, [-1, 2, 0.5, 0], [4, -1, 0.5, 0], zero, [3, -2, 1, 0], [-2, 0, 1, 0], zero, [4, 1, -0.5, 0], zero, zero, zero],
      [[-2, 4, 1, 0], zero, [2, -1, 4, 0], [1, 3, -1, 0], zero, zero, zero, zero, zero, zero, zero, zero]
    ]
  },
  {
    name: "normals and tangents", normals: true, tangents: true, stride: 3, width: 4, height: 3,
    layers: [
      [[1, 2, 3, 0], [0.5, 1, -1, 0], [-1, 2, 0.5, 0], [4, -1, 0.5, 0], [2, 0, -2, 0], [3, -2, 1, 0], [-2, 0, 1, 0], zero, [4, 1, -0.5, 0], zero, zero, zero],
      [[-2, 4, 1, 0], zero, [2, -1, 4, 0], [1, 3, -1, 0], zero, zero, zero, zero, zero, zero, zero, zero]
    ]
  }
];

describe("native morph target texture layout", () => {
  for (const format of ["rgba32f", "rgba16f"] as const) {
    for (const layout of layouts) {
      it(`packs ${layout.name} across rows and layers as ${format}`, () => {
        const targets: MorphTargetDelta[] = [
          {
            positions: positions0,
            ...(layout.normals ? { normals: normals0 } : {}),
            ...(layout.tangents ? { tangents: tangents0 } : {})
          },
          { positions: positions1, ...(layout.tangents ? { tangents: tangents1 } : {}) }
        ];
        const result = textureResult(buildMorphTargetTexture(geometry(3), targets, limits, format));
        expect(result).toMatchObject({
          targetCount: 2, bucket: 4, stride: layout.stride,
          hasNormals: layout.normals, hasTangents: layout.tangents
        });
        expect(result.targets).toBe(targets);
        expect(result.texture).toMatchObject({
          dimension: "2d-array", format, width: layout.width, height: layout.height,
          layers: 4, colorSpace: "linear", disposed: false
        });
        const expected = [
          ...layout.layers.flat(2),
          ...Array<number>(layout.width * layout.height * 4 * 2).fill(0)
        ];
        const data = result.texture.data;
        expect(data).toBeInstanceOf(format === "rgba32f" ? Float32Array : Uint16Array);
        if (!data) throw new Error("Expected texture data");
        expect(data.byteLength).toBe(layout.width * layout.height * 4 * 4 * (format === "rgba32f" ? 4 : 2));
        expect(Array.from(data)).toEqual(format === "rgba32f" ? expected : expected.map((value) => {
          const bits = halfBits.get(value);
          if (bits === undefined) throw new Error(`Missing expected half-float encoding for ${value}`);
          return bits;
        }));
        result.texture.dispose();
        expect(result.texture.disposed).toBe(true);
      });
    }
  }

  it("combines attributes present in different target layers without bleeding between them", () => {
    const targets: MorphTargetDelta[] = [
      { normals: [[1, 0, 0], [0, 2, 0]], tangents: [] },
      { normals: [], tangents: [[0, -1, 0], [0, 0, 4]] }
    ];
    const result = textureResult(buildMorphTargetTexture(geometry(2), targets, limits, "rgba32f"));
    expect(result).toMatchObject({ hasNormals: true, hasTangents: true, stride: 3, targetCount: 2 });
    expect(Array.from(result.texture.data ?? [])).toEqual([
      zero, [1, 0, 0, 0], zero, zero, [0, 2, 0, 0], zero, zero, zero,
      zero, zero, [0, -1, 0, 0], zero, zero, [0, 0, 4, 0], zero, zero,
      ...Array.from({ length: 16 }, () => zero)
    ].flat());
    result.texture.dispose();
  });

  it("rounds half-float mantissa carries without losing the next exponent", () => {
    const values = new Float32Array([
      2 - 2 ** -11 - 2 ** -23, 2 - 2 ** -11, 1.99999, -1.99999,
      1 + 2 ** -11 - 2 ** -23, 1 + 2 ** -11, -(1 + 2 ** -11),
      65504, 65519, 65520, -65520, Infinity, -Infinity, NaN,
      0, -0, 2 ** -24, -(2 ** -24), 2 ** -14 - 2 ** -27, 2 ** -14, -(2 ** -14)
    ]);
    expect(Array.from(float32ArrayToFloat16(values))).toEqual([
      0x3fff, 0x4000, 0x4000, 0xc000,
      0x3c00, 0x3c01, 0xbc01,
      0x7bff, 0x7bff, 0x7bff, 0xfbff, 0x7bff, 0xfbff, 0x7bff,
      0x0000, 0x8000, 0x0000, 0x8000, 0x0000, 0x0400, 0x8400
    ]);
  });

  it("writes the rounded and saturated half-float bits into the fixed slots", () => {
    const targets: MorphTargetDelta[] = [{
      positions: [[1.99999, -1.99999, 65520]],
      tangents: [[2 ** -24, -(2 ** -14), 1 + 2 ** -11]]
    }];
    const result = textureResult(buildMorphTargetTexture(geometry(1), targets, limits));
    expect(Array.from(result.texture.data ?? [])).toEqual([
      0x4000, 0xc000, 0x7bff, 0,
      0, 0, 0, 0,
      0, 0x8400, 0x3c01, 0,
      ...Array(36).fill(0)
    ]);
    result.texture.dispose();
  });

  it("uses the corrected stride when checking texture dimensions", () => {
    const target: MorphTargetDelta = { tangents: [[1, 0, 0], [0, 1, 0]] };
    expect(buildMorphTargetTexture(geometry(2), [target], { maxTextureSize: 2, maxArrayLayers: 4 }))
      .toEqual({ fallback: "cpu", reason: "morph texel height 3 exceeds maxTextureSize 2" });
    expect(buildMorphTargetTexture(geometry(3), [target], { maxTextureSize: 2, maxArrayLayers: 4 }))
      .toEqual({ fallback: "cpu", reason: "vertexCount 3 exceeds maxTextureSize 2" });
    expect(buildMorphTargetTexture(geometry(2), [target], { maxTextureSize: 4, maxArrayLayers: 3 }))
      .toEqual({ fallback: "cpu", reason: "target bucket 4 exceeds maxArrayLayers 3" });
    const atLimit = textureResult(buildMorphTargetTexture(geometry(3), [target], { maxTextureSize: 3, maxArrayLayers: 4 }));
    expect(atLimit.texture).toMatchObject({ width: 3, height: 3, layers: 4 });
    atLimit.texture.dispose();
  });

  it("preserves empty target sets and requests CPU fallback beyond the bucket ceiling", () => {
    const empty = textureResult(buildMorphTargetTexture(geometry(1), [], limits));
    expect(empty).toMatchObject({ targetCount: 0, bucket: 4, stride: 1, hasNormals: false, hasTangents: false });
    expect(Array.from(empty.texture.data ?? [])).toEqual(Array(16).fill(0));
    empty.texture.dispose();

    const targets: MorphTargetDelta[] = Array.from({ length: 33 }, (_, index) => (
      index === 32 ? { tangents: [[1, 0, 0]] } : { positions: [[index, 0, 0]] }
    ));
    expect(buildMorphTargetTexture(geometry(1), targets, limits, "rgba32f")).toEqual({
      fallback: "cpu",
      reason: "targetCount 33 exceeds the {4,8,16,32} bucket ceiling"
    });
    expect(targets).toHaveLength(33);
    expect(targets[32]?.tangents).toEqual([[1, 0, 0]]);
  });

  it("preserves texture updates and disposal", () => {
    const result = textureResult(buildMorphTargetTexture(geometry(1), [{ tangents: [[1, 0, 0]] }], limits, "rgba32f"));
    const data = new Float32Array(result.texture.width * result.texture.height * result.texture.layers * 4);
    data[8] = 2;
    result.texture.update(data);
    expect(result.texture.revision).toBe(1);
    expect(result.texture.data).toBe(data);
    result.texture.dispose();
    expect(result.texture.disposed).toBe(true);
    expect(() => result.texture.update(data)).toThrow("Cannot update a disposed texture");
  });
});
