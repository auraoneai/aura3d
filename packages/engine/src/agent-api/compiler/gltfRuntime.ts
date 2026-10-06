// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3 } from "../nodes/types.js";
import { AuraRuntimeError } from "../app/errors.js";
import { animation } from "../nodes/animation.js";
import { identity4, clamp01 } from "../index.js";
import { material } from "../nodes/material.js";
import { model } from "../nodes/model.js";
import { normalizeQuaternion, slerpQuaternion, rotationQuaternion, transformPositions, boundsFromPositions, mergeBounds, multiply4, translation, scaling } from "./sceneMath.js";
import { primitive, primitives } from "../nodes/primitives.js";
import { renderer } from "../devtools/rendererDiagnostics.js";
import { scene } from "../nodes/scene.js";

export interface GltfPrimitive {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs?: Float32Array;
  readonly indices?: Uint16Array | Uint32Array;
  readonly mode: number;
  readonly color?: readonly [number, number, number];
  readonly textureIndex?: number;
  readonly metallicRoughnessTextureIndex?: number;
  readonly occlusionTextureIndex?: number;
  readonly emissiveTextureIndex?: number;
  readonly metallic?: number;
  readonly roughness?: number;
  readonly emissive?: readonly [number, number, number];
  readonly nodeIndex?: number;
  readonly staticWorldMatrix?: Float32Array;
}

export interface GltfModel {
  readonly primitives: readonly GltfPrimitive[];
  readonly textures: readonly (GltfTextureSource | undefined)[];
  readonly nodes: readonly GltfRuntimeNode[];
  readonly animations: readonly GltfAnimationClip[];
  readonly sceneRoots: readonly number[];
  readonly bounds: GltfBounds;
}

interface GltfTextureSource {
  readonly image: TexImageSource;
}

interface GltfRuntimeNode {
  readonly name: string;
  readonly children: readonly number[];
  readonly baseTranslation: AuraVec3;
  readonly baseRotation: readonly [number, number, number, number];
  readonly baseScale: AuraVec3;
  readonly baseMatrix: Float32Array;
}

type GltfAnimationTargetPath = "translation" | "rotation" | "scale";

interface GltfAnimationChannel {
  readonly nodeIndex: number;
  readonly path: GltfAnimationTargetPath;
  readonly times: Float32Array;
  readonly values: Float32Array;
  readonly interpolation: "LINEAR" | "STEP" | "CUBICSPLINE";
}

export interface GltfAnimationClip {
  readonly name: string;
  readonly duration: number;
  readonly channels: readonly GltfAnimationChannel[];
}

export interface GltfBounds {
  readonly min: AuraVec3;
  readonly max: AuraVec3;
}

interface GltfJson {
  readonly scene?: number;
  readonly scenes?: readonly {
    readonly nodes?: readonly number[];
  }[];
  readonly nodes?: readonly {
    readonly name?: string;
    readonly mesh?: number;
    readonly children?: readonly number[];
    readonly matrix?: readonly number[];
    readonly translation?: readonly number[];
    readonly rotation?: readonly number[];
    readonly scale?: readonly number[];
  }[];
  readonly buffers?: readonly { readonly uri?: string; readonly byteLength?: number }[];
  readonly bufferViews?: readonly { readonly buffer: number; readonly byteOffset?: number; readonly byteLength: number; readonly byteStride?: number }[];
  readonly accessors?: readonly {
    readonly bufferView?: number;
    readonly byteOffset?: number;
    readonly componentType: number;
    readonly count: number;
    readonly type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4";
    readonly normalized?: boolean;
    readonly min?: readonly number[];
    readonly max?: readonly number[];
  }[];
  readonly meshes?: readonly {
    readonly primitives?: readonly {
      readonly attributes?: Record<string, number>;
      readonly indices?: number;
      readonly mode?: number;
      readonly material?: number;
    }[];
  }[];
  readonly textures?: readonly {
    readonly source?: number;
    readonly sampler?: number;
  }[];
  readonly images?: readonly {
    readonly uri?: string;
    readonly mimeType?: string;
    readonly bufferView?: number;
  }[];
  readonly materials?: readonly {
    readonly pbrMetallicRoughness?: {
      readonly baseColorFactor?: readonly number[];
      readonly metallicFactor?: number;
      readonly roughnessFactor?: number;
      readonly baseColorTexture?: {
        readonly index: number;
        readonly texCoord?: number;
      };
      readonly metallicRoughnessTexture?: {
        readonly index: number;
        readonly texCoord?: number;
      };
    };
    readonly occlusionTexture?: {
      readonly index: number;
      readonly texCoord?: number;
    };
    readonly emissiveTexture?: {
      readonly index: number;
      readonly texCoord?: number;
    };
    readonly emissiveFactor?: readonly number[];
  }[];
  readonly animations?: readonly {
    readonly name?: string;
    readonly channels?: readonly {
      readonly sampler: number;
      readonly target: {
        readonly node?: number;
        readonly path?: string;
      };
    }[];
    readonly samplers?: readonly {
      readonly input: number;
      readonly output: number;
      readonly interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE";
    }[];
  }[];
}

