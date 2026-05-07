import type {
  GLTFDracoDecodeDescriptor,
  GLTFDracoDecodedPrimitive,
  GLTFDracoDecoder,
  GLTFMeshoptDecodeDescriptor,
  GLTFMeshoptDecoder
} from "./GLTFLoader";

export interface GLTFMeshoptDecoderModule {
  readonly ready?: PromiseLike<void>;
  decodeGltfBuffer(
    target: Uint8Array,
    count: number,
    size: number,
    source: Uint8Array,
    mode: GLTFMeshoptDecodeDescriptor["mode"],
    filter?: GLTFMeshoptDecodeDescriptor["filter"]
  ): void;
}

export interface GLTFDracoStatus {
  ok(): boolean;
  error_msg(): string;
}

export interface GLTFDracoDecoderBuffer {
  Init(data: Uint8Array, byteLength: number): void;
}

export interface GLTFDracoMesh {
  num_points(): number;
  num_faces(): number;
}

export interface GLTFDracoAttribute {
  num_components(): number;
}

export interface GLTFDracoNumericArray {
  size(): number;
  GetValue(index: number): number;
}

export interface GLTFDracoDecoderInstance {
  GetEncodedGeometryType(buffer: GLTFDracoDecoderBuffer): number;
  DecodeBufferToMesh(buffer: GLTFDracoDecoderBuffer, mesh: GLTFDracoMesh): GLTFDracoStatus;
  GetAttributeByUniqueId(mesh: GLTFDracoMesh, uniqueId: number): GLTFDracoAttribute | null;
  GetAttributeFloatForAllPoints(mesh: GLTFDracoMesh, attribute: GLTFDracoAttribute, out: GLTFDracoNumericArray): boolean;
  GetFaceFromMesh(mesh: GLTFDracoMesh, faceIndex: number, out: GLTFDracoNumericArray): boolean;
}

export interface GLTFDracoDecoderModule {
  readonly TRIANGULAR_MESH: number;
  readonly Decoder: new () => GLTFDracoDecoderInstance;
  readonly DecoderBuffer: new () => GLTFDracoDecoderBuffer;
  readonly Mesh: new () => GLTFDracoMesh;
  readonly DracoFloat32Array: new () => GLTFDracoNumericArray;
  readonly DracoInt32Array: new () => GLTFDracoNumericArray;
  destroy?(object: unknown): void;
}

export function createMeshoptDecoder(module: GLTFMeshoptDecoderModule): GLTFMeshoptDecoder {
  return async (source, descriptor) => {
    if (module.ready) {
      await module.ready;
    }
    const target = new Uint8Array(descriptor.count * descriptor.byteStride);
    module.decodeGltfBuffer(
      target,
      descriptor.count,
      descriptor.byteStride,
      source,
      descriptor.mode,
      descriptor.filter
    );
    return target;
  };
}

export function createDracoDecoder(module: GLTFDracoDecoderModule): GLTFDracoDecoder {
  return (source, descriptor) => {
    const allocated: unknown[] = [];
    const decoder = track(new module.Decoder(), allocated);
    const buffer = track(new module.DecoderBuffer(), allocated);
    const mesh = track(new module.Mesh(), allocated);

    try {
      buffer.Init(source, source.byteLength);
      const geometryType = decoder.GetEncodedGeometryType(buffer);
      if (geometryType !== module.TRIANGULAR_MESH) {
        throw new Error(`glTF Draco primitive ${descriptorLabel(descriptor)} must decode to a triangular mesh`);
      }

      const status = decoder.DecodeBufferToMesh(buffer, mesh);
      if (!status.ok()) {
        throw new Error(`glTF Draco primitive ${descriptorLabel(descriptor)} decode failed: ${status.error_msg()}`);
      }

      return {
        attributes: decodeDracoAttributes(module, decoder, mesh, descriptor, allocated),
        indices: decodeDracoIndices(module, decoder, mesh, descriptor, allocated)
      };
    } finally {
      destroyAllocated(module, allocated);
    }
  };
}

function decodeDracoAttributes(
  module: GLTFDracoDecoderModule,
  decoder: GLTFDracoDecoderInstance,
  mesh: GLTFDracoMesh,
  descriptor: GLTFDracoDecodeDescriptor,
  allocated: unknown[]
): GLTFDracoDecodedPrimitive["attributes"] {
  const pointCount = mesh.num_points();
  const attributes: Record<string, number[][]> = {};

  for (const [semantic, uniqueId] of Object.entries(descriptor.attributes)) {
    const attribute = decoder.GetAttributeByUniqueId(mesh, uniqueId);
    if (!attribute) {
      throw new Error(`glTF Draco primitive ${descriptorLabel(descriptor)} is missing decoded attribute ${semantic} unique id ${uniqueId}`);
    }

    const componentCount = attribute.num_components();
    if (!Number.isInteger(componentCount) || componentCount <= 0) {
      throw new Error(`glTF Draco primitive ${descriptorLabel(descriptor)} decoded attribute ${semantic} has invalid component count ${componentCount}`);
    }

    const values = track(new module.DracoFloat32Array(), allocated);
    if (!decoder.GetAttributeFloatForAllPoints(mesh, attribute, values)) {
      throw new Error(`glTF Draco primitive ${descriptorLabel(descriptor)} failed to read decoded attribute ${semantic}`);
    }
    if (values.size() !== pointCount * componentCount) {
      throw new Error(`glTF Draco primitive ${descriptorLabel(descriptor)} decoded attribute ${semantic} has ${values.size()} values but expected ${pointCount * componentCount}`);
    }

    const rows: number[][] = [];
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      const row: number[] = [];
      for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
        row.push(values.GetValue(pointIndex * componentCount + componentIndex));
      }
      rows.push(row);
    }
    attributes[semantic] = rows;
  }

  return attributes;
}

function decodeDracoIndices(
  module: GLTFDracoDecoderModule,
  decoder: GLTFDracoDecoderInstance,
  mesh: GLTFDracoMesh,
  descriptor: GLTFDracoDecodeDescriptor,
  allocated: unknown[]
): number[] | undefined {
  const faceCount = mesh.num_faces();
  if (faceCount === 0) return undefined;

  const face = track(new module.DracoInt32Array(), allocated);
  const indices: number[] = [];
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    if (!decoder.GetFaceFromMesh(mesh, faceIndex, face)) {
      throw new Error(`glTF Draco primitive ${descriptorLabel(descriptor)} failed to read decoded face ${faceIndex}`);
    }
    if (face.size() !== 3) {
      throw new Error(`glTF Draco primitive ${descriptorLabel(descriptor)} decoded face ${faceIndex} has ${face.size()} indices but expected 3`);
    }
    indices.push(face.GetValue(0), face.GetValue(1), face.GetValue(2));
  }
  return indices;
}

function track<T>(value: T, allocated: unknown[]): T {
  allocated.push(value);
  return value;
}

function destroyAllocated(module: GLTFDracoDecoderModule, allocated: unknown[]): void {
  if (!module.destroy) return;
  for (let index = allocated.length - 1; index >= 0; index -= 1) {
    module.destroy(allocated[index]);
  }
}

function descriptorLabel(descriptor: GLTFDracoDecodeDescriptor): string {
  return `${descriptor.meshIndex}/${descriptor.primitiveIndex}`;
}
