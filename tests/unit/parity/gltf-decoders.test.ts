/**
 * threejs-parity lane L4 ST-05: GLTF decoder plumbing parity.
 *
 * - Plain GLB geometry is compared against three r185's `GLTFLoader.parse`
 *   on the same bytes (positions/indices must match exactly).
 * - EXT_meshopt_compression routes through the injected decoder with three's
 *   `decodeGltfBufferAsync(count, stride, source, mode, filter)` contract —
 *   exercised here with three's own `MeshoptDecoder` (real wasm decode of a
 *   pass-through-encoded payload is unavailable without the encoder, so the
 *   descriptor contract is asserted with a capture stub plus a real
 *   `MeshoptDecoder.supported` smoke call).
 * - KHR_draco_mesh_compression routes through `dracoDecoder(source, desc)`
 *   where `desc` carries three's bufferView+attribute-map semantics.
 * - KHR_texture_basisu marks `compression:ktx2-basis` and accepts
 *   `image/ktx2` image mime types like three's GLTFLoader.
 */

import { describe, expect, test } from "vitest";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader.js";
import { LoadContext } from "../../../packages/assets/src/LoadContext.js";
import type {
  GLTFDracoDecodeDescriptor,
  GLTFDracoDecodedPrimitive,
  GLTFMeshoptDecodeDescriptor
} from "../../../packages/assets/src/GLTFLoader.js";
import { GLTFLoader as ThreeGLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/** Build a GLB: [magic,version,length][JSON chunk][BIN chunk], 4-byte padded. */
function glb(json: Record<string, unknown>, bin: ArrayBuffer): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const binBytes = new Uint8Array(bin);
  const binPad = (4 - (binBytes.length % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + binBytes.length + binPad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  let off = 12;
  dv.setUint32(off, jsonBytes.length + jsonPad, true);
  dv.setUint32(off + 4, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, off + 8);
  out.fill(0x20, off + 8 + jsonBytes.length, off + 8 + jsonBytes.length + jsonPad); // glTF: pad JSON chunk with spaces
  off += 8 + jsonBytes.length + jsonPad;
  dv.setUint32(off, binBytes.length + binPad, true);
  dv.setUint32(off + 4, 0x004e4942, true); // "BIN\0"
  out.set(binBytes, off + 8);
  return out.buffer;
}

function dataUrl(bytes: ArrayBuffer): string {
  return `data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`;
}

async function loadAura(bytes: ArrayBuffer, options?: ConstructorParameters<typeof GLTFLoader>[0]) {
  const loader = new GLTFLoader(options);
  const request = { url: dataUrl(bytes) };
  expect(loader.canLoad(request)).toBe(true);
  return loader.load(request, new LoadContext());
}

function loadThree(bytes: ArrayBuffer): Promise<import("three").Group> {
  return new Promise((resolve, reject) => {
    new ThreeGLTFLoader().parse(bytes.slice(0), "", (gltf) => resolve(gltf.scene), reject);
  });
}

/** A single triangle: 3 float32 positions + 3 uint16 indices. */
function triangleGlb(): ArrayBuffer {
  const bin = new ArrayBuffer(42);
  const dv = new DataView(bin);
  const pos = [0, 0, 0, 1, 0, 0, 0, 1, 0.5];
  pos.forEach((v, i) => dv.setFloat32(i * 4, v, true));
  [0, 1, 2].forEach((v, i) => dv.setUint16(36 + i * 2, v, true));
  return glb(
    {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ name: "tri", primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0.5] },
        { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 6 }
      ],
      buffers: [{ byteLength: 42 }]
    },
    bin
  );
}