export async function loadGltfForWebGL(url: string): Promise<GltfModel> {
  const absoluteUrl = new URL(url, document.baseURI).href;
  const response = await fetch(absoluteUrl);
  if (!response.ok) {
    throw new AuraRuntimeError("failed-glb-load", `Aura3D failed to fetch model "${url}" (${response.status}). Suggested fix: confirm the asset is in public/aura-assets and run aura3d assets validate.`);
  }
  const bytes = await response.arrayBuffer();
  const loaded = isGlb(bytes) ? parseGlb(bytes) : { json: JSON.parse(new TextDecoder().decode(bytes)) as GltfJson, buffers: [] as ArrayBuffer[] };
  const buffers = loaded.buffers.length > 0 ? loaded.buffers : await loadExternalGltfBuffers(loaded.json, absoluteUrl);
  return await createGltfModel(loaded.json, buffers, absoluteUrl);
}

function isGlb(bytes: ArrayBuffer): boolean {
  return new DataView(bytes).getUint32(0, true) === 0x46546c67;
}

function parseGlb(bytes: ArrayBuffer): { readonly json: GltfJson; readonly buffers: readonly ArrayBuffer[] } {
  const view = new DataView(bytes);
  if (view.getUint32(4, true) !== 2) {
    throw new AuraRuntimeError("failed-glb-load", "Aura3D only supports glTF 2.0 GLB assets in the browser renderer.");
  }
  let offset = 12;
  let json: GltfJson | undefined;
  const buffers: ArrayBuffer[] = [];
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunk = bytes.slice(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
    if (chunkType === 0x004e4942) buffers.push(chunk);
    offset += 8 + chunkLength;
  }
  if (!json) throw new AuraRuntimeError("failed-glb-load", "Aura3D could not find a JSON chunk in the GLB asset.");
  return { json, buffers };
}

async function loadExternalGltfBuffers(json: GltfJson, modelUrl: string): Promise<readonly ArrayBuffer[]> {
  return await Promise.all((json.buffers ?? []).map(async (buffer) => {
    if (!buffer.uri) return new ArrayBuffer(0);
    if (buffer.uri.startsWith("data:")) return dataUriToArrayBuffer(buffer.uri);
    const response = await fetch(new URL(buffer.uri, modelUrl).href);
    if (!response.ok) throw new AuraRuntimeError("failed-glb-load", `Aura3D failed to fetch glTF buffer "${buffer.uri}" (${response.status}).`);
    return await response.arrayBuffer();
  }));
}

