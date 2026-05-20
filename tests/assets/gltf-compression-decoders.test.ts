import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Geometry, Texture } from "@galileo3d/rendering";
import {
  GLTFLoader,
  LoadContext,
  createGLTFRenderResources,
  transcodeKTX2BasisTexture,
  createDracoDecoder,
  createMeshoptDecoder,
  type GLTFDracoDecodeDescriptor,
  type GLTFDracoDecoderModule,
  type GLTFDracoNumericArray,
  type GLTFMeshoptDecodeDescriptor,
  type GLTFMeshoptDecoderModule
} from "../../packages/assets/src";

describe("glTF compression decoder hooks", () => {
  it("routes EXT_meshopt_compression bufferViews through the configured decoder", async () => {
    const compressed = Buffer.from([0xde, 0xc0, 0xde]);
    const decoded = Buffer.alloc(36);
    new Float32Array(decoded.buffer, decoded.byteOffset, 9).set([-1, 0, 0, 1, 0, 0, 0, 1, 0]);
    const calls: Array<{ readonly source: readonly number[]; readonly descriptor: GLTFMeshoptDecodeDescriptor }> = [];
    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["EXT_meshopt_compression"],
      buffers: [{ uri: `data:application/octet-stream;base64,${compressed.toString("base64")}`, byteLength: compressed.byteLength }],
      bufferViews: [
        {
          buffer: 0,
          byteOffset: 0,
          byteLength: compressed.byteLength,
          extensions: {
            EXT_meshopt_compression: {
              buffer: 0,
              byteOffset: 0,
              byteLength: compressed.byteLength,
              byteStride: 12,
              count: 3,
              mode: "ATTRIBUTES",
              filter: "NONE"
            }
          }
        }
      ],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
      meshes: [{ name: "meshopt-triangle", primitives: [{ attributes: { POSITION: 0 } }] }]
    };

    const asset = await new GLTFLoader({
      meshoptDecoder(source, descriptor) {
        calls.push({ source: [...source], descriptor });
        return decoded;
      }
    }).load({ url: dataGLTF(gltf) }, context());

    expect(calls).toEqual([{
      source: [...compressed],
      descriptor: {
        bufferViewIndex: 0,
        byteStride: 12,
        count: 3,
        mode: "ATTRIBUTES",
        filter: "NONE"
      }
    }]);
    expect(asset.meshes[0]?.name).toBe("meshopt-triangle");
    expect(asset.meshes[0]?.positions).toEqual([[-1, 0, 0], [1, 0, 0], [0, 1, 0]]);
    expect(asset.meshes[0]?.geometry.bounds).toEqual({ min: [-1, 0, 0], max: [1, 1, 0] });
  });

  it("routes KHR_meshopt_compression bufferViews and COLOR filters through the configured decoder", async () => {
    const compressed = Buffer.from([0xca, 0x10, 0x04]);
    const decoded = Buffer.alloc(36);
    new Float32Array(decoded.buffer, decoded.byteOffset, 9).set([
      -1, -1, 0,
      1, -1, 0,
      0, 1, 0
    ]);
    const calls: Array<{ readonly source: readonly number[]; readonly descriptor: GLTFMeshoptDecodeDescriptor }> = [];
    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_meshopt_compression"],
      buffers: [{ uri: `data:application/octet-stream;base64,${compressed.toString("base64")}`, byteLength: compressed.byteLength }],
      bufferViews: [
        {
          buffer: 0,
          byteOffset: 0,
          byteLength: compressed.byteLength,
          extensions: {
            KHR_meshopt_compression: {
              buffer: 0,
              byteOffset: 0,
              byteLength: compressed.byteLength,
              byteStride: 12,
              count: 3,
              mode: "ATTRIBUTES",
              filter: "COLOR"
            }
          }
        }
      ],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
      meshes: [{ name: "khr-meshopt-color", primitives: [{ attributes: { POSITION: 0 } }] }]
    };

    const asset = await new GLTFLoader({
      meshoptDecoder(source, descriptor) {
        calls.push({ source: [...source], descriptor });
        return decoded;
      }
    }).load({ url: dataGLTF(gltf) }, context());

    expect(calls).toEqual([{
      source: [...compressed],
      descriptor: {
        bufferViewIndex: 0,
        byteStride: 12,
        count: 3,
        mode: "ATTRIBUTES",
        filter: "COLOR"
      }
    }]);
    expect(asset.loaderDiagnostics.extensionsUsed).toContain("KHR_meshopt_compression");
    expect(asset.loaderDiagnostics.unsupportedExtensions).not.toContain("KHR_meshopt_compression");
    expect(asset.loaderDiagnostics.compression.meshopt).toBe(true);
    expect(asset.meshes[0]?.positions).toEqual([[-1, -1, 0], [1, -1, 0], [0, 1, 0]]);
  });

  it("rejects meshopt payloads when no decoder is configured", async () => {
    const compressed = Buffer.from([1, 2, 3]);
    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["EXT_meshopt_compression"],
      buffers: [{ uri: `data:application/octet-stream;base64,${compressed.toString("base64")}`, byteLength: compressed.byteLength }],
      bufferViews: [{
        buffer: 0,
        byteLength: compressed.byteLength,
        extensions: {
          EXT_meshopt_compression: {
            buffer: 0,
            byteLength: compressed.byteLength,
            byteStride: 12,
            count: 3,
            mode: "ATTRIBUTES"
          }
        }
      }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }]
    };

    await expect(new GLTFLoader().load({ url: dataGLTF(gltf) }, context())).rejects.toThrow(/requires a meshoptDecoder/);
  });

  it("adapts the real meshoptimizer decoder API to the glTF loader hook", async () => {
    const compressed = Buffer.from([0x6d, 0x65, 0x73, 0x68]);
    const decoded = Buffer.alloc(36);
    new Float32Array(decoded.buffer, decoded.byteOffset, 9).set([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    const calls: Array<{
      readonly count: number;
      readonly size: number;
      readonly source: readonly number[];
      readonly mode: GLTFMeshoptDecodeDescriptor["mode"];
      readonly filter: GLTFMeshoptDecodeDescriptor["filter"] | undefined;
      readonly readyObserved: boolean;
    }> = [];
    let readyObserved = false;
    const module: GLTFMeshoptDecoderModule = {
      ready: Promise.resolve().then(() => {
        readyObserved = true;
      }),
      decodeGltfBuffer(target, count, size, source, mode, filter) {
        target.set(decoded);
        calls.push({ count, size, source: [...source], mode, filter, readyObserved });
      }
    };
    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["EXT_meshopt_compression"],
      buffers: [{ uri: `data:application/octet-stream;base64,${compressed.toString("base64")}`, byteLength: compressed.byteLength }],
      bufferViews: [{
        buffer: 0,
        byteLength: compressed.byteLength,
        extensions: {
          EXT_meshopt_compression: {
            buffer: 0,
            byteLength: compressed.byteLength,
            byteStride: 12,
            count: 3,
            mode: "ATTRIBUTES",
            filter: "NONE"
          }
        }
      }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }]
    };

    const asset = await new GLTFLoader({
      meshoptDecoder: createMeshoptDecoder(module)
    }).load({ url: dataGLTF(gltf) }, context());

    expect(calls).toEqual([{
      count: 3,
      size: 12,
      source: [...compressed],
      mode: "ATTRIBUTES",
      filter: "NONE",
      readyObserved: true
    }]);
    expect(asset.meshes[0]?.positions).toEqual([[0, 0, 0], [2, 0, 0], [0, 2, 0]]);
  });

  it("routes KHR_draco_mesh_compression primitives through the configured decoder", async () => {
    const compressed = Buffer.from([0xda, 0xc0]);
    const calls: Array<{ readonly source: readonly number[]; readonly descriptor: GLTFDracoDecodeDescriptor }> = [];
    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_draco_mesh_compression"],
      buffers: [{ uri: `data:application/octet-stream;base64,${compressed.toString("base64")}`, byteLength: compressed.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: compressed.byteLength }],
      accessors: [{ componentType: 5126, count: 3, type: "VEC3" }],
      meshes: [{
        name: "draco-triangle",
        primitives: [{
          attributes: { POSITION: 0 },
          extensions: {
            KHR_draco_mesh_compression: {
              bufferView: 0,
              attributes: { POSITION: 7 }
            }
          }
        }]
      }]
    };

    const asset = await new GLTFLoader({
      dracoDecoder(source, descriptor) {
        calls.push({ source: [...source], descriptor });
        return {
          attributes: {
            POSITION: [[0, 0, 0], [2, 0, 0], [0, 2, 0]]
          },
          indices: [0, 1, 2]
        };
      }
    }).load({ url: dataGLTF(gltf) }, context());

    expect(calls).toEqual([{
      source: [...compressed],
      descriptor: {
        meshIndex: 0,
        primitiveIndex: 0,
        bufferViewIndex: 0,
        attributes: { POSITION: 7 }
      }
    }]);
    expect(asset.meshes[0]?.positions).toEqual([[0, 0, 0], [2, 0, 0], [0, 2, 0]]);
    expect(asset.meshes[0]?.indices).toEqual([0, 1, 2]);
  });

  it("normalizes Draco COLOR_0 attributes using their glTF accessor metadata", async () => {
    const compressed = Buffer.from([0xda, 0xc0, 0x10]);
    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_draco_mesh_compression"],
      buffers: [{ uri: `data:application/octet-stream;base64,${compressed.toString("base64")}`, byteLength: compressed.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: compressed.byteLength }],
      accessors: [
        { componentType: 5126, count: 3, type: "VEC3" },
        { componentType: 5123, count: 3, normalized: true, type: "VEC4" }
      ],
      meshes: [{
        name: "draco-colored-triangle",
        primitives: [{
          attributes: { POSITION: 0, COLOR_0: 1 },
          extensions: {
            KHR_draco_mesh_compression: {
              bufferView: 0,
              attributes: { POSITION: 7, COLOR_0: 8 }
            }
          }
        }]
      }]
    };

    const asset = await new GLTFLoader({
      dracoDecoder() {
        return {
          attributes: {
            POSITION: [[0, 0, 0], [2, 0, 0], [0, 2, 0]],
            COLOR_0: [
              [65535, 32768, 0, 65535],
              [64372, 65535, 32768, 65535],
              [0, 65535, 65535, 65535]
            ]
          },
          indices: [0, 1, 2]
        };
      }
    }).load({ url: dataGLTF(gltf) }, context());

    expect(asset.meshes[0]?.colors[0]).toEqual([
      1,
      32768 / 65535,
      0,
      1
    ]);
    expect(asset.meshes[0]?.colors[1]).toEqual([
      64372 / 65535,
      1,
      32768 / 65535,
      1
    ]);
    expect(asset.meshes[0]?.colors.every((color) => color.every((channel) => channel >= 0 && channel <= 1))).toBe(true);
  });

  it("rejects Draco payloads when no decoder is configured", async () => {
    const compressed = Buffer.from([4, 5, 6]);
    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_draco_mesh_compression"],
      buffers: [{ uri: `data:application/octet-stream;base64,${compressed.toString("base64")}`, byteLength: compressed.byteLength }],
      bufferViews: [{ buffer: 0, byteLength: compressed.byteLength }],
      accessors: [{ componentType: 5126, count: 3, type: "VEC3" }],
      meshes: [{
        primitives: [{
          attributes: { POSITION: 0 },
          extensions: {
            KHR_draco_mesh_compression: {
              bufferView: 0,
              attributes: { POSITION: 0 }
            }
          }
        }]
      }]
    };

    await expect(new GLTFLoader().load({ url: dataGLTF(gltf) }, context())).rejects.toThrow(/requires a dracoDecoder/);
  });

  it("adapts the real Draco decoder module API to the glTF loader hook", async () => {
    const compressed = Buffer.from([0xd0, 0xac, 0x00]);
    const destroyed: string[] = [];
    const module = createFakeDracoModule(destroyed);
    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_draco_mesh_compression"],
      buffers: [{ uri: `data:application/octet-stream;base64,${compressed.toString("base64")}`, byteLength: compressed.byteLength }],
      bufferViews: [{ buffer: 0, byteLength: compressed.byteLength }],
      accessors: [{ componentType: 5126, count: 3, type: "VEC3" }],
      meshes: [{
        primitives: [{
          attributes: { POSITION: 0 },
          extensions: {
            KHR_draco_mesh_compression: {
              bufferView: 0,
              attributes: { POSITION: 7 }
            }
          }
        }]
      }]
    };

    const asset = await new GLTFLoader({
      dracoDecoder: createDracoDecoder(module)
    }).load({ url: dataGLTF(gltf) }, context());

    expect(module.decoderSource).toEqual([...compressed]);
    expect(asset.meshes[0]?.positions).toEqual([[0, 0, 0], [3, 0, 0], [0, 3, 0]]);
    expect(asset.meshes[0]?.indices).toEqual([0, 1, 2]);
    expect(destroyed).toEqual([
      "FakeDracoInt32Array",
      "FakeDracoFloat32Array",
      "FakeDracoMesh",
      "FakeDracoDecoderBuffer",
      "FakeDracoDecoder"
    ]);
  });

  it("transcodes a real KTX2/Basis texture into renderer compressed mip levels with RGBA fallback data", async () => {
    const ktx2Bytes = readFileSync(resolve("tests/assets/corpus/ktx2/Rib_N.ktx2"));
    const decoded = await transcodeKTX2BasisTexture(ktx2Bytes, { targetFormat: "etc2-rgba8unorm" });

    expect(decoded.format).toBe("etc2-rgba8unorm");
    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(32);
    expect(decoded.mipLevels?.length).toBeGreaterThan(1);
    expect(decoded.mipLevels?.[0]?.data.byteLength).toBe(1024);
    expect(decoded.fallbackMipLevels?.[0]?.data.byteLength).toBe(32 * 32 * 4);

    const gltf = {
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_texture_basisu"],
      buffers: [{ uri: `data:application/octet-stream;base64,${ktx2Bytes.toString("base64")}`, byteLength: ktx2Bytes.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: ktx2Bytes.byteLength }],
      images: [{ name: "basis-source", bufferView: 0, mimeType: "image/ktx2" }],
      textures: [{ name: "basis-texture", extensions: { KHR_texture_basisu: { source: 0 } } }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      scenes: [{ nodes: [] }],
      scene: 0
    };

    const asset = await new GLTFLoader().load({ url: dataGLTF(gltf) }, context());
    const resources = await createGLTFRenderResources(asset, { ktx2BasisTargetFormat: "etc2-rgba8unorm" });
    const texture = resources.textureLibrary.get("basis-texture");

    expect(asset.images[0]).toMatchObject({ name: "basis-source", mimeType: "image/ktx2" });
    expect([...new Uint8Array(asset.images[0]?.data ?? new ArrayBuffer(0))]).toEqual([...ktx2Bytes]);
    expect(asset.textures[0]).toMatchObject({ name: "basis-texture", source: 0 });
    expect(texture?.format).toBe("etc2-rgba8unorm");
    expect(texture?.textureLevels.length).toBeGreaterThan(1);
    expect(texture?.fallbackTextureLevels[0]?.data.byteLength).toBe(32 * 32 * 4);
    resources.dispose();
  });

  it("shares decoded renderer textures for glTF texture entries that reference the same image", async () => {
    const asset = await new GLTFLoader().load({ url: dataGLTF(sharedImageTexturesGLTF()) }, context());
    let decodeCount = 0;
    const resources = await createGLTFRenderResources(asset, {
      imageDecoder() {
        decodeCount += 1;
        return { width: 2, height: 2, colorSpace: "srgb", data: new Uint8Array(16).fill(255) };
      }
    });

    const first = resources.materialLibrary.get("first-material")?.getParameter("u_baseColorTexture");
    const second = resources.materialLibrary.get("second-material")?.getParameter("u_baseColorTexture");
    const firstTexture = first && typeof first === "object" && "texture" in first ? first.texture : undefined;
    const secondTexture = second && typeof second === "object" && "texture" in second ? second.texture : undefined;

    expect(decodeCount).toBe(1);
    expect(firstTexture).toBe(secondTexture);
    resources.dispose();
  });

  it("disposes partially-created render resources when texture decode fails", async () => {
    const asset = await new GLTFLoader().load({ url: dataGLTF(twoTexturedMaterialsGLTF()) }, context());
    let disposedGeometryCount = 0;
    const disposedTextureLabels: string[] = [];
    const geometryDispose = vi.spyOn(Geometry.prototype, "dispose").mockImplementation(function disposeSpy(this: Geometry) {
      disposedGeometryCount += 1;
      this.vertexBuffer.dispose();
      this.indexBuffer?.dispose();
    });
    const textureDispose = vi.spyOn(Texture.prototype, "dispose").mockImplementation(function disposeSpy(this: Texture) {
      disposedTextureLabels.push(this.label);
      this.disposed = true;
    });
    let decodeCount = 0;

    try {
      await expect(createGLTFRenderResources(asset, {
        imageDecoder() {
          decodeCount += 1;
          if (decodeCount === 2) {
            throw new Error("forced texture decode failure");
          }
          return { width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([255, 255, 255, 255]) };
        }
      })).rejects.toThrow(/forced texture decode failure/);

      expect(disposedGeometryCount).toBeGreaterThanOrEqual(1);
      expect(disposedTextureLabels).toEqual(["first-texture"]);
    } finally {
      geometryDispose.mockRestore();
      textureDispose.mockRestore();
    }
  });
});

