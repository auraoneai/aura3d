import { describe, expect, it } from "vitest";
import type { AdmissionGltfJson } from "../../../packages/aura3d-cli/src/admission/glb.js";
import { measureTexelDensity } from "../../../packages/aura3d-cli/src/admission/texel.js";

/**
 * G2 texel reader vs EXT_meshopt_compression. A meshopt bufferView's byteOffset
 * addresses the decoded virtual buffer, not the BIN chunk, so an indexed
 * primitive whose index accessor sits in such a view must be skipped. It must
 * never be re-read as a non-indexed primitive (that pairs the wrong vertices).
 */

const camera = { distance: 3, fovDegrees: 50, viewportWidth: 1920, viewportHeight: 1080 };

function oneTriangle(meshoptIndices: boolean): { json: AdmissionGltfJson; bin: Buffer } {
  const bin = Buffer.alloc(92);
  // POSITION (3 × vec3 f32) @0, TEXCOORD_0 (3 × vec2 f32) @36.
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => bin.writeFloatLE(v, i * 4));
  [0, 0, 1, 0, 0, 1].forEach((v, i) => bin.writeFloatLE(v, 36 + i * 4));
  // Indices (3 × u16) @60.
  [0, 1, 2].forEach((v, i) => bin.writeUInt16LE(v, 60 + i * 2));
  // PNG signature + IHDR 256×256 @68 (header sniff only).
  bin.writeUInt32BE(0x89504e47, 68);
  bin.writeUInt32BE(256, 68 + 16);
  bin.writeUInt32BE(256, 68 + 20);
  const json = {
    asset: { version: "2.0" },
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 24 },
      meshoptIndices
        ? { buffer: 0, byteOffset: 60, byteLength: 6, extensions: { EXT_meshopt_compression: { buffer: 0, byteLength: 6, count: 3, byteStride: 2, mode: "TRIANGLES" } } }
        : { buffer: 0, byteOffset: 60, byteLength: 6 },
      { buffer: 0, byteOffset: 68, byteLength: 24 }
    ],
    images: [{ bufferView: 3, mimeType: "image/png" }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }]
  } as unknown as AdmissionGltfJson;
  return { json, bin };
}

describe("PRD-05 G2 texel reader — EXT_meshopt_compression indices", () => {
  it("measures the triangle when the index view is a plain BIN view", () => {
    const { json, bin } = oneTriangle(false);
    const report = measureTexelDensity(json, bin, camera);
    expect(report.trianglesMeasured).toBe(1);
    expect(report.trianglesSkipped).toBe(0);
    expect(report.textureSize).toEqual([256, 256]);
  });

  it("skips (and counts) an indexed primitive whose index view is meshopt-compressed", () => {
    const { json, bin } = oneTriangle(true);
    const report = measureTexelDensity(json, bin, camera);
    expect(report.trianglesMeasured).toBe(0);
    expect(report.trianglesSkipped).toBe(1);
    expect(report.p50).toBeUndefined();
  });
});