function dataUriToArrayBuffer(uri: string): ArrayBuffer {
  const [, data = ""] = uri.split(",", 2);
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function createGltfModel(json: GltfJson, buffers: readonly ArrayBuffer[], modelUrl: string): Promise<GltfModel> {
  const primitives: GltfPrimitive[] = [];
  const textures = await createGltfTextureSources(json, buffers, modelUrl);
  const nodes = createGltfRuntimeNodes(json);
  const animations = createGltfAnimationClips(json, buffers);
  const sceneRoots = resolveGltfSceneRoots(json);
  let bounds: GltfBounds | undefined;

  const pushMesh = (meshIndex: number, matrix: Float32Array, nodeIndex?: number): void => {
    const mesh = json.meshes?.[meshIndex];
    if (!mesh) return;
    for (const primitive of mesh.primitives ?? []) {
      const positionAccessor = primitive.attributes?.POSITION;
      if (positionAccessor === undefined) continue;
      const sourcePositions = readAccessor(json, buffers, positionAccessor, 3);
      const sourceNormals = primitive.attributes?.NORMAL === undefined
        ? createDefaultNormals(sourcePositions.length / 3)
        : readAccessor(json, buffers, primitive.attributes.NORMAL, 3);
      const sourceUvs = primitive.attributes?.TEXCOORD_0 === undefined
        ? undefined
        : readAccessor(json, buffers, primitive.attributes.TEXCOORD_0, 2);
      const indices = primitive.indices === undefined ? undefined : readIndices(json, buffers, primitive.indices);
      const materialInfo = materialRenderInfo(json, primitive.material, sourceUvs);
      const primitiveBounds = boundsFromPositions(transformPositions(sourcePositions, matrix));
      bounds = bounds ? mergeBounds(bounds, primitiveBounds) : primitiveBounds;
      primitives.push({
        positions: sourcePositions,
        normals: sourceNormals,
        ...(sourceUvs ? { uvs: sourceUvs } : {}),
        ...(indices ? { indices } : {}),
        mode: primitive.mode ?? 4,
        color: materialInfo.color,
        ...(materialInfo.textureIndex !== undefined ? { textureIndex: materialInfo.textureIndex } : {}),
        ...(materialInfo.metallicRoughnessTextureIndex !== undefined ? { metallicRoughnessTextureIndex: materialInfo.metallicRoughnessTextureIndex } : {}),
        ...(materialInfo.occlusionTextureIndex !== undefined ? { occlusionTextureIndex: materialInfo.occlusionTextureIndex } : {}),
        ...(materialInfo.emissiveTextureIndex !== undefined ? { emissiveTextureIndex: materialInfo.emissiveTextureIndex } : {}),
        metallic: materialInfo.metallic,
        roughness: materialInfo.roughness,
        emissive: materialInfo.emissive,
        ...(nodeIndex !== undefined ? { nodeIndex } : {}),
        staticWorldMatrix: matrix
      });
    }
  };

  const visitNode = (nodeIndex: number, parentMatrix: Float32Array, stack: Set<number>): void => {
    if (stack.has(nodeIndex)) return;
    const node = json.nodes?.[nodeIndex];
    if (!node) return;
    const localMatrix = gltfNodeMatrix(node);
    const worldMatrix = multiply4(parentMatrix, localMatrix);
    const nextStack = new Set(stack);
    nextStack.add(nodeIndex);
    if (node.mesh !== undefined) pushMesh(node.mesh, worldMatrix, nodeIndex);
    for (const childIndex of node.children ?? []) visitNode(childIndex, worldMatrix, nextStack);
  };

  if (json.nodes?.length && sceneRoots.length) {
    for (const nodeIndex of sceneRoots) visitNode(nodeIndex, identity4(), new Set());
  } else if (json.nodes?.length) {
    for (const nodeIndex of json.nodes.map((_, nodeIndex) => nodeIndex)) visitNode(nodeIndex, identity4(), new Set());
  } else {
    for (let meshIndex = 0; meshIndex < (json.meshes?.length ?? 0); meshIndex += 1) pushMesh(meshIndex, identity4());
  }

  if (primitives.length === 0) {
    throw new AuraRuntimeError("failed-glb-load", "Aura3D found no mesh primitives with POSITION data in the model. Suggested fix: export a visible mesh to GLB/glTF.");
  }
  return { primitives, textures, nodes, animations, sceneRoots, bounds: bounds ?? { min: [-1, -1, -1], max: [1, 1, 1] } };
}

function resolveGltfSceneRoots(json: GltfJson): readonly number[] {
  const nodeCount = json.nodes?.length ?? 0;
  const sceneRoots = json.scenes?.[json.scene ?? 0]?.nodes?.filter((nodeIndex) => nodeIndex >= 0 && nodeIndex < nodeCount) ?? [];
  if (sceneRoots.length > 0) return sceneRoots;
  if (nodeCount === 0) return [];
  const childNodes = new Set<number>();
  for (const node of json.nodes ?? []) {
    for (const childIndex of node.children ?? []) childNodes.add(childIndex);
  }
  const roots = (json.nodes ?? []).map((_, nodeIndex) => nodeIndex).filter((nodeIndex) => !childNodes.has(nodeIndex));
  return roots.length > 0 ? roots : (json.nodes ?? []).map((_, nodeIndex) => nodeIndex);
}

function createGltfRuntimeNodes(json: GltfJson): readonly GltfRuntimeNode[] {
  return (json.nodes ?? []).map((node) => {
    const translate = node.translation ?? [0, 0, 0];
    const rotate = node.rotation ?? [0, 0, 0, 1];
    const scale = node.scale ?? [1, 1, 1];
    return {
      name: node.name ?? "",
      children: node.children ?? [],
      baseTranslation: [translate[0] ?? 0, translate[1] ?? 0, translate[2] ?? 0],
      baseRotation: normalizeQuaternion([rotate[0] ?? 0, rotate[1] ?? 0, rotate[2] ?? 0, rotate[3] ?? 1]),
      baseScale: [scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1],
      baseMatrix: gltfNodeMatrix(node)
    };
  });
}

function createGltfAnimationClips(json: GltfJson, buffers: readonly ArrayBuffer[]): readonly GltfAnimationClip[] {
  return (json.animations ?? []).map((animation, animationIndex) => {
    const channels: GltfAnimationChannel[] = [];
    let duration = 0;
    for (const channel of animation.channels ?? []) {
      const sampler = animation.samplers?.[channel.sampler];
      const nodeIndex = channel.target.node;
      const path = parseGltfAnimationPath(channel.target.path);
      if (!sampler || nodeIndex === undefined || !path) continue;
      const times = readAccessor(json, buffers, sampler.input, 1);
      const values = readAccessor(json, buffers, sampler.output, path === "rotation" ? 4 : 3);
      if (times.length === 0 || values.length === 0) continue;
      duration = Math.max(duration, times[times.length - 1] ?? 0);
      channels.push({
        nodeIndex,
        path,
        times,
        values,
        interpolation: sampler.interpolation ?? "LINEAR"
      });
    }
    return {
      name: animation.name ?? `animation-${animationIndex + 1}`,
      duration,
      channels
    };
  }).filter((clip) => clip.channels.length > 0);
}

function parseGltfAnimationPath(path: string | undefined): GltfAnimationTargetPath | undefined {
  return path === "translation" || path === "rotation" || path === "scale" ? path : undefined;
}

async function createGltfTextureSources(json: GltfJson, buffers: readonly ArrayBuffer[], modelUrl: string): Promise<readonly (GltfTextureSource | undefined)[]> {
  const images = new Map<number, Promise<TexImageSource | undefined>>();
  const loadImage = (imageIndex: number): Promise<TexImageSource | undefined> => {
    const existing = images.get(imageIndex);
    if (existing) return existing;
    const promise = loadGltfImage(json, buffers, imageIndex, modelUrl).catch(() => undefined);
    images.set(imageIndex, promise);
    return promise;
  };
  return await Promise.all((json.textures ?? []).map(async (texture) => {
    if (texture.source === undefined) return undefined;
    const image = await loadImage(texture.source);
    return image ? { image } : undefined;
  }));
}

async function loadGltfImage(json: GltfJson, buffers: readonly ArrayBuffer[], imageIndex: number, modelUrl: string): Promise<TexImageSource | undefined> {
  const image = json.images?.[imageIndex];
  if (!image) return undefined;
  let blob: Blob;
  if (image.bufferView !== undefined) {
    const view = json.bufferViews?.[image.bufferView];
    if (!view) return undefined;
    const buffer = buffers[view.buffer];
    if (!buffer) return undefined;
    const bytes = new Uint8Array(buffer, view.byteOffset ?? 0, view.byteLength);
    blob = new Blob([bytes], { type: image.mimeType ?? "application/octet-stream" });
  } else if (image.uri?.startsWith("data:")) {
    const response = await fetch(image.uri);
    blob = await response.blob();
  } else if (image.uri) {
    const response = await fetch(new URL(image.uri, modelUrl).href);
    if (!response.ok) return undefined;
    blob = await response.blob();
  } else {
    return undefined;
  }
  if (typeof createImageBitmap === "function") return await createImageBitmap(blob);
  return await blobToHtmlImage(blob);
}

async function blobToHtmlImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    if (typeof image.decode === "function") await image.decode();
    else await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Aura3D failed to decode glTF image."));
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function materialRenderInfo(json: GltfJson, materialIndex: number | undefined, uvs: Float32Array | undefined): {
  readonly color?: readonly [number, number, number];
  readonly textureIndex?: number;
  readonly metallicRoughnessTextureIndex?: number;
  readonly occlusionTextureIndex?: number;
  readonly emissiveTextureIndex?: number;
  readonly metallic: number;
  readonly roughness: number;
  readonly emissive: readonly [number, number, number];
} {
  if (materialIndex === undefined) {
    return { metallic: 0, roughness: 0.72, emissive: [0, 0, 0] };
  }
  const materialEntry = json.materials?.[materialIndex];
  const pbr = materialEntry?.pbrMetallicRoughness;
  const base = pbr?.baseColorFactor;
  const emissive = materialEntry?.emissiveFactor;
  return {
    ...(base && base.length >= 3 ? { color: [clamp01(base[0]!), clamp01(base[1]!), clamp01(base[2]!)] as const } : {}),
    ...textureRef(pbr?.baseColorTexture, uvs, "textureIndex"),
    ...textureRef(pbr?.metallicRoughnessTexture, uvs, "metallicRoughnessTextureIndex"),
    ...textureRef(materialEntry?.occlusionTexture, uvs, "occlusionTextureIndex"),
    ...textureRef(materialEntry?.emissiveTexture, uvs, "emissiveTextureIndex"),
    metallic: clamp01(pbr?.metallicFactor ?? 0),
    roughness: clamp01(pbr?.roughnessFactor ?? 0.72),
    emissive: emissive && emissive.length >= 3
      ? [clamp01(emissive[0]!), clamp01(emissive[1]!), clamp01(emissive[2]!)]
      : [0, 0, 0]
  };
}

function textureRef<K extends string>(
  texture: { readonly index: number; readonly texCoord?: number } | undefined,
  uvs: Float32Array | undefined,
  key: K
): Partial<Record<K, number>> {
  if (!texture || !uvs || texture.texCoord !== undefined && texture.texCoord !== 0) return {};
  return { [key]: texture.index } as Partial<Record<K, number>>;
}

function readAccessor(json: GltfJson, buffers: readonly ArrayBuffer[], accessorIndex: number, expectedComponents: number): Float32Array {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.bufferView === undefined) throw new AuraRuntimeError("failed-glb-load", `Aura3D could not read glTF accessor ${accessorIndex}.`);
  const componentCount = componentCountForAccessor(accessor.type);
  const output = new Float32Array(accessor.count * expectedComponents);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new AuraRuntimeError("failed-glb-load", `Aura3D could not read glTF bufferView ${accessor.bufferView}.`);
  const buffer = buffers[view.buffer];
  if (!buffer) throw new AuraRuntimeError("failed-glb-load", `Aura3D could not read glTF buffer ${view.buffer}.`);
  const data = new DataView(buffer);
  const componentBytes = componentByteLength(accessor.componentType);
  const stride = view.byteStride ?? componentBytes * componentCount;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let row = 0; row < accessor.count; row += 1) {
    for (let component = 0; component < expectedComponents; component += 1) {
      output[row * expectedComponents + component] = component < componentCount
        ? readAccessorComponent(data, start + row * stride + component * componentBytes, accessor.componentType, Boolean(accessor.normalized))
        : component === 1 ? 1 : 0;
    }
  }
  return output;
}

