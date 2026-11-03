import { AnimationClip, AnimationTrack, Skeleton, type Quat, type Vec3 } from "@aura3d/animation";
import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader";
import type { LoadContext } from "../LoadContext";
import { fetchBytes } from "../LoaderFetch";
import { GLTFLoader, type GLTFAsset } from "../GLTFLoader";
import { LoadContext as NativeLoadContext } from "../LoadContext";
import { createRenderableScene, type CreateRenderableSceneOptions, type RenderableScene } from "../createRenderableScene";
import { GLTFSceneAnimationRuntime } from "../GLTFAnimationRuntime";
import type { FormatAdapter } from "../FormatRegistry";

/** Native, opt-in animation import. Coordinates and units are preserved unless a scale is supplied. */
export interface AnimationImportLimits {
  readonly maxBytes?: number;
  readonly maxFrames?: number;
  readonly maxVertices?: number;
  readonly maxSamples?: number;
  readonly maxBones?: number;
}
export interface BVHImportOptions extends AnimationImportLimits {
  /** Multiplies source translations and offsets; BVH itself does not declare a unit. */
  readonly unitScale?: number;
  readonly clipName?: string;
}
export interface AnimationImportDiagnostic { readonly code: string; readonly message: string }
export class AnimationFormatError extends Error {
  constructor(readonly code: string, message: string) { super(`${code}: ${message}`); this.name = "AnimationFormatError"; }
}

export interface BVHJoint {
  readonly name: string;
  readonly parentIndex: number;
  readonly offset: Vec3;
  readonly channels: readonly string[];
  readonly endSite: boolean;
}
export interface BVHAsset {
  readonly format: "bvh";
  readonly joints: readonly BVHJoint[];
  readonly skeleton: Skeleton;
  readonly clip: AnimationClip;
  readonly frameCount: number;
  readonly frameTime: number;
  readonly sourceUnits: "unspecified";
  readonly diagnostics: readonly AnimationImportDiagnostic[];
}

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_FRAMES = 100_000;
const DEFAULT_MAX_VERTICES = 1_000_000;
const DEFAULT_MAX_SAMPLES = 8_000_000;
const DEFAULT_MAX_BONES = 2_048;
const DEFAULT_MAX_MD2_DECODED_BYTES = 160 * 1024 * 1024;