describe("ST-05 GLTF decoder parity (lane L4)", () => {
  test("plain GLB decodes vertex-for-vertex identically to three's GLTFLoader", async () => {
    const bytes = triangleGlb();
    const [aura, three] = await Promise.all([loadAura(bytes), loadThree(bytes)]);
    const auraMesh = aura.meshes.find((m) => m.primitiveIndex === 0)!;
    const threeMesh = three.children[0] as unknown as {
      geometry: { attributes: { position: { array: Float32Array } }; index: { array: Uint16Array } };
    };
    expect(auraMesh.positions.length).toBe(3);
    expect(auraMesh.indices).toEqual([0, 1, 2]);
    const threePos = Array.from(threeMesh.geometry.attributes.position.array);
    expect(auraMesh.positions.flat()).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0.5]);
    expect(auraMesh.positions.flat()).toEqual(Array.from(threePos));
    expect(Array.from(threeMesh.geometry.index.array)).toEqual([0, 1, 2]);
    expect(auraMesh.geometry.bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 0.5] });
    expect(auraMesh.geometry.vertexCount).toBe(3);
  });

  test("EXT_meshopt_compression invokes the decoder with three's decodeGltfBuffer contract", async () => {
    // 12-byte "compressed" payload standing in for encoded POSITION data.
    const bin = new ArrayBuffer(48);
    new Uint8Array(bin, 0, 12).set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    new Uint16Array(bin, 12, 3).set([0, 1, 2]);
    const bytes = glb(
      {
        asset: { version: "2.0" },
        extensionsUsed: ["EXT_meshopt_compression"],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
        accessors: [
          { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
          { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
        ],
        bufferViews: [
          {
            buffer: 0,
            byteOffset: 0,
            byteLength: 36,
            extensions: {
              EXT_meshopt_compression: {
                buffer: 0,
                byteOffset: 0,
                byteLength: 12,
                byteStride: 12,
                count: 3,
                mode: "ATTRIBUTES",
                filter: "NONE"
              }
            }
          },
          { buffer: 0, byteOffset: 12, byteLength: 6 }
        ],
        buffers: [{ byteLength: 48 }]
      },
      bin
    );

    const captured: { source: Uint8Array; descriptor: GLTFMeshoptDecodeDescriptor }[] = [];
    const decoded = new Float32Array([9, 8, 7, 6, 5, 4, 3, 2, 1]); // the "decoded" 3-vertex payload
    const asset = await loadAura(bytes, {
      meshoptDecoder: (source, descriptor) => {
        captured.push({ source, descriptor });
        return decoded.buffer.slice(0);
      }
    });

    expect(captured).toHaveLength(1);
    // three calls decodeGltfBufferAsync(count, stride, source, mode, filter):
    expect(captured[0]!.descriptor).toMatchObject({
      byteStride: 12, // == three's `stride`
      count: 3, // == three's `count`
      mode: "ATTRIBUTES",
      filter: "NONE"
    });
    // The decoder's output feeds the POSITION accessor.
    expect(asset.meshes[0]!.positions).toEqual([[9, 8, 7], [6, 5, 4], [3, 2, 1]]);
    expect(asset.meshes[0]!.indices).toEqual([0, 1, 2]);
  });

  test("missing meshopt decoder fails closed like three's required-extension path", async () => {
    const bytes = glb(
      {
        asset: { version: "2.0" },
        extensionsUsed: ["EXT_meshopt_compression"],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
        bufferViews: [
          {
            buffer: 0,
            byteOffset: 0,
            byteLength: 12,
            extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: 12, byteStride: 12, count: 3, mode: "ATTRIBUTES" } }
          }
        ],
        buffers: [{ byteLength: 16 }]
      },
      new ArrayBuffer(16)
    );
    await expect(loadAura(bytes)).rejects.toThrow(/meshoptDecoder/);
  });

  test("three's real MeshoptDecoder reports supported (wasm init smoke)", async () => {
    // Ensures the parity contract above targets a live decoder surface, not
    // just a stub — three's GLTFLoader requires `decoder.supported === true`.
    await MeshoptDecoder.ready;
    expect(MeshoptDecoder.supported).toBe(true);
    expect(typeof MeshoptDecoder.decodeGltfBufferAsync).toBe("function");
  });

  test("KHR_draco_mesh_compression routes (source, descriptor) through dracoDecoder", async () => {
    const bin = new ArrayBuffer(16);
    new Uint8Array(bin).set([0xaa, 0xbb, 0xcc, 0xdd]);
    const bytes = glb(
      {
        asset: { version: "2.0" },
        extensionsUsed: ["KHR_draco_mesh_compression"],
        meshes: [
          {
            primitives: [
              {
                attributes: { POSITION: 0 },
                extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } } }
              }
            ]
          }
        ],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 16 }],
        buffers: [{ byteLength: 16 }]
      },
      bin
    );

    const captured: { source: Uint8Array; descriptor: GLTFDracoDecodeDescriptor }[] = [];
    const decodedPrimitive: GLTFDracoDecodedPrimitive = {
      attributes: { POSITION: [[4, 5, 6], [1, 2, 3], [0, 0, 0]] },
      indices: [0, 1, 2]
    };
    const asset = await loadAura(bytes, {
      dracoDecoder: (source, descriptor) => {
        captured.push({ source, descriptor });
        return decodedPrimitive;
      }
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.source.length).toBe(16); // compressed payload bytes
    // three passes the bufferView + glTF semantic→attribute-id map.
    expect(captured[0]!.descriptor).toMatchObject({ meshIndex: 0, primitiveIndex: 0, bufferViewIndex: 0 });
    expect(captured[0]!.descriptor.attributes).toEqual({ POSITION: 0 });
    expect(asset.meshes[0]!.positions).toEqual([[4, 5, 6], [1, 2, 3], [0, 0, 0]]);
    expect(asset.meshes[0]!.indices).toEqual([0, 1, 2]);
  });

  test("missing draco decoder fails closed with the same message class", async () => {
    const bytes = glb(
      {
        asset: { version: "2.0" },
        extensionsUsed: ["KHR_draco_mesh_compression"],
        meshes: [
          {
            primitives: [
              {
                attributes: { POSITION: 0 },
                extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } } }
              }
            ]
          }
        ],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
        buffers: [{ byteLength: 4 }]
      },
      new ArrayBuffer(4)
    );
    await expect(loadAura(bytes)).rejects.toThrow(/dracoDecoder/);
  });

  test("KHR_texture_basisu reports compression:ktx2-basis and accepts image/ktx2", async () => {
    const bin = new ArrayBuffer(36);
    const bytes = glb(
      {
        asset: { version: "2.0" },
        extensionsUsed: ["KHR_texture_basisu"],
        images: [{ uri: "data:image/ktx2;base64,AAAA", mimeType: "image/ktx2" }],
        textures: [{ source: 0 }],
        materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
        buffers: [{ byteLength: 36 }]
      },
      bin
    );
    const asset = await loadAura(bytes);
    expect(asset.images[0]!.mimeType).toBe("image/ktx2");
    expect(asset.textures).toHaveLength(1);
    expect(asset.materials[0]!.baseColorTexture).toBeDefined();
    expect(JSON.stringify(asset.loaderDiagnostics)).toContain("ktx2");
  });
});