function dataGLTF(gltf: unknown): string {
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function context() {
  return new LoadContext();
}

function twoTexturedMaterialsGLTF() {
  const positions = Buffer.alloc(36);
  new Float32Array(positions.buffer, positions.byteOffset, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  return {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${positions.toString("base64")}`, byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    images: [
      { name: "first-image", uri: "data:image/png;base64,AA==" },
      { name: "second-image", uri: "data:image/png;base64,AA==" }
    ],
    textures: [
      { name: "first-texture", source: 0 },
      { name: "second-texture", source: 1 }
    ],
    materials: [
      { name: "first-material", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
      { name: "second-material", pbrMetallicRoughness: { baseColorTexture: { index: 1 } } }
    ],
    meshes: [{
      name: "decode-cleanup-triangle",
      primitives: [{ attributes: { POSITION: 0 }, material: 0 }]
    }]
  };
}

function sharedImageTexturesGLTF() {
  return {
    asset: { version: "2.0" },
    images: [{ name: "shared-image", uri: "data:image/png;base64,AA==" }],
    textures: [
      { name: "first-texture", source: 0 },
      { name: "second-texture", source: 0 }
    ],
    materials: [
      { name: "first-material", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
      { name: "second-material", pbrMetallicRoughness: { baseColorTexture: { index: 1 } } }
    ],
    scenes: [{ nodes: [] }],
    scene: 0
  };
}

function createFakeDracoModule(destroyed: string[]): GLTFDracoDecoderModule & { decoderSource: number[] } {
  const state = { decoderSource: [] as number[] };

  class FakeDracoDecoderBuffer {
    Init(data: Uint8Array): void {
      state.decoderSource = [...data];
    }
  }

  class FakeDracoMesh {
    num_points(): number {
      return 3;
    }

    num_faces(): number {
      return 1;
    }
  }

  class FakeDracoAttribute {
    num_components(): number {
      return 3;
    }
  }

  class FakeDracoFloat32Array implements GLTFDracoNumericArray {
    readonly values = [0, 0, 0, 3, 0, 0, 0, 3, 0];

    size(): number {
      return this.values.length;
    }

    GetValue(index: number): number {
      return this.values[index] ?? Number.NaN;
    }
  }

  class FakeDracoInt32Array implements GLTFDracoNumericArray {
    readonly values = [0, 1, 2];

    size(): number {
      return this.values.length;
    }

    GetValue(index: number): number {
      return this.values[index] ?? -1;
    }
  }

  class FakeDracoDecoder {
    GetEncodedGeometryType(): number {
      return 1;
    }

    DecodeBufferToMesh(): { ok(): boolean; error_msg(): string } {
      return { ok: () => true, error_msg: () => "" };
    }

    GetAttributeByUniqueId(_mesh: FakeDracoMesh, uniqueId: number): FakeDracoAttribute | null {
      return uniqueId === 7 ? new FakeDracoAttribute() : null;
    }

    GetAttributeFloatForAllPoints(): boolean {
      return true;
    }

    GetFaceFromMesh(): boolean {
      return true;
    }
  }

  return {
    TRIANGULAR_MESH: 1,
    Decoder: FakeDracoDecoder,
    DecoderBuffer: FakeDracoDecoderBuffer,
    Mesh: FakeDracoMesh,
    DracoFloat32Array: FakeDracoFloat32Array,
    DracoInt32Array: FakeDracoInt32Array,
    destroy(object) {
      destroyed.push(object?.constructor.name ?? "unknown");
    },
    get decoderSource() {
      return state.decoderSource;
    }
  };
}
