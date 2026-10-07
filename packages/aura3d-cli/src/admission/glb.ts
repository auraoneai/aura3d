/**
 * GLB/glTF → `AdmissionModel` projection (PRD-05 §6.4 Phase 0).
 *
 * Reads the JSON chunk only — accessor `count`/`min`/`max` already declare
 * everything the Phase-0 gates measure (triangle counts, TEXCOORD_0/TANGENT
 * presence, POSITION bounds). The binary chunk is never touched.
 */

import { readFileSync } from "node:fs";
import type { AdmissionMaterial, AdmissionModel, AdmissionPrimitive } from "./gates.js";

interface GltfAccessorLike {
  readonly count?: number;
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

interface GltfTextureInfoLike {
  readonly extensions?: Readonly<Record<string, unknown>>;
}

interface GltfMaterialLike {
  readonly name?: string;
  readonly pbrMetallicRoughness?: {
    readonly baseColorTexture?: GltfTextureInfoLike;
    readonly metallicRoughnessTexture?: GltfTextureInfoLike;
  };
  readonly normalTexture?: GltfTextureInfoLike;
  readonly occlusionTexture?: GltfTextureInfoLike;
  readonly emissiveTexture?: GltfTextureInfoLike;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

interface GltfPrimitiveLike {
  readonly attributes?: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly material?: number;
  readonly mode?: number;
}

export interface AdmissionGltfJson {
  readonly asset?: { readonly generator?: string };
  readonly accessors?: readonly GltfAccessorLike[];
  readonly materials?: readonly GltfMaterialLike[];
  readonly meshes?: readonly { readonly primitives?: readonly GltfPrimitiveLike[] }[];
  readonly nodes?: readonly { readonly mesh?: number; readonly skin?: number }[];
  readonly skins?: readonly { readonly joints?: readonly number[] }[];
}

const GLB_MAGIC = 0x46546c67; // "glTF" little-endian
const GLB_BIN_CHUNK = 0x004e4942; // "BIN\0"

/** Parses a GLB buffer into `{ json, bin }`; `bin` is undefined when the file carries no binary chunk. */
export function parseGlbChunks(buffer: Buffer): { readonly json: AdmissionGltfJson; readonly bin?: Buffer } {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Invalid GLB header. Suggested fix: re-export the asset as binary glTF (.glb).");
  }
  const declared = buffer.readUInt32LE(8);
  if (declared > buffer.length) throw new Error("Invalid GLB length. Suggested fix: run assets validate on the original export.");
  const chunkLength = buffer.readUInt32LE(12);
  if (buffer.toString("utf8", 16, 20) !== "JSON") throw new Error("Invalid GLB JSON chunk. Suggested fix: re-export the GLB.");
  const json = JSON.parse(buffer.toString("utf8", 20, 20 + chunkLength).trim()) as AdmissionGltfJson;
  let offset = 20 + chunkLength;
  let bin: Buffer | undefined;
  while (offset + 8 <= buffer.length && offset + 8 <= declared) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === GLB_BIN_CHUNK) {
      bin = buffer.subarray(offset + 8, offset + 8 + length);
      break;
    }
    offset += 8 + length;
  }
  return { json, bin };
}

/** Reads a `.glb`/`.gltf` file into admission-parsed glTF JSON. */
export function readAdmissionGltf(path: string): { readonly json: AdmissionGltfJson; readonly bin?: Buffer } {
  if (path.toLowerCase().endsWith(".glb")) return parseGlbChunks(readFileSync(path));
  return { json: JSON.parse(readFileSync(path, "utf8")) as AdmissionGltfJson };
}

function hasTextureReference(info: GltfTextureInfoLike | undefined): boolean {
  if (!info) return false;
  // KHR_texture_basisu rewrites live under extensions.
  return info.extensions?.KHR_texture_basisu !== undefined || "index" in info;
}

