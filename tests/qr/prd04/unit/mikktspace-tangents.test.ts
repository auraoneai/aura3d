/**
 * MikkTSpaceTangents (PRD-04 §7.3, P1-6): injecting r185's real
 * `mikktspace.module.js` reproduces three's
 * `computeMikkTSpaceTangents(geometry, mikktspace, true)` output exactly, and
 * regenerating the stripped TANGENT on NormalTangentMirrorTest lands within
 * 1e-3 per component of the authored attribute.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { computeMikkTSpaceTangents } from "three/examples/jsm/utils/BufferGeometryUtils.js";
// @ts-expect-error vendored MikkTSpace module ships no types
import * as mikktspace from "three/examples/jsm/libs/mikktspace.module.js";
import {
  generateMikkTSpaceTangents,
  mikkTSpaceAvailable,
  setMikkTSpaceModule
} from "../../../../packages/assets/src/MikkTSpaceTangents";

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
  it("reports availability and equals three's computeMikkTSpaceTangents exactly", async () => {
    const g = readGlbAttributes(FIXTURE);
    setMikkTSpaceModule(mikktspace);
    expect(mikkTSpaceAvailable()).toBe(true);

    const out = await generateMikkTSpaceTangents({
      positions: g.positions,
      normals: g.normals,
      uvs: g.uvs,
      indices: g.indices
    });

    // three-side reference on the same primitive
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(g.positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(g.normals, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(g.uvs, 2));
    if (g.indices) geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
    const ref = computeMikkTSpaceTangents(geo, mikktspace, true);
    const refTangents = ref.getAttribute("tangent").array as Float32Array;

    expect(out.length).toBe(refTangents.length);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBe(refTangents[i]);
    }
  }, 30000);

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