function limit(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) throw new AnimationFormatError("INVALID_LIMIT", `${label} must be a positive safe integer`);
  return resolved;
}
function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new AnimationFormatError("INVALID_NUMBER", `${label} must be finite`);
  return value;
}
function boundedBytes(bytes: Uint8Array, options: AnimationImportLimits): void {
  if (bytes.byteLength > limit(options.maxBytes, DEFAULT_MAX_BYTES, "maxBytes")) throw new AnimationFormatError("INPUT_LIMIT", "input exceeds maxBytes");
}
function checkedCount(value: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new AnimationFormatError("COUNT_LIMIT", `${label} must be between 1 and ${max}`);
  return value;
}
function checkSamples(a: number, b: number, options: AnimationImportLimits): void {
  if (a * b > limit(options.maxSamples, DEFAULT_MAX_SAMPLES, "maxSamples")) throw new AnimationFormatError("SAMPLE_LIMIT", "frame data exceeds maxSamples");
}
function asBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}
function dataView(bytes: Uint8Array): DataView { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
function axisQuat(axis: string, degrees: number): Quat {
  const half = (degrees % 360) * Math.PI / 360;
  const s = Math.sin(half), c = Math.cos(half);
  return axis === "X" ? [s, 0, 0, c] : axis === "Y" ? [0, s, 0, c] : [0, 0, s, c];
}
function rotateVector(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
}
function multiplyQuat(a: Quat, b: Quat): Quat {
  const [x, y, z, w] = a, [u, v, q, r] = b;
  return [w * u + x * r + y * q - z * v, w * v - x * q + y * r + z * u,
    w * q + x * v - y * u + z * r, w * r - x * u - y * v - z * q];
}

/** Parse a BVH HIERARCHY and MOTION stream into a native skeleton and tracks. */
export function parseBVH(source: string, options: BVHImportOptions = {}): BVHAsset {
  if (source.length > limit(options.maxBytes, DEFAULT_MAX_BYTES, "maxBytes")) throw new AnimationFormatError("INPUT_LIMIT", "input exceeds maxBytes");
  boundedBytes(new TextEncoder().encode(source), options);
  const maxBones = limit(options.maxBones, DEFAULT_MAX_BONES, "maxBones");
  const unitScale = finite(options.unitScale ?? 1, "unitScale");
  if (unitScale <= 0) throw new AnimationFormatError("INVALID_SCALE", "unitScale must be positive");
  const tokens = source.replace(/#[^\r\n]*/g, "").match(/[^\s{}:]+|[{}:]/g) ?? [];
  let cursor = 0;
  const next = (): string => {
    const token = tokens[cursor++];
    if (token === undefined) throw new AnimationFormatError("TRUNCATED", "unexpected end of BVH");
    return token;
  };
  const expect = (value: string): void => {
    const token = next();
    if (token.toUpperCase() !== value.toUpperCase()) throw new AnimationFormatError("INVALID_BVH", `expected ${value}, got ${token}`);
  };
  const number = (label: string): number => {
    const token = next();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) throw new AnimationFormatError("INVALID_NUMBER", `${label} is not a number`);
    return finite(Number(token), label);
  };
  const joints: BVHJoint[] = [];
  const names = new Set<string>();
  const parseJoint = (kind: "ROOT" | "JOINT" | "End", parent: number, depth: number): void => {
    if (depth > 256) throw new AnimationFormatError("DEPTH_LIMIT", "BVH hierarchy exceeds 256 levels");
    if (joints.length >= maxBones) throw new AnimationFormatError("COUNT_LIMIT", "BVH exceeds maxBones");
    const endSite = kind === "End";
    if (endSite) expect("Site");
    const name = endSite ? `${joints[parent]!.name}_end_${joints.length}` : next();
    if (names.has(name)) throw new AnimationFormatError("DUPLICATE_JOINT", `joint name ${name} is ambiguous`);
    names.add(name);
    const index = joints.length;
    expect("{"); expect("OFFSET");
    const offset: Vec3 = [number("offset x") * unitScale, number("offset y") * unitScale, number("offset z") * unitScale];
    offset.forEach((component) => finite(component, "scaled offset"));
    const channels: string[] = [];
    if (!endSite) {
      expect("CHANNELS");
      const count = number("channel count");
      if (!Number.isSafeInteger(count) || count < 0 || count > 6) throw new AnimationFormatError("INVALID_CHANNEL", "joint channel count must be between 0 and 6");
      for (let i = 0; i < count; i += 1) {
        const channel = next();
        if (!/^[XYZ](?:position|rotation)$/i.test(channel)) throw new AnimationFormatError("UNSUPPORTED_CHANNEL", `unsupported BVH channel ${channel}`);
        const canonical = channel[0]!.toUpperCase() + channel.slice(1).toLowerCase();
        if (channels.includes(canonical)) throw new AnimationFormatError("INVALID_CHANNEL", `duplicate channel ${channel}`);
        channels.push(canonical);
      }
    }
    joints.push({ name, parentIndex: parent, offset, channels, endSite });
    while (tokens[cursor] !== "}") {
      const child = next();
      if (child !== "JOINT" && child !== "End") throw new AnimationFormatError("INVALID_BVH", `unexpected hierarchy token ${child}`);
      if (endSite) throw new AnimationFormatError("INVALID_BVH", "End Site cannot have children");
      parseJoint(child, index, depth + 1);
    }
    expect("}");
  };
  expect("HIERARCHY"); expect("ROOT"); parseJoint("ROOT", -1, 0);
  expect("MOTION"); expect("Frames"); expect(":");
  const frameCount = checkedCount(number("frame count"), limit(options.maxFrames, DEFAULT_MAX_FRAMES, "maxFrames"), "frame count");
  expect("Frame"); expect("Time"); expect(":");
  const frameTime = number("frame time");
  if (frameTime <= 0 || !Number.isFinite((frameCount - 1) * frameTime)) throw new AnimationFormatError("INVALID_TIME", "frame time must produce a finite positive interval");
  const channelCount = joints.reduce((total, joint) => total + joint.channels.length, 0);
  checkSamples(frameCount, Math.max(channelCount, 1), options);
  checkSamples(frameCount, joints.length, options);
  const positions: Array<Array<{ time: number; value: Vec3 }>> = joints.map(() => []);
  const rotations: Array<Array<{ time: number; value: Quat }>> = joints.map(() => []);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame * frameTime;
    for (const [index, joint] of joints.entries()) {
      let position: Vec3 = [...joint.offset];
      let rotation: Quat = [0, 0, 0, 1];
      let hasPosition = false, hasRotation = false;
      for (const channel of joint.channels) {
        const value = number(`frame ${frame} ${channel}`);
        const axis = channel[0]!;
        if (channel.endsWith("position")) {
          const components: [number, number, number] = [...position];
          const axisIndex = axis === "X" ? 0 : axis === "Y" ? 1 : 2;
          const displacement: [number, number, number] = [0, 0, 0];
          displacement[axisIndex] = value * unitScale;
          const rotated = rotateVector(rotation, displacement);
          for (let i = 0; i < 3; i += 1) components[i] = finite(components[i]! + rotated[i]!, "scaled position");
          position = components; hasPosition = true;
        } else { rotation = multiplyQuat(rotation, axisQuat(axis, value)); hasRotation = true; }
      }
      if (hasPosition) positions[index]!.push({ time, value: position });
      if (hasRotation) rotations[index]!.push({ time, value: rotation });
    }
  }
  if (cursor !== tokens.length) throw new AnimationFormatError("INVALID_BVH", "trailing motion values or tokens");
  const tracks: AnimationTrack[] = [];
  joints.forEach((joint, index) => {
    if (positions[index]!.length) tracks.push(new AnimationTrack<Vec3>({ target: `${joint.name}.translation`, valueType: "vector3", keyframes: positions[index]! }));
    if (rotations[index]!.length) tracks.push(new AnimationTrack<Quat>({ target: `${joint.name}.rotation`, valueType: "quaternion", keyframes: rotations[index]! }));
  });
  const worldOffsets: Vec3[] = [];
  const skeleton = new Skeleton(joints.map((joint) => {
    const parent = joint.parentIndex < 0 ? [0, 0, 0] : worldOffsets[joint.parentIndex]!;
    const world: Vec3 = [parent[0]! + joint.offset[0], parent[1]! + joint.offset[1], parent[2]! + joint.offset[2]];
    world.forEach((component) => finite(component, "world offset"));
    worldOffsets.push(world);
    return { name: joint.name, parentIndex: joint.parentIndex, translation: joint.offset,
      inverseBindMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -world[0], -world[1], -world[2], 1] as const };
  }));
  return { format: "bvh", joints, skeleton, clip: new AnimationClip({ name: options.clipName ?? "bvh", duration: (frameCount - 1) * frameTime, tracks }),
    frameCount, frameTime, sourceUnits: "unspecified", diagnostics: [{ code: "BVH_SOURCE_CONVENTION", message: "Source axes and units are preserved; BVH does not declare a universal coordinate convention." }] };
}