function readIndices(json: GltfJson, buffers: readonly ArrayBuffer[], accessorIndex: number): Uint16Array | Uint32Array {
  const values = readAccessor(json, buffers, accessorIndex, 1);
  const max = values.reduce((largest, value) => Math.max(largest, value), 0);
  return max > 65535 ? Uint32Array.from(values) : Uint16Array.from(values);
}

function readAccessorComponent(data: DataView, offset: number, componentType: number, normalized: boolean): number {
  if (componentType === 5126) return data.getFloat32(offset, true);
  if (componentType === 5125) return normalizeComponent(data.getUint32(offset, true), 4294967295, normalized);
  if (componentType === 5123) return normalizeComponent(data.getUint16(offset, true), 65535, normalized);
  if (componentType === 5121) return normalizeComponent(data.getUint8(offset), 255, normalized);
  if (componentType === 5122) return normalizeSignedComponent(data.getInt16(offset, true), 32767, normalized);
  if (componentType === 5120) return normalizeSignedComponent(data.getInt8(offset), 127, normalized);
  throw new AuraRuntimeError("failed-glb-load", `Aura3D does not support glTF component type ${componentType}.`);
}

function normalizeComponent(value: number, max: number, normalized: boolean): number {
  return normalized ? value / max : value;
}

function normalizeSignedComponent(value: number, max: number, normalized: boolean): number {
  return normalized ? Math.max(-1, value / max) : value;
}

