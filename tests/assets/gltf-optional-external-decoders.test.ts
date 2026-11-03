import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import {
  GLTFLoader,
  LoadContext,
  createDracoDecoder,
  createMeshoptDecoder,
  type GLTFDracoDecoderModule
} from "../../packages/assets/src";

// Independently authored triangle. The real installed codecs encode it during
// the test; no external model or precomputed decoder result is substituted.
const positions = [0, 0, 0, 2, 0, 0, 0, 1, 0];
const expectedPositions = ["0,0,0", "0,1,0", "2,0,0"];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network access is disabled in source codec tests"); }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("offline real glTF decoder package integration", () => {
  it("loads an in-memory meshopt-compressed mesh with the real decoder", async () => {
    await MeshoptEncoder.ready;
    const bytes = new Uint8Array(positions.length * 4);
    const view = new DataView(bytes.buffer);
    positions.forEach((value, index) => view.setFloat32(index * 4, value, true));
    const compressed = MeshoptEncoder.encodeGltfBuffer(bytes, 3, 12, "ATTRIBUTES");
    expect(compressed.byteLength).toBeGreaterThan(0);
    const asset = await new GLTFLoader({ meshoptDecoder: createMeshoptDecoder(MeshoptDecoder) })
      .load({ url: dataGLTF(meshoptDocument(compressed)) }, new LoadContext());
    expect(asset.meshes.length).toBeGreaterThan(0);
    expect(asset.meshes[0]?.positions.length).toBeGreaterThan(0);
    expect(sortedPositions(asset.meshes[0]?.positions)).toEqual(expectedPositions);
    expect(asset.loaderDiagnostics.compression.meshopt).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects corrupt meshopt bytes through the real loader and decoder", async () => {
    await expect(new GLTFLoader({ meshoptDecoder: createMeshoptDecoder(MeshoptDecoder) })
      .load({ url: dataGLTF(meshoptDocument(new Uint8Array([0, 1, 2]))) }, new LoadContext()))
      .rejects.toThrow(/meshopt.*bufferView 0.*decode failed/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("loads an in-memory Draco-compressed mesh with the real decoder", async () => {
    const { encoderModule, decoderModule } = await dracoModules();
    const mesh = new encoderModule.Mesh();
    const builder = new encoderModule.MeshBuilder();
    const encoder = new encoderModule.Encoder();
    const output = new encoderModule.DracoInt8Array();
    try {
      const positionId = builder.AddFloatAttributeToMesh(mesh, encoderModule.POSITION, 3, 3, new Float32Array(positions));
      builder.AddFacesToMesh(mesh, 1, new Uint32Array([0, 1, 2]));
      const length = encoder.EncodeMeshToDracoBuffer(mesh, output);
      expect(length).toBeGreaterThan(0);
      const compressed = Uint8Array.from({ length }, (_, index) => output.GetValue(index));
      const asset = await new GLTFLoader({ dracoDecoder: createDracoDecoder(decoderModule) })
        .load({ url: dataGLTF(dracoDocument(compressed, positionId)) }, new LoadContext());
      expect(asset.meshes.length).toBeGreaterThan(0);
      expect(asset.meshes[0]?.positions.length).toBeGreaterThan(0);
      expect(sortedPositions(asset.meshes[0]?.positions)).toEqual(expectedPositions);
      expect(asset.meshes[0]?.indices?.slice().sort()).toEqual([0, 1, 2]);
      expect(asset.loaderDiagnostics.compression.draco).toBe(true);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      for (const resource of [output, encoder, builder, mesh]) encoderModule.destroy(resource);
    }
  });

  it("rejects corrupt Draco bytes through the real loader and decoder", async () => {
    const { decoderModule } = await dracoModules();
    await expect(new GLTFLoader({ dracoDecoder: createDracoDecoder(decoderModule) })
      .load({ url: dataGLTF(dracoDocument(new Uint8Array([0, 1, 2]), 0)) }, new LoadContext()))
      .rejects.toThrow(/glTF Draco primitive 0\/0/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

interface EncoderModule {
  POSITION: number;
  Mesh: new () => object;
  MeshBuilder: new () => {
    AddFloatAttributeToMesh(mesh: object, type: number, count: number, components: number, values: Float32Array): number;
    AddFacesToMesh(mesh: object, count: number, faces: Uint32Array): void;
  };
  Encoder: new () => { EncodeMeshToDracoBuffer(mesh: object, output: { GetValue(index: number): number }): number };
  DracoInt8Array: new () => { GetValue(index: number): number };
  destroy(object: object): void;
}

async function dracoModules(): Promise<{ encoderModule: EncoderModule; decoderModule: GLTFDracoDecoderModule }> {
  const specifier = "draco3d";
  const imported = await import(specifier);
  const factory = (imported.default ?? imported) as {
    createEncoderModule(): Promise<EncoderModule>;
    createDecoderModule(): Promise<GLTFDracoDecoderModule>;
  };
  const [encoderModule, decoderModule] = await Promise.all([factory.createEncoderModule(), factory.createDecoderModule()]);
  return { encoderModule, decoderModule };
}

function meshoptDocument(compressed: Uint8Array) {
  return {
    asset: { version: "2.0" },
    extensionsUsed: ["EXT_meshopt_compression"],
    extensionsRequired: ["EXT_meshopt_compression"],
    buffers: [{ uri: dataBytes(compressed), byteLength: compressed.byteLength }],
    bufferViews: [{
      buffer: 0, byteOffset: 0, byteLength: compressed.byteLength,
      extensions: { EXT_meshopt_compression: {
        buffer: 0, byteOffset: 0, byteLength: compressed.byteLength,
        byteStride: 12, count: 3, mode: "ATTRIBUTES", filter: "NONE"
      } }
    }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
    meshes: [{ name: "offline-meshopt-triangle", primitives: [{ attributes: { POSITION: 0 } }] }]
  };
}

function dracoDocument(compressed: Uint8Array, positionId: number) {
  return {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_draco_mesh_compression"],
    extensionsRequired: ["KHR_draco_mesh_compression"],
    buffers: [{ uri: dataBytes(compressed), byteLength: compressed.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: compressed.byteLength }],
    accessors: [{ componentType: 5126, count: 3, type: "VEC3" }],
    meshes: [{ name: "offline-draco-triangle", primitives: [{
      attributes: { POSITION: 0 },
      extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: positionId } } }
    }] }]
  };
}

function dataBytes(bytes: Uint8Array): string {
  return `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
}

function dataGLTF(gltf: unknown): string {
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function sortedPositions(points: readonly (readonly number[])[] | undefined): string[] {
  return (points ?? []).map((point) => point.map((value) => Number(value.toFixed(5))).join(",")).sort();
}