export interface VertexFrame { readonly name?: string; readonly time: number; readonly positions: Float32Array }
export interface MD2Asset {
  readonly format: "md2";
  readonly skinWidth: number;
  readonly skinHeight: number;
  readonly skins: readonly string[];
  /** Populated when the loader's resolveSkins option fetches referenced skins. */
  readonly skinAssets?: readonly { readonly uri: string; readonly bytes: Uint8Array }[];
  /** Indices and UVs are per face corner, so texture seams remain distinct. */
  readonly vertexIndices: Uint32Array;
  readonly texcoords: Float32Array;
  readonly frames: readonly VertexFrame[];
  readonly normalIndices: readonly Uint8Array[];
  readonly sourceUnits: "unspecified";
  readonly diagnostics: readonly AnimationImportDiagnostic[];
}
export interface MD2ImportOptions extends AnimationImportLimits {
  readonly framesPerSecond?: number;
  readonly resolveSkins?: boolean;
  /**
   * Maximum aggregate byte length of parsed MD2 typed arrays; defaults to 160 MiB.
   * This excludes input and skin buffers, temporary data, and JavaScript overhead.
   */
  readonly maxDecodedBytes?: number;
}
function cString(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  return new TextDecoder().decode(end < 0 ? bytes : bytes.subarray(0, end));
}
function checkedRegion(offset: number, length: number, end: number, label: string): void {
  if (length === 0 && offset === 0) return;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 68 || length < 0 || offset + length > end) {
    throw new AnimationFormatError("TRUNCATED", `invalid ${label} section`);
  }
}

/** Bound parsed typed-array payloads before allocating triangle corners or frames. */
function preflightMD2DecodedPayload(triangleCount: number, vertexCount: number, frameCount: number, maxBytes: number): void {
  let remaining = maxBytes;
  const reserve = (...factors: number[]): void => {
    let bytes = 1;
    for (const factor of factors) {
      if (bytes > Math.floor(remaining / factor)) {
        throw new AnimationFormatError("OUTPUT_LIMIT", "MD2 decoded typed-array payload exceeds maxDecodedBytes; increase the limit or reduce frames, vertices, or triangles");
      }
      bytes *= factor;
    }
    remaining -= bytes;
  };
  // Per corner: one uint32 index and two float32 texture coordinates.
  reserve(triangleCount, 3, Uint32Array.BYTES_PER_ELEMENT + 2 * Float32Array.BYTES_PER_ELEMENT);
  // Per vertex and frame: three float32 positions and one uint8 normal index.
  reserve(frameCount, vertexCount, 3 * Float32Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT);
}

/** Parse Quake II MD2 version 8, including UV seams, skins and every vertex frame. */
export function parseMD2(input: ArrayBuffer | Uint8Array, options: MD2ImportOptions = {}): MD2Asset {
  const bytes = asBytes(input); boundedBytes(bytes, options);
  if (bytes.byteLength < 68) throw new AnimationFormatError("TRUNCATED", "MD2 header is incomplete");
  const view = dataView(bytes);
  const h = Array.from({ length: 17 }, (_, i) => view.getInt32(i * 4, true));
  const [ident, version, skinWidth, skinHeight, frameSize, skinCount, vertexCount, uvCount, triangleCount, commandCount, frameCount, skinOffset, uvOffset, triOffset, frameOffset, commandOffset, end] = h as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
  if (ident !== 844121161 || version !== 8) throw new AnimationFormatError("UNSUPPORTED_MD2", "expected IDP2 version 8");
  if (end < 68 || end > bytes.byteLength) throw new AnimationFormatError("TRUNCATED", "invalid MD2 end offset");
  checkedCount(skinWidth, 65535, "skin width"); checkedCount(skinHeight, 65535, "skin height");
  checkedCount(vertexCount, limit(options.maxVertices, DEFAULT_MAX_VERTICES, "maxVertices"), "vertex count");
  checkedCount(frameCount, limit(options.maxFrames, DEFAULT_MAX_FRAMES, "maxFrames"), "frame count");
  checkedCount(uvCount, limit(options.maxVertices, DEFAULT_MAX_VERTICES, "maxVertices"), "UV count");
  checkedCount(triangleCount, limit(options.maxVertices, DEFAULT_MAX_VERTICES, "maxVertices"), "triangle count");
  if (skinCount < 0 || commandCount < 0 || skinCount > 4096 || commandCount > DEFAULT_MAX_SAMPLES || frameSize < 40 + vertexCount * 4) throw new AnimationFormatError("COUNT_LIMIT", "invalid MD2 section counts or frame size");
  checkSamples(vertexCount, frameCount, options);
  if (triangleCount * 3 > limit(options.maxSamples, DEFAULT_MAX_SAMPLES, "maxSamples")) throw new AnimationFormatError("SAMPLE_LIMIT", "MD2 corner data exceeds maxSamples");
  checkedRegion(skinOffset, skinCount * 64, end, "skin"); checkedRegion(uvOffset, uvCount * 4, end, "UV");
  checkedRegion(triOffset, triangleCount * 12, end, "triangle"); checkedRegion(frameOffset, frameCount * frameSize, end, "frame");
  checkedRegion(commandOffset, commandCount * 4, end, "command");
  const regions = [
    { start: skinOffset, length: skinCount * 64 }, { start: uvOffset, length: uvCount * 4 },
    { start: triOffset, length: triangleCount * 12 }, { start: frameOffset, length: frameCount * frameSize },
    { start: commandOffset, length: commandCount * 4 }
  ].filter((region) => region.length > 0).sort((a, b) => a.start - b.start);
  for (let i = 1; i < regions.length; i += 1) {
    if (regions[i]!.start < regions[i - 1]!.start + regions[i - 1]!.length) throw new AnimationFormatError("INVALID_MD2", "MD2 sections overlap");
  }
  const fps = finite(options.framesPerSecond ?? 10, "framesPerSecond");
  if (fps <= 0 || !Number.isFinite((frameCount - 1) / fps)) throw new AnimationFormatError("INVALID_TIME", "framesPerSecond must yield finite positive frame spacing");
  const maxDecodedBytes = limit(options.maxDecodedBytes, DEFAULT_MAX_MD2_DECODED_BYTES, "maxDecodedBytes");
  preflightMD2DecodedPayload(triangleCount, vertexCount, frameCount, maxDecodedBytes);
  const skins = Array.from({ length: skinCount }, (_, i) => cString(bytes.subarray(skinOffset + i * 64, skinOffset + (i + 1) * 64)));
  const vertexIndices = new Uint32Array(triangleCount * 3), texcoords = new Float32Array(triangleCount * 6);
  for (let i = 0; i < triangleCount; i += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = view.getUint16(triOffset + i * 12 + corner * 2, true);
      const uv = view.getUint16(triOffset + i * 12 + 6 + corner * 2, true);
      if (vertex >= vertexCount || uv >= uvCount) throw new AnimationFormatError("INDEX_RANGE", `triangle ${i} references a missing vertex or UV`);
      vertexIndices[i * 3 + corner] = vertex;
      texcoords[(i * 3 + corner) * 2] = view.getInt16(uvOffset + uv * 4, true) / skinWidth;
      texcoords[(i * 3 + corner) * 2 + 1] = view.getInt16(uvOffset + uv * 4 + 2, true) / skinHeight;
    }
  }
  const frames: VertexFrame[] = [], normalIndices: Uint8Array[] = [];
  for (let i = 0; i < frameCount; i += 1) {
    const offset = frameOffset + i * frameSize;
    const scale = [0, 1, 2].map((axis) => finite(view.getFloat32(offset + axis * 4, true), "frame scale"));
    const translation = [0, 1, 2].map((axis) => finite(view.getFloat32(offset + 12 + axis * 4, true), "frame translation"));
    const positions = new Float32Array(vertexCount * 3), normals = new Uint8Array(vertexCount);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = finite(view.getUint8(offset + 40 + vertex * 4 + axis) * scale[axis]! + translation[axis]!, "frame position");
        positions[vertex * 3 + axis] = value;
        if (!Number.isFinite(positions[vertex * 3 + axis])) throw new AnimationFormatError("INVALID_NUMBER", "frame position overflows float32");
      }
      normals[vertex] = view.getUint8(offset + 43 + vertex * 4);
      if (normals[vertex]! >= 162) throw new AnimationFormatError("INDEX_RANGE", `frame ${i} has invalid normal index`);
    }
    frames.push({ name: cString(bytes.subarray(offset + 24, offset + 40)), time: i / fps, positions }); normalIndices.push(normals);
  }
  return { format: "md2", skinWidth, skinHeight, skins, vertexIndices, texcoords, frames, normalIndices, sourceUnits: "unspecified",
    diagnostics: [{ code: "MD2_NORMAL_TABLE", message: "Source normal indices are retained; sampled normals are generated from triangle geometry." },
      { code: "MD2_SOURCE_CONVENTION", message: "Source axes and units are retained; skin paths must be resolved by the caller." }] };
}