function componentByteLength(componentType: number): number {
  if (componentType === 5120 || componentType === 5121) return 1;
  if (componentType === 5122 || componentType === 5123) return 2;
  if (componentType === 5125 || componentType === 5126) return 4;
  throw new AuraRuntimeError("failed-glb-load", `Aura3D does not support glTF component type ${componentType}.`);
}

function componentCountForAccessor(type: string): number {
  if (type === "SCALAR") return 1;
  if (type === "VEC2") return 2;
  if (type === "VEC3") return 3;
  if (type === "VEC4") return 4;
  if (type === "MAT4") return 16;
  return 1;
}

function createDefaultNormals(count: number): Float32Array {
  const normals = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    normals[index * 3 + 1] = 1;
  }
  return normals;
}

function gltfNodeMatrix(node: NonNullable<GltfJson["nodes"]>[number]): Float32Array {
  if (node.matrix?.length === 16) return new Float32Array(node.matrix);
  const translate = node.translation ?? [0, 0, 0];
  const rotate = node.rotation ?? [0, 0, 0, 1];
  const scale = node.scale ?? [1, 1, 1];
  return multiply4(
    translation(translate[0] ?? 0, translate[1] ?? 0, translate[2] ?? 0),
    multiply4(
      rotationQuaternion(rotate),
      scaling(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1)
    )
  );
}

