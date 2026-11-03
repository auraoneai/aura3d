import { describe, expect, it } from "vitest";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { createMD2GLTFAsset, parseMD2, type MD2Asset } from "../../../packages/assets/src/loaders/AnimationFormatLoaders";

/** A small independently encoded triangle with one or more vertex frames. */
function triangleMD2(frameCount: number): MD2Asset {
  const headerSize = 68, uvOffset = headerSize, triangleOffset = uvOffset + 12;
  const frameOffset = triangleOffset + 12, frameSize = 52, endOffset = frameOffset + frameCount * frameSize;
  const bytes = new Uint8Array(endOffset), view = new DataView(bytes.buffer);
  const header = [0x32504449, 8, 16, 16, frameSize, 0, 3, 3, 1, 0, frameCount,
    headerSize, uvOffset, triangleOffset, frameOffset, endOffset, endOffset];
  header.forEach((value, index) => view.setInt32(index * 4, value, true));
  [[0, 0], [16, 0], [0, 16]].forEach(([u, v], index) => {
    view.setInt16(uvOffset + index * 4, u!, true);
    view.setInt16(uvOffset + index * 4 + 2, v!, true);
    view.setUint16(triangleOffset + index * 2, index, true);
    view.setUint16(triangleOffset + 6 + index * 2, index, true);
  });
  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frameOffset + frame * frameSize;
    for (let axis = 0; axis < 3; axis += 1) view.setFloat32(offset + axis * 4, 1, true);
    bytes.set(new TextEncoder().encode(`frame${frame}`), offset + 24);
    bytes.set([0, 0, 0, 0, 1, 0, 0, 0, 0, 1, frame, 0], offset + 40);
  }
  return parseMD2(bytes);
}

/** Any access to a frame's sample time proves the projection passed preflight. */
function failOnSampling(asset: MD2Asset): MD2Asset {
  return {
    ...asset,
    frames: asset.frames.map((frame, index) => index === 0
      ? { ...frame, get time(): number { throw new Error("frame sampled before output preflight"); } }
      : frame)
  };
}

describe("MD2 projection output limits", () => {
  it.each([96, 97])("accepts a single frame at or under a %i-byte output limit", async (maxBytes) => {
    // Three positions, three normals and three UV pairs: (9 + 9 + 6) * 4 bytes.
    const projected = await createMD2GLTFAsset(triangleMD2(1), { maxBytes });
    try {
      expect(projected.meshes[0]?.positions).toEqual([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
      expect(projected.meshes[0]?.morphTargets).toHaveLength(0);
      expect(projected.animations).toHaveLength(0);
    } finally { new GLTFLoader().dispose(projected); }
  });

  it("accepts the exact 184-byte output boundary with morph data and animated weights", async () => {
    // Base 96 + position and normal deltas 72 + times and weights 16.
    const projected = await createMD2GLTFAsset(triangleMD2(2), { maxBytes: 184 });
    try {
      expect(projected.meshes[0]?.morphTargets).toHaveLength(1);
      expect(projected.meshes[0]?.morphTargets[0]?.positions).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 1]]);
      expect(projected.animations[0]?.tracks[0]?.sample(0)).toEqual([0]);
      expect(projected.animations[0]?.tracks[0]?.sample(1)).toEqual([1]);
    } finally { new GLTFLoader().dispose(projected); }
  });

  it.each([95, 167, 168, 175, 176, 183])("rejects a %i-byte limit before sampling either frame", async (maxBytes) => {
    await expect(createMD2GLTFAsset(failOnSampling(triangleMD2(2)), { maxBytes }))
      .rejects.toMatchObject({ code: "OUTPUT_LIMIT" });
  });

  it("counts all targets and animation weights across three frames", async () => {
    // Base 96 + two target pairs 144 + three times 12 + six weights 24.
    await expect(createMD2GLTFAsset(failOnSampling(triangleMD2(3)), { maxBytes: 275 }))
      .rejects.toMatchObject({ code: "OUTPUT_LIMIT" });
    const projected = await createMD2GLTFAsset(triangleMD2(3), { maxBytes: 276 });
    try {
      expect(projected.meshes[0]?.morphTargets).toHaveLength(2);
      expect(projected.animations[0]?.tracks[0]?.sample(1)).toEqual([0, 1]);
    } finally { new GLTFLoader().dispose(projected); }
  });

  it("applies the existing default output limit before expanding a large corner list", async () => {
    const asset = failOnSampling(triangleMD2(1));
    const huge = { ...asset, vertexIndices: { length: 3_000_000 } as unknown as Uint32Array };
    await expect(createMD2GLTFAsset(huge)).rejects.toMatchObject({ code: "OUTPUT_LIMIT" });
  });

  it("rejects unsafe size products without sampling or allocating the forged geometry", async () => {
    const asset = failOnSampling(triangleMD2(1));
    const maxSafeCorners = Number.MAX_SAFE_INTEGER - Number.MAX_SAFE_INTEGER % 3;
    const huge = { ...asset, vertexIndices: { length: maxSafeCorners } as unknown as Uint32Array };
    await expect(createMD2GLTFAsset(huge, { maxBytes: Number.MAX_SAFE_INTEGER }))
      .rejects.toMatchObject({ code: "OUTPUT_LIMIT" });
  });

  it("rejects empty frames, incomplete triangles and mismatched UVs before sampling", async () => {
    const asset = failOnSampling(triangleMD2(1));
    const invalid = [
      { ...asset, frames: [] },
      { ...asset, vertexIndices: new Uint32Array(0), texcoords: new Float32Array(0) },
      { ...asset, vertexIndices: new Uint32Array([0, 1]) },
      { ...asset, texcoords: new Float32Array(5) }
    ];
    for (const input of invalid) {
      await expect(createMD2GLTFAsset(input)).rejects.toMatchObject({ code: "INVALID_MD2" });
    }
  });

  it("preserves existing morph-count and invalid-limit errors", async () => {
    await expect(createMD2GLTFAsset(triangleMD2(3), { maxMorphTargets: 1 }))
      .rejects.toMatchObject({ code: "MORPH_LIMIT" });
    await expect(createMD2GLTFAsset(triangleMD2(1), { maxBytes: 0 }))
      .rejects.toMatchObject({ code: "INVALID_LIMIT" });
  });

  it("retains the combined geometry-and-skin output limit", async () => {
    const asset = triangleMD2(1);
    const pngSignature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const withSkin: MD2Asset = { ...asset, skinAssets: [{ uri: "skin.png", bytes: pngSignature }] };
    await expect(createMD2GLTFAsset(withSkin, { maxBytes: 103 })).rejects.toMatchObject({ code: "OUTPUT_LIMIT" });
    const projected = await createMD2GLTFAsset(withSkin, { maxBytes: 104 });
    try {
      expect([...new Uint8Array(projected.images[0]!.data!)]).toEqual([...pngSignature]);
      expect(projected.meshes[0]?.positions).toEqual([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
    } finally { new GLTFLoader().dispose(projected); }
  });
});