export interface MDDAsset {
  readonly format: "mdd";
  readonly vertexCount: number;
  readonly frames: readonly VertexFrame[];
  readonly sourceUnits: "unspecified";
  readonly diagnostics: readonly AnimationImportDiagnostic[];
}
/** Parse big-endian MDD point-cache frames. Topology must be supplied by a matching mesh. */
export function parseMDD(input: ArrayBuffer | Uint8Array, options: AnimationImportLimits = {}): MDDAsset {
  const bytes = asBytes(input); boundedBytes(bytes, options);
  if (bytes.byteLength < 8) throw new AnimationFormatError("TRUNCATED", "MDD header is incomplete");
  const view = dataView(bytes);
  const frameCount = checkedCount(view.getInt32(0, false), limit(options.maxFrames, DEFAULT_MAX_FRAMES, "maxFrames"), "frame count");
  const vertexCount = checkedCount(view.getInt32(4, false), limit(options.maxVertices, DEFAULT_MAX_VERTICES, "maxVertices"), "vertex count");
  checkSamples(frameCount, vertexCount, options);
  const required = 8 + frameCount * 4 + frameCount * vertexCount * 12;
  if (!Number.isSafeInteger(required) || required !== bytes.byteLength) throw new AnimationFormatError("TRUNCATED", "MDD byte length does not match its declared frames");
  const frames: VertexFrame[] = [];
  let previous = -Infinity;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = finite(view.getFloat32(8 + frame * 4, false), "MDD frame time");
    if (time < 0 || time <= previous) throw new AnimationFormatError("INVALID_TIME", "MDD frame times must be non-negative and strictly increasing");
    previous = time;
    const positions = new Float32Array(vertexCount * 3);
    const offset = 8 + frameCount * 4 + frame * vertexCount * 12;
    for (let component = 0; component < positions.length; component += 1) positions[component] = finite(view.getFloat32(offset + component * 4, false), "MDD position");
    frames.push({ time, positions });
  }
  return { format: "mdd", vertexCount, frames, sourceUnits: "unspecified", diagnostics: [{ code: "MDD_TOPOLOGY_REQUIRED", message: "MDD contains positions only; bind it to a mesh with the same vertex order and count." }] };
}

/** Linearly interpolate a point cache, clamping outside its time range. */
export function sampleVertexFrames(asset: MD2Asset | MDDAsset, time: number): Float32Array {
  finite(time, "sample time");
  const frames = asset.frames;
  const upper = frames.findIndex((frame) => frame.time >= time);
  if (upper <= 0) return new Float32Array((upper === -1 ? frames[frames.length - 1] : frames[0])!.positions);
  const a = frames[upper - 1]!, b = frames[upper]!;
  const alpha = (time - a.time) / (b.time - a.time);
  const result = new Float32Array(a.positions.length);
  for (let i = 0; i < result.length; i += 1) result[i] = a.positions[i]! * (1 - alpha) + b.positions[i]! * alpha;
  return result;
}
/** Expand sampled MD2 geometry to triangle corners and derive flat normals. */
export function sampleMD2Geometry(asset: MD2Asset, time: number): { positions: Float32Array; normals: Float32Array; texcoords: Float32Array } {
  const source = sampleVertexFrames(asset, time), positions = new Float32Array(asset.vertexIndices.length * 3), normals = new Float32Array(positions.length);
  asset.vertexIndices.forEach((index, corner) => positions.set(source.subarray(index * 3, index * 3 + 3), corner * 3));
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i + 3]! - positions[i]!, ay = positions[i + 4]! - positions[i + 1]!, az = positions[i + 5]! - positions[i + 2]!;
    const bx = positions[i + 6]! - positions[i]!, by = positions[i + 7]! - positions[i + 1]!, bz = positions[i + 8]! - positions[i + 2]!;
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz); if (length > 0) { nx /= length; ny /= length; nz /= length; }
    for (let corner = 0; corner < 3; corner += 1) normals.set([nx, ny, nz], i + corner * 3);
  }
  return { positions, normals, texcoords: new Float32Array(asset.texcoords) };
}