export function gltfTrsMatrix(
  translate: AuraVec3,
  rotate: readonly [number, number, number, number],
  scale: AuraVec3
): Float32Array {
  return multiply4(
    translation(translate[0], translate[1], translate[2]),
    multiply4(
      rotationQuaternion(rotate),
      scaling(scale[0], scale[1], scale[2])
    )
  );
}

export function sampleGltfVec3Channel(channel: GltfAnimationChannel, seconds: number): AuraVec3 {
  const [left, right, t] = gltfKeyframePair(channel.times, seconds);
  const a = readGltfChannelValue(channel, left, 3);
  if (left === right || channel.interpolation === "STEP") return [a[0], a[1], a[2]];
  const b = readGltfChannelValue(channel, right, 3);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

export function sampleGltfQuaternionChannel(channel: GltfAnimationChannel, seconds: number): [number, number, number, number] {
  const [left, right, t] = gltfKeyframePair(channel.times, seconds);
  const a = normalizeQuaternion(readGltfChannelValue(channel, left, 4));
  if (left === right || channel.interpolation === "STEP") return a;
  const b = normalizeQuaternion(readGltfChannelValue(channel, right, 4));
  return slerpQuaternion(a, b, t);
}

function gltfKeyframePair(times: Float32Array, seconds: number): readonly [number, number, number] {
  if (times.length <= 1) return [0, 0, 0];
  if (seconds <= (times[0] ?? 0)) return [0, 0, 0];
  const lastIndex = times.length - 1;
  if (seconds >= (times[lastIndex] ?? seconds)) return [lastIndex, lastIndex, 0];
  for (let index = 0; index < lastIndex; index += 1) {
    const start = times[index] ?? 0;
    const end = times[index + 1] ?? start;
    if (seconds >= start && seconds <= end) {
      const duration = Math.max(0.000001, end - start);
      return [index, index + 1, Math.min(1, Math.max(0, (seconds - start) / duration))];
    }
  }
  return [lastIndex, lastIndex, 0];
}

function readGltfChannelValue(channel: GltfAnimationChannel, keyframeIndex: number, components: 3): AuraVec3;

function readGltfChannelValue(channel: GltfAnimationChannel, keyframeIndex: number, components: 4): [number, number, number, number];

function readGltfChannelValue(channel: GltfAnimationChannel, keyframeIndex: number, components: 3 | 4): AuraVec3 | [number, number, number, number] {
  const cubic = channel.interpolation === "CUBICSPLINE";
  const stride = components * (cubic ? 3 : 1);
  const offset = keyframeIndex * stride + (cubic ? components : 0);
  if (components === 4) {
    return [
      channel.values[offset] ?? 0,
      channel.values[offset + 1] ?? 0,
      channel.values[offset + 2] ?? 0,
      channel.values[offset + 3] ?? 1
    ];
  }
  return [
    channel.values[offset] ?? 0,
    channel.values[offset + 1] ?? 0,
    channel.values[offset + 2] ?? 0
  ];
}
