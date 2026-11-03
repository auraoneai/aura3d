/**
 * MikkTSpaceTangents (PRD-04 §7.3, P1-6): compare the adapter with the
 * standalone MIT-licensed mikktspace@1.1.1 codec, analytical planar triangles,
 * and the authored NormalTangentMirrorTest tangents. The latter GLB identifies
 * Copyright 2017-2018 Analytical Graphics, Inc., CC-BY 4.0, mesh and textures
 * by Ed Mackey. See benchmarks/quality-rebuild/scenes/prd04/assets.ts and
 * tests/assets/corpus/gltf-100-classification.manifest.json for provenance.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  generateMikkTSpaceTangents,
  mikkTSpaceAvailable,
  setMikkTSpaceModule,
  setMikkTSpaceWorkerFactory,
  type MikkTSpaceModule
} from "../../../../packages/assets/src/MikkTSpaceTangents";

// The package's Node entry is the standalone codec, rather than an engine's
// bundled copy. Its package LICENSE contains the MIT copyright and permission.
const mikktspace = createRequire(import.meta.url)("mikktspace") as MikkTSpaceModule;
const FIXTURE = resolve(__dirname, "../../../../fixtures/asset-corpus/normal-tangent-mirror-test.glb");

const COMP_SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const CTOR: Record<number, new (b: ArrayBuffer, o: number, l: number) => ArrayLike<number> & { length: number }> = {
  5120: Int8Array as never,
  5121: Uint8Array as never,
  5122: Int16Array as never,
  5123: Uint16Array as never,
  5125: Uint32Array as never,
  5126: Float32Array as never
};

/** Minimal GLB reader: JSON + BIN chunk, accessor → typed array. */
function readGlbAttributes(path: string) {
  const buf = readFileSync(path);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));
  const view = (i: number) => {
    const v = json.bufferViews[json.accessors[i].bufferView ?? 0];
    return { off: (v.byteOffset ?? 0) + (json.accessors[i].byteOffset ?? 0) };
  };
  const accessor = (i: number) => {
    const a = json.accessors[i];
    const arr = new (CTOR[a.componentType])(bin.buffer, bin.byteOffset + view(i).off, a.count * COMP_SIZE[a.type]);
    return Array.from(arr);
  };
  const prim = json.meshes[0].primitives[0];
  return {
    positions: new Float32Array(accessor(prim.attributes.POSITION)),
    normals: new Float32Array(accessor(prim.attributes.NORMAL)),
    uvs: new Float32Array(accessor(prim.attributes.TEXCOORD_0)),
    tangents: new Float32Array(accessor(prim.attributes.TANGENT)),
    indices: prim.indices !== undefined ? new Uint32Array(accessor(prim.indices)) : undefined
  };
}

describe("generateMikkTSpaceTangents", () => {
  it("awaits the standalone codec and preserves its output for indexed fixtures", async () => {
    const g = readGlbAttributes(FIXTURE);
    let markReady!: () => void;
    const ready = new Promise<void>((resolveReady) => { markReady = resolveReady; });
    const generateTangents = vi.fn(mikktspace.generateTangents);
    setMikkTSpaceWorkerFactory(undefined);
    setMikkTSpaceModule({ generateTangents, ready });
    expect(mikkTSpaceAvailable()).toBe(true);

    const pending = generateMikkTSpaceTangents({
      positions: g.positions,
      normals: g.normals,
      uvs: g.uvs,
      indices: g.indices
    });
    await Promise.resolve();
    expect(generateTangents).not.toHaveBeenCalled();
    markReady();
    const out = await pending;

    // Expand by the source index independently of the adapter, then invoke the
    // codec directly. Only the glTF handedness conversion changes its output.
    const indices = g.indices ?? Uint32Array.from({ length: g.positions.length / 3 }, (_, i) => i);
    const expand = (source: Float32Array, stride: number) => Float32Array.from(
      Array.from(indices).flatMap((index) => Array.from(source.subarray(index * stride, (index + 1) * stride)))
    );
    const positions = expand(g.positions, 3);
    const normals = expand(g.normals, 3);
    const uvs = expand(g.uvs, 2);
    expect(generateTangents).toHaveBeenCalledTimes(1);
    expect(generateTangents).toHaveBeenCalledWith(positions, normals, uvs);
    const reference = mikktspace.generateTangents(positions, normals, uvs);

    expect(out.length).toBe(reference.length);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBe(i % 4 === 3 ? -reference[i]! : reference[i]);
    }
  }, 30000);

  it("generates the independently calculated tangent directions and mirrored signs", async () => {
    // Two original planar triangles share a +Z normal. In the first, +U runs
    // along +X; the second mirrors U, so +U runs along -X and changes parity.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1]);
    const expected = [
      1, 0, 0, -1, 1, 0, 0, -1, 1, 0, 0, -1,
      -1, 0, 0, 1, -1, 0, 0, 1, -1, 0, 0, 1
    ];
    setMikkTSpaceModule(mikktspace);
    for (const indices of [undefined, new Uint32Array([2, 0, 1, 5, 3, 4])]) {
      const actual = await generateMikkTSpaceTangents({ positions, normals, uvs, indices });
      expect(actual.length).toBe(expected.length);
      expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 6));
    }
  });

  it("regenerated tangents match the authored TANGENT attribute within 1e-3", async () => {
    const g = readGlbAttributes(FIXTURE);
    setMikkTSpaceModule(mikktspace);
    const out = await generateMikkTSpaceTangents({
      positions: g.positions,
      normals: g.normals,
      uvs: g.uvs,
      indices: g.indices
    });
    // unwelded order = index order; compare each generated vertex to the
    // authored tangent at its source vertex.
    const vertexCount = g.tangents.length / 4;
    let compared = 0;
    if (g.indices) {
      for (let i = 0; i < g.indices.length; i++) {
        const v = g.indices[i];
        for (let c = 0; c < 4; c++) {
          expect(Math.abs(out[i * 4 + c] - g.tangents[v * 4 + c])).toBeLessThanOrEqual(1e-3);
        }
        compared++;
      }
    } else {
      for (let i = 0; i < vertexCount * 4; i++) {
        expect(Math.abs(out[i] - g.tangents[i])).toBeLessThanOrEqual(1e-3);
      }
      compared = vertexCount;
    }
    expect(compared).toBeGreaterThan(0);
  }, 30000);
});