function toAdmissionMaterial(material: GltfMaterialLike | undefined): AdmissionMaterial {
  if (!material) {
    return { hasBaseColorTexture: false, hasNormalTexture: false, hasMetallicRoughnessTexture: false, hasOcclusionTexture: false, factorOnly: true, unlit: false };
  }
  const pbr = material.pbrMetallicRoughness;
  const hasBaseColorTexture = hasTextureReference(pbr?.baseColorTexture);
  const hasNormalTexture = hasTextureReference(material.normalTexture);
  const hasMetallicRoughnessTexture = hasTextureReference(pbr?.metallicRoughnessTexture);
  const hasOcclusionTexture = hasTextureReference(material.occlusionTexture);
  const hasEmissiveTexture = hasTextureReference(material.emissiveTexture);
  const unlit = material.extensions?.KHR_materials_unlit !== undefined;
  const factorOnly = !hasBaseColorTexture && !hasNormalTexture && !hasMetallicRoughnessTexture && !hasOcclusionTexture && !hasEmissiveTexture;
  return {
    name: material.name,
    hasBaseColorTexture,
    hasNormalTexture,
    hasMetallicRoughnessTexture,
    hasOcclusionTexture,
    factorOnly,
    unlit,
  };
}

/** Projects parsed glTF JSON into the admission gate input. */
export function admissionModelFromGltf(json: AdmissionGltfJson): AdmissionModel {
  const accessors = json.accessors ?? [];
  const primitives: AdmissionPrimitive[] = [];
  let skinnedMesh = false;
  const skinnedMeshIndexes = new Set<number>();
  for (const node of json.nodes ?? []) {
    if (node.mesh !== undefined && node.skin !== undefined) skinnedMeshIndexes.add(node.mesh);
  }
  const boundsMin = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as [number, number, number];
  const boundsMax = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY] as [number, number, number];
  let hasBounds = false;
  (json.meshes ?? []).forEach((mesh, meshIndex) => {
    for (const primitive of mesh.primitives ?? []) {
      const attributes = primitive.attributes ?? {};
      const positionAccessor = typeof attributes.POSITION === "number" ? accessors[attributes.POSITION] : undefined;
      if (positionAccessor?.min && positionAccessor.max && positionAccessor.min.length >= 3 && positionAccessor.max.length >= 3) {
        hasBounds = true;
        for (let axis = 0; axis < 3; axis += 1) {
          boundsMin[axis] = Math.min(boundsMin[axis], positionAccessor.min[axis] ?? Number.POSITIVE_INFINITY);
          boundsMax[axis] = Math.max(boundsMax[axis], positionAccessor.max[axis] ?? Number.NEGATIVE_INFINITY);
        }
      }
      if (primitive.material !== undefined && skinnedMeshIndexes.has(meshIndex)) skinnedMesh = true;
      const indexAccessor = typeof primitive.indices === "number" ? accessors[primitive.indices] : undefined;
      const mode = primitive.mode ?? 4;
      // Non-triangle primitive modes contribute no triangles to the band.
      const triangleCount = mode !== 4
        ? 0
        : indexAccessor?.count !== undefined
          ? Math.floor(indexAccessor.count / 3)
          : positionAccessor?.count !== undefined
            ? Math.floor(positionAccessor.count / 3)
            : 0;
      primitives.push({
        triangleCount,
        materialIndex: primitive.material,
        hasTexcoord0: attributes.TEXCOORD_0 !== undefined,
        hasTangent: attributes.TANGENT !== undefined,
      });
    }
    if (skinnedMeshIndexes.has(meshIndex)) skinnedMesh = true;
  });
  const totalTriangles = primitives.reduce((total, primitive) => total + primitive.triangleCount, 0);
  return {
    generator: json.asset?.generator,
    primitives,
    materials: (json.materials ?? []).map(toAdmissionMaterial),
    skinned: skinnedMesh || (json.skins?.length ?? 0) > 0,
    totalTriangles,
    boundsSize: hasBounds
      ? [boundsMax[0] - boundsMin[0], boundsMax[1] - boundsMin[1], boundsMax[2] - boundsMin[2]]
      : undefined,
  };
}