async function loadAnimationBytes(request: AssetLoadRequest, context: LoadContext, maximum: number): Promise<ArrayBuffer> {
  const policy = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
  const maxBytes = Math.min(policy.maxBytes ?? maximum, maximum);
  const signal = context.signalFor(request.signal);
  const resolved = context.dependencyChain.at(-1) === request.url ? request.url : context.resolve(request.url);
  const bytes = await fetchBytes(resolved, signal, request.onProgress ? (progress) => request.onProgress!({
    url: request.url, phase: "document", loadedBytes: progress.loaded, ...(progress.total !== undefined ? { totalBytes: progress.total } : {})
  }) : undefined, { ...policy, maxBytes });
  if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
  return bytes;
}
function isFormat(request: AssetLoadRequest, format: string): boolean {
  return request.type === format || (!request.type && new RegExp(`\\.${format}(?:[?#]|$)`, "i").test(request.url));
}
export class BVHLoader implements AssetLoader<BVHAsset> {
  readonly type = "bvh";
  constructor(readonly options: BVHImportOptions = {}) {}
  canLoad(request: AssetLoadRequest): boolean { return isFormat(request, this.type); }
  parse(source: string, options: BVHImportOptions = this.options): BVHAsset { return parseBVH(source, options); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<BVHAsset> {
    const bytes = await loadAnimationBytes(request, context, limit(this.options.maxBytes, DEFAULT_MAX_BYTES, "maxBytes"));
    const result = this.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    const signal = context.signalFor(request.signal); if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
    return result;
  }
}
export class MD2Loader implements AssetLoader<MD2Asset> {
  readonly type = "md2";
  constructor(readonly options: MD2ImportOptions = {}) {}
  canLoad(request: AssetLoadRequest): boolean { return isFormat(request, this.type); }
  parse(input: ArrayBuffer | Uint8Array, options: MD2ImportOptions = this.options): MD2Asset { return parseMD2(input, options); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<MD2Asset> {
    const bytes = await loadAnimationBytes(request, context, limit(this.options.maxBytes, DEFAULT_MAX_BYTES, "maxBytes"));
    const result = this.parse(bytes);
    if (!this.options.resolveSkins || result.skins.length === 0) return result;
    const documentContext = context.dependencyChain.at(-1) === request.url ? context : context.child(request.url, undefined, request);
    const skinAssets: Array<{ uri: string; bytes: Uint8Array }> = [];
    let remaining = limit(this.options.maxBytes, DEFAULT_MAX_BYTES, "maxBytes");
    if (result.skins.length > 128) throw new AnimationFormatError("COUNT_LIMIT", "MD2 has too many skin dependencies");
    for (const skin of result.skins) {
      if (!skin) throw new AnimationFormatError("INVALID_SKIN", "empty MD2 skin path");
      const url = documentContext.resolve(skin);
      const policy = documentContext.requestOptionsFor(skin);
      const signal = documentContext.signalFor(request.signal);
      const skinBytes = await fetchBytes(url, signal, request.onProgress ? (progress) => request.onProgress!({
        url, phase: "buffer", loadedBytes: progress.loaded, ...(progress.total !== undefined ? { totalBytes: progress.total } : {})
      }) : undefined, { ...policy, maxBytes: Math.min(policy.maxBytes ?? remaining, remaining) });
      remaining -= skinBytes.byteLength;
      skinAssets.push({ uri: url, bytes: new Uint8Array(skinBytes) });
    }
    const signal = context.signalFor(request.signal); if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
    return { ...result, skinAssets };
  }
}
export class MDDLoader implements AssetLoader<MDDAsset> {
  readonly type = "mdd";
  constructor(readonly options: AnimationImportLimits = {}) {}
  canLoad(request: AssetLoadRequest): boolean { return isFormat(request, this.type); }
  parse(input: ArrayBuffer | Uint8Array, options: AnimationImportLimits = this.options): MDDAsset { return parseMDD(input, options); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<MDDAsset> {
    const bytes = await loadAnimationBytes(request, context, limit(this.options.maxBytes, DEFAULT_MAX_BYTES, "maxBytes"));
    const result = this.parse(bytes);
    const signal = context.signalFor(request.signal); if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
    return result;
  }
}

export interface MD2ProjectionOptions {
  /** Limit generated morph targets; frame zero is the base mesh. */
  readonly maxMorphTargets?: number;
  readonly maxBytes?: number;
  /**
   * Maximum sum of PCX decoder typed-array payloads. Defaults to four times
   * maxBytes, capped at Number.MAX_SAFE_INTEGER; excludes input and JS overhead.
   */
  readonly maxPCXWorkingBytes?: number;
  /** Index of the resolved skin to embed; defaults to the first. */
  readonly skinIndex?: number;
}

/** Check the binary projection size before expanding any frame into triangle corners. */
function preflightMD2Projection(asset: MD2Asset, frameCount: number, maxBytes: number): number {
  const corners = asset.vertexIndices.length;
  if (!Number.isSafeInteger(corners) || corners < 1 || corners % 3 !== 0) {
    throw new AnimationFormatError("INVALID_MD2", "MD2 must contain complete triangle corners");
  }
  let planned = 0;
  const add = (...factors: number[]): void => {
    let bytes = 1;
    const remaining = maxBytes - planned;
    for (const factor of factors) {
      if (!Number.isSafeInteger(factor) || factor < 0) {
        throw new AnimationFormatError("INVALID_MD2", "invalid MD2 projection dimensions");
      }
      if (factor === 0) return;
      if (bytes > Math.floor(remaining / factor)) {
        throw new AnimationFormatError("OUTPUT_LIMIT", "MD2 morph projection exceeds maxBytes");
      }
      bytes *= factor;
    }
    planned += bytes;
  };
  // Base POSITION + NORMAL + TEXCOORD_0: (3 + 3 + 2) float32s per corner.
  add(corners, 32);
  if (!Number.isSafeInteger(asset.texcoords.length) || asset.texcoords.length !== corners * 2) {
    throw new AnimationFormatError("INVALID_MD2", "MD2 UVs must contain two components per corner");
  }
  const targets = frameCount - 1;
  // Each target contains a position and a normal delta, both VEC3 float32.
  if (targets > 0) {
    add(corners, 24, targets);
    add(frameCount, 4); // animation input times
    add(frameCount, targets, 4); // scalar animation weights
  }
  return planned;
}

interface MD2PCXPlan {
  readonly width: number;
  readonly height: number;
  readonly planes: number;
  readonly rowBytes: number;
  readonly decodedLength: number;
  readonly scanlineLength: number;
  readonly zlibLength: number;
  readonly pngLength: number;
  readonly paletteStart: number;
}

/** Validate PCX dimensions and reserve every typed-array payload before decoding. */
function preflightMD2PCX(input: Uint8Array, maxBytes: number, maxPCXWorkingBytes?: number): MD2PCXPlan {
  const maximum = limit(maxBytes, 64 * 1024 * 1024, "maxBytes");
  const defaultWorking = maximum <= Math.floor(Number.MAX_SAFE_INTEGER / 4) ? maximum * 4 : Number.MAX_SAFE_INTEGER;
  const workingMaximum = limit(maxPCXWorkingBytes, defaultWorking, "maxPCXWorkingBytes");
  if (input.length < 128 || input[0] !== 10 || input[2] !== 1 || input[3] !== 8) throw new AnimationFormatError("UNSUPPORTED_MD2_SKIN", "expected an 8-bit RLE PCX skin");
  const header = dataView(input);
  const width = header.getUint16(8, true) - header.getUint16(4, true) + 1;
  const height = header.getUint16(10, true) - header.getUint16(6, true) + 1;
  const planes = input[65]!, rowBytes = header.getUint16(66, true);
  if (width < 1 || height < 1 || width > 8192 || height > 8192 || rowBytes < width || (planes !== 1 && planes !== 3)) {
    throw new AnimationFormatError("UNSUPPORTED_MD2_SKIN", "invalid PCX dimensions or unsupported plane count");
  }
  const product = (...factors: number[]): number => {
    let result = 1;
    for (const factor of factors) {
      if (!Number.isSafeInteger(factor) || factor < 0 || (factor !== 0 && result > Math.floor(Number.MAX_SAFE_INTEGER / factor))) {
        throw new AnimationFormatError("OUTPUT_LIMIT", "PCX allocation dimensions exceed the safe number range");
      }
      result *= factor;
    }
    return result;
  };
  const sum = (...values: number[]): number => {
    let result = 0;
    for (const value of values) {
      if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - result) {
        throw new AnimationFormatError("OUTPUT_LIMIT", "PCX allocation dimensions exceed the safe number range");
      }
      result += value;
    }
    return result;
  };
  const decodedLength = product(rowBytes, planes, height);
  const scanlineLength = product(sum(product(width, 3), 1), height);
  if (decodedLength > maximum || scanlineLength > maximum) throw new AnimationFormatError("OUTPUT_LIMIT", "PCX decoded dimensions exceed maxBytes");
  const paletteStart = planes === 1 ? input.length - 769 : input.length;
  if (planes === 1 && (paletteStart < 128 || input[paletteStart] !== 12)) throw new AnimationFormatError("TRUNCATED", "indexed PCX palette is missing");
  const blockCount = Math.ceil(scanlineLength / 65535);
  const zlibLength = sum(2, product(blockCount, 5), scanlineLength, 4);
  const pngLength = sum(zlibLength, 57);
  if (pngLength > maximum) throw new AnimationFormatError("OUTPUT_LIMIT", "converted PCX PNG exceeds maxBytes");
  let remaining = workingMaximum;
  for (const bytes of [decodedLength, scanlineLength, zlibLength, pngLength, 13]) {
    if (bytes > remaining) throw new AnimationFormatError("OUTPUT_LIMIT", "PCX typed-array payload exceeds maxPCXWorkingBytes; increase the limit or reduce image dimensions");
    remaining -= bytes;
  }
  return { width, height, planes, rowBytes, decodedLength, scanlineLength, zlibLength, pngLength, paletteStart };
}

/** Decode bounded 8-bit indexed and 24-bit planar PCX skins to a standards-compliant PNG. */
export function decodeMD2PCXSkin(input: Uint8Array, maxBytes = 64 * 1024 * 1024, maxPCXWorkingBytes?: number): Uint8Array {
  return decodeMD2PCXWithPlan(input, preflightMD2PCX(input, maxBytes, maxPCXWorkingBytes));
}

function decodeMD2PCXWithPlan(input: Uint8Array, plan: MD2PCXPlan): Uint8Array {
  const { width, height, planes, rowBytes, decodedLength, scanlineLength, zlibLength, pngLength, paletteStart } = plan;
  const decoded = new Uint8Array(decodedLength);
  let source = 128, output = 0;
  while (output < decodedLength) {
    if (source >= paletteStart) throw new AnimationFormatError("TRUNCATED", "PCX pixel data is incomplete");
    const first = input[source++]!;
    const count = (first & 0xc0) === 0xc0 ? first & 0x3f : 1;
    if (count === 0 || source >= paletteStart && (first & 0xc0) === 0xc0) throw new AnimationFormatError("TRUNCATED", "invalid PCX run");
    const value = (first & 0xc0) === 0xc0 ? input[source++]! : first;
    if (output + count > decodedLength) throw new AnimationFormatError("INVALID_MD2_SKIN", "PCX run exceeds decoded image");
    decoded.fill(value, output, output + count); output += count;
  }
  const scanlines = new Uint8Array(scanlineLength);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const pixel = y * (width * 3 + 1) + 1 + x * 3, row = y * rowBytes * planes;
    if (planes === 1) {
      const color = paletteStart + 1 + decoded[row + x]! * 3;
      scanlines.set(input.subarray(color, color + 3), pixel);
    } else for (let channel = 0; channel < 3; channel += 1) scanlines[pixel + channel] = decoded[row + channel * rowBytes + x]!;
  }
  // PNG IDAT uses an uncompressed DEFLATE stream to avoid requiring a host codec.
  const zlib = new Uint8Array(zlibLength); zlib[0] = 0x78; zlib[1] = 0x01;
  let at = 2, from = 0, a = 1, b = 0;
  while (from < scanlines.length) {
    const size = Math.min(65535, scanlines.length - from), final = from + size === scanlines.length;
    zlib[at++] = final ? 1 : 0; zlib[at++] = size & 255; zlib[at++] = size >>> 8;
    const inverse = (~size) & 0xffff; zlib[at++] = inverse & 255; zlib[at++] = inverse >>> 8;
    zlib.set(scanlines.subarray(from, from + size), at); at += size;
    for (let i = from; i < from + size; i += 1) { a = (a + scanlines[i]!) % 65521; b = (b + a) % 65521; }
    from += size;
  }
  new DataView(zlib.buffer).setUint32(at, ((b << 16) | a) >>> 0, false);
  const png = new Uint8Array(pngLength); png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const pngView = new DataView(png.buffer); let cursor = 8;
  const chunk = (name: string, data: Uint8Array): void => {
    pngView.setUint32(cursor, data.length, false); cursor += 4;
    const typeStart = cursor;
    for (let i = 0; i < 4; i += 1) png[cursor++] = name.charCodeAt(i);
    png.set(data, cursor); cursor += data.length;
    let crc = 0xffffffff;
    for (let i = typeStart; i < cursor; i += 1) {
      crc ^= png[i]!;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    pngView.setUint32(cursor, (crc ^ 0xffffffff) >>> 0, false); cursor += 4;
  };
  const ihdr = new Uint8Array(13), ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false); ihdrView.setUint32(4, height, false); ihdr[8] = 8; ihdr[9] = 2;
  chunk("IHDR", ihdr); chunk("IDAT", zlib); chunk("IEND", new Uint8Array());
  return png;
}
/** Project MD2 vertex frames into a glTF mesh, morph targets and a timed weights clip. */
export async function createMD2GLTFAsset(asset: MD2Asset, options: MD2ProjectionOptions = {}): Promise<GLTFAsset> {
  const frameCount = asset.frames.length;
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) throw new AnimationFormatError("INVALID_MD2", "MD2 must contain at least one frame");
  const targetCount = frameCount - 1;
  const maxTargets = limit(options.maxMorphTargets, 128, "maxMorphTargets");
  if (targetCount > Math.min(maxTargets, 128)) throw new AnimationFormatError("MORPH_LIMIT", "MD2 has too many frames for a morph projection");
  const maxBytes = limit(options.maxBytes, 64 * 1024 * 1024, "maxBytes");
  const plannedGeometry = preflightMD2Projection(asset, frameCount, maxBytes);
  const candidateIndex = options.skinIndex ?? 0;
  const candidateSkin = Number.isInteger(candidateIndex) && candidateIndex >= 0 ? asset.skinAssets?.[candidateIndex] : undefined;
  let earlyPCX: { readonly input: Uint8Array; readonly plan: MD2PCXPlan } | undefined;
  if (candidateSkin?.bytes[0] === 10) {
    const plan = preflightMD2PCX(candidateSkin.bytes, maxBytes, options.maxPCXWorkingBytes);
    if (plan.pngLength > maxBytes - plannedGeometry) throw new AnimationFormatError("OUTPUT_LIMIT", "MD2 geometry and skin exceed maxBytes");
    earlyPCX = { input: candidateSkin.bytes, plan };
  }
  const base = sampleMD2Geometry(asset, asset.frames[0]!.time);
  if (!base.positions.length) throw new AnimationFormatError("INVALID_MD2", "MD2 has no triangle geometry");
  const chunks: Uint8Array[] = [], views: Array<{ buffer: number; byteOffset: number; byteLength: number }> = [];
  const accessors: Array<Record<string, unknown>> = [];
  let byteLength = 0;
  const append = (values: Float32Array, type: "SCALAR" | "VEC2" | "VEC3", bounds = false): number => {
    const stride = type === "SCALAR" ? 1 : type === "VEC2" ? 2 : 3;
    if (values.length % stride) throw new AnimationFormatError("INVALID_MD2", "attribute component count is invalid");
    if (values.length > Math.floor((maxBytes - byteLength) / 4)) throw new AnimationFormatError("OUTPUT_LIMIT", "MD2 morph projection exceeds maxBytes");
    const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer);
    const min = Array<number>(stride).fill(Infinity), max = Array<number>(stride).fill(-Infinity);
    for (let i = 0; i < values.length; i += 1) {
      const value = finite(values[i]!, "morph value"); view.setFloat32(i * 4, value, true);
      min[i % stride] = Math.min(min[i % stride]!, value); max[i % stride] = Math.max(max[i % stride]!, value);
    }
    const viewIndex = views.length; views.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length }); chunks.push(bytes); byteLength += bytes.length;
    const index = accessors.length; accessors.push({ bufferView: viewIndex, componentType: 5126, count: values.length / stride, type, ...(bounds ? { min, max } : {}) }); return index;
  };
  const position = append(base.positions, "VEC3", true), normal = append(base.normals, "VEC3"), uv = append(base.texcoords, "VEC2");
  const targets: Array<{ POSITION: number; NORMAL: number }> = [];
  for (let frame = 1; frame < asset.frames.length; frame += 1) {
    const sample = sampleMD2Geometry(asset, asset.frames[frame]!.time);
    const delta = new Float32Array(base.positions.length), normalDelta = new Float32Array(base.normals.length);
    for (let i = 0; i < delta.length; i += 1) {
      delta[i] = finite(sample.positions[i]! - base.positions[i]!, "morph position delta");
      normalDelta[i] = finite(sample.normals[i]! - base.normals[i]!, "morph normal delta");
    }
    targets.push({ POSITION: append(delta, "VEC3"), NORMAL: append(normalDelta, "VEC3") });
  }
  let animations: unknown[] = [];
  if (targetCount > 0) {
    const times = Float32Array.from(asset.frames.map((frame) => frame.time));
    for (let i = 1; i < times.length; i += 1) if (times[i]! <= times[i - 1]!) throw new AnimationFormatError("INVALID_TIME", "frame times are not distinct at float32 precision");
    const weights = new Float32Array(asset.frames.length * targetCount);
    for (let i = 1; i < asset.frames.length; i += 1) weights[i * targetCount + i - 1] = 1;
    const input = append(times, "SCALAR", true), output = append(weights, "SCALAR");
    animations = [{ name: "md2-frames", samplers: [{ input, output, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 0, path: "weights" } }] }];
  }
  const bytes = new Uint8Array(byteLength); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let binary = ""; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  let images: unknown[] = [], textures: unknown[] = [], materials: unknown[] = [];
  if (asset.skinAssets?.length) {
    const index = options.skinIndex ?? 0;
    if (!Number.isInteger(index) || index < 0 || index >= asset.skinAssets.length) throw new AnimationFormatError("INDEX_RANGE", "selected MD2 skin does not exist");
    const image = asset.skinAssets[index]!;
    let data = image.bytes;
    if (data[0] === 10) {
      const plan = earlyPCX?.input === data ? earlyPCX.plan : preflightMD2PCX(data, maxBytes, options.maxPCXWorkingBytes);
      if (plan.pngLength > maxBytes - byteLength) throw new AnimationFormatError("OUTPUT_LIMIT", "MD2 geometry and skin exceed maxBytes");
      data = decodeMD2PCXWithPlan(data, plan);
    }
    const mime = data.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => data[i] === v) ? "image/png"
      : data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff ? "image/jpeg"
      : data.length >= 12 && String.fromCharCode(...data.subarray(0, 4)) === "RIFF" && String.fromCharCode(...data.subarray(8, 12)) === "WEBP" ? "image/webp" : undefined;
    if (!mime) throw new AnimationFormatError("UNSUPPORTED_MD2_SKIN", "resolved skin must be indexed or true-color PCX, PNG, JPEG or WebP");
    if (data.length + byteLength > maxBytes) throw new AnimationFormatError("OUTPUT_LIMIT", "MD2 geometry and skin exceed maxBytes");
    let payload = ""; for (let i = 0; i < data.length; i += 8192) payload += String.fromCharCode(...data.subarray(i, i + 8192));
    images = [{ uri: `data:${mime};base64,${btoa(payload)}` }]; textures = [{ source: 0 }];
    materials = [{ name: "md2-skin", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 } }];
  } else if (options.skinIndex !== undefined) throw new AnimationFormatError("MISSING_MD2_SKIN", "resolve skin dependencies before selecting a skin");
  const primitive = { attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: uv }, ...(targets.length ? { targets } : {}), ...(materials.length ? { material: 0 } : {}) };
  const json = { asset: { version: "2.0", generator: "Aura3D MD2 importer" },
    buffers: [{ uri: `data:application/octet-stream;base64,${btoa(binary)}`, byteLength }], bufferViews: views, accessors, images, textures, materials,
    meshes: [{ name: "md2-mesh", primitives: [primitive], ...(targets.length ? { weights: targets.map(() => 0), extras: { targetNames: asset.frames.slice(1).map((frame, i) => frame.name || `frame-${i + 1}`) } } : {}) }],
    nodes: [{ name: "md2-node", mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0, animations };
  return await new GLTFLoader().load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(json))}`, type: "gltf" }, new NativeLoadContext());
}
export interface MD2RenderableScene extends RenderableScene {
  /** Seek the imported frame clip in seconds; the final frame is held rather than looped. */
  setTime(time: number): void;
}
/** Build an MD2 scene with an explicit time-controlled morph animation binding. */
export async function createMD2RenderableScene(asset: MD2Asset, renderOptions: CreateRenderableSceneOptions = {}, options: MD2ProjectionOptions = {}): Promise<MD2RenderableScene> {
  const gltf = await createMD2GLTFAsset(asset, options);
  let runtime: GLTFSceneAnimationRuntime | undefined;
  try {
    const scene = await createRenderableScene({ kind: "gltf", gltf, warnings: asset.diagnostics.map((d) => `${d.code}: ${d.message}`) }, renderOptions);
    try {
      if (!scene.source.scene) throw new AnimationFormatError("MISSING_SCENE", "MD2 render source has no scene to animate");
      runtime = new GLTFSceneAnimationRuntime({ scene: scene.source.scene, clips: gltf.animations, asset: gltf });
      let live = true;
      return { ...scene,
        setTime(time) {
          if (!live) throw new AnimationFormatError("DISPOSED", "MD2 scene has been disposed");
          finite(time, "sample time");
          if (gltf.animations[0]) {
            const result = runtime!.applyClip(gltf.animations[0], Math.max(0, Math.min(time, gltf.animations[0].duration)));
            if (result.missingTargets.length) throw new AnimationFormatError("MISSING_BINDING", `MD2 animation targets not found: ${result.missingTargets.join(", ")}`);
          }
        },
        dispose() {
          if (!live) return; live = false;
          try { runtime?.dispose(); } finally { try { scene.dispose(); } finally { new GLTFLoader().dispose(gltf); } }
        }
      };
    } catch (error) { scene.dispose(); throw error; }
  } catch (error) { runtime?.dispose(); new GLTFLoader().dispose(gltf); throw error; }
}
/** Explicit registration bridges MD2 geometry into the existing scene-resource path. */
export function createMD2FormatAdapter(options: MD2ImportOptions & MD2ProjectionOptions = {}): FormatAdapter<MD2Asset, MD2RenderableScene> {
  return { id: "md2", extensions: ["md2"], loader: new MD2Loader(options), supportedVersions: ["8"],
    getWarnings: (asset) => asset.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
    buildRenderableScene: (asset, renderOptions) => createMD2RenderableScene(asset, renderOptions, options) };
}
