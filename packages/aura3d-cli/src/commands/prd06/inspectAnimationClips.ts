/**
 * PRD-06 T0.7 — pure GLB animation-clip inspection for the
 * `aura3d animation inspect-clips <glb>` C-39 command. Same extraction
 * `GLTFSceneAnimationRuntime.resolvedClipInfos()` performs at load:
 *
 * - `duration` — the max over the clip's samplers of the input accessor's
 *   `max[0]`; when `max` is absent the accessor data is read instead.
 * - `channelCount` — the clip's glTF channel count.
 * - `hasRootMotionCandidate` — a hips/root/pelvis translation track whose
 *   first↔last XZ displacement exceeds 5 cm (mirrors
 *   `clipHasRootMotionCandidate` in `GLTFAnimationRuntime.ts`).
 * - `frameRate?` — the median input-time delta, inverted (omitted when the
 *   accessor data is unavailable or degenerate).
 *
 * Q-05-1 asks lane 05 to call this from `inspectGltfAnimations` and emit C-17
 * `animationClips` objects in `asset-manifest.ts`; until then this module is
 * reached through the registered command and lane tests.
 */

export interface GltfAnimationDocument {
  readonly accessors?: readonly {
    readonly min?: readonly number[];
    readonly max?: readonly number[];
    readonly bufferView?: number;
    readonly byteOffset?: number;
    readonly componentType?: number;
    readonly count?: number;
    readonly type?: string;
  }[];
  readonly bufferViews?: readonly {
    readonly buffer?: number;
    readonly byteOffset?: number;
    readonly byteLength?: number;
    readonly byteStride?: number;
  }[];
  readonly animations?: readonly {
    readonly name?: string;
    readonly channels?: readonly {
      readonly sampler?: number;
      readonly target?: { readonly node?: number; readonly path?: string };
    }[];
    readonly samplers?: readonly {
      readonly input?: number;
      readonly output?: number;
      readonly interpolation?: string;
    }[];
  }[];
  readonly nodes?: readonly { readonly name?: string }[];
  /** T4.6 — hero validation needs geometry fields (meshes/skins/materials). */
  readonly meshes?: readonly {
    readonly primitives?: readonly {
      readonly mode?: number;
      readonly indices?: number;
      readonly attributes?: { readonly POSITION?: number };
    }[];
  }[];
  readonly skins?: readonly { readonly joints?: readonly number[] }[];
  readonly materials?: readonly {
    readonly pbrMetallicRoughness?: { readonly baseColorTexture?: unknown };
  }[];
}

export interface AuraCliInspectedAnimationClip {
  readonly index: number;
  readonly name: string;
  readonly duration: number;
  readonly channelCount: number;
  readonly hasRootMotionCandidate: boolean;
  readonly frameRate?: number;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_FLOAT32 = 5126;

/** Decode a GLB buffer into its JSON document and BIN chunk. */
export function readGlbDocument(buffer: Uint8Array): { readonly json: GltfAnimationDocument; readonly bin?: Uint8Array } {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("Invalid GLB header. Suggested fix: re-export the asset as binary glTF (.glb).");
  }
  const total = view.getUint32(8, true);
  if (total > buffer.byteLength) {
    throw new Error("Invalid GLB length. Suggested fix: run assets validate on the original export.");
  }
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON) {
    throw new Error("Invalid GLB JSON chunk. Suggested fix: re-export the GLB.");
  }
  const json = JSON.parse(new TextDecoder().decode(buffer.subarray(20, 20 + jsonLength))) as GltfAnimationDocument;
  let bin: Uint8Array | undefined;
  const binHeader = 20 + jsonLength;
  if (binHeader + 8 <= buffer.byteLength && view.getUint32(binHeader + 4, true) === CHUNK_BIN) {
    const binLength = view.getUint32(binHeader, true);
    bin = buffer.subarray(binHeader + 8, binHeader + 8 + Math.min(binLength, buffer.byteLength - binHeader - 8));
  }
  return { json, bin };
}

export function inspectAnimationClips(
  json: GltfAnimationDocument,
  bin?: Uint8Array
): readonly AuraCliInspectedAnimationClip[] {
  const accessors = json.accessors ?? [];
  const nodes = json.nodes ?? [];
  return (json.animations ?? []).map((animation, index) => {
    const channels = animation.channels ?? [];
    const samplers = animation.samplers ?? [];
    let duration = 0;
    for (const channel of channels) {
      const input = samplers[channel.sampler ?? -1]?.input;
      if (input === undefined) continue;
      const accessorMax = accessors[input]?.max?.[0];
      if (typeof accessorMax === "number" && Number.isFinite(accessorMax)) {
        duration = Math.max(duration, accessorMax);
        continue;
      }
      // `max` absent (legal per spec): read the last input time from accessor data.
      const count = accessors[input]?.count ?? 0;
      const last = count > 0 ? readScalar(json, bin, input, count - 1) : undefined;
      if (last !== undefined) duration = Math.max(duration, last);
    }
    const hasRootMotionCandidate = channels.some((channel) =>
      isRootMotionCandidate(json, bin, nodes, samplers, channel)
    );
    const frameRate = medianFrameRate(json, bin, samplers);
    return {
      index,
      name: animation.name ?? `clip-${index}`,
      duration,
      channelCount: channels.length,
      hasRootMotionCandidate,
      ...(frameRate !== undefined ? { frameRate } : {})
    };
  });
}

function isRootMotionCandidate(
  json: GltfAnimationDocument,
  bin: Uint8Array | undefined,
  nodes: NonNullable<GltfAnimationDocument["nodes"]>,
  samplers: NonNullable<NonNullable<GltfAnimationDocument["animations"]>[number]["samplers"]>,
  channel: NonNullable<NonNullable<GltfAnimationDocument["animations"]>[number]["channels"]>[number]
): boolean {
  if (channel.target?.path !== "translation") return false;
  const nodeName = nodes[channel.target.node ?? -1]?.name ?? "";
  if (!/hips|root|pelvis/i.test(nodeName)) return false;
  const output = samplers[channel.sampler ?? -1]?.output;
  const count = output === undefined ? 0 : json.accessors?.[output]?.count ?? 0;
  if (count < 2) return false;
  const first = readVec3(json, bin, output, 0);
  const last = readVec3(json, bin, output, count - 1);
  if (!first || !last) return false;
  return Math.hypot(last[0] - first[0], last[2] - first[2]) > 0.05;
}

function medianFrameRate(
  json: GltfAnimationDocument,
  bin: Uint8Array | undefined,
  samplers: NonNullable<NonNullable<GltfAnimationDocument["animations"]>[number]["samplers"]>
): number | undefined {
  const deltas: number[] = [];
  for (const sampler of samplers) {
    const times = readFloatAccessor(json, bin, sampler?.input);
    if (!times || times.length < 2) continue;
    for (let i = 1; i < times.length; i += 1) {
      const delta = times[i]! - times[i - 1]!;
      if (delta > 0) deltas.push(delta);
    }
  }
  if (deltas.length === 0) return undefined;
  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)]!;
  if (median <= 0) return undefined;
  return 1 / median;
}

function readVec3(
  json: GltfAnimationDocument,
  bin: Uint8Array | undefined,
  accessorIndex: number | undefined,
  elementIndex: number
): [number, number, number] | undefined {
  if (accessorIndex === undefined) return undefined;
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.componentType !== COMPONENT_FLOAT32 || accessor.type !== "VEC3") return undefined;
  const values = readFloatAccessor(json, bin, accessorIndex, 3);
  if (!values) return undefined;
  const base = elementIndex * 3;
  if (base + 2 >= values.length) return undefined;
  return [values[base]!, values[base + 1]!, values[base + 2]!];
}

function readScalar(
  json: GltfAnimationDocument,
  bin: Uint8Array | undefined,
  accessorIndex: number | undefined,
  elementIndex: number
): number | undefined {
  const values = readFloatAccessor(json, bin, accessorIndex, 1);
  return values && elementIndex < values.length ? values[elementIndex] : undefined;
}

const floatAccessorCache = new WeakMap<Uint8Array, Map<number, Float32Array>>();

function readFloatAccessor(
  json: GltfAnimationDocument,
  bin: Uint8Array | undefined,
  accessorIndex: number | undefined,
  componentsPerElement = 1
): Float32Array | undefined {
  if (accessorIndex === undefined || !bin) return undefined;
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.componentType !== COMPONENT_FLOAT32) return undefined;
  const view = accessor.bufferView === undefined ? undefined : json.bufferViews?.[accessor.bufferView];
  if (!view) return undefined;
  const cacheKey = accessorIndex * 16 + componentsPerElement;
  let perBin = floatAccessorCache.get(bin);
  if (perBin?.has(cacheKey)) return perBin.get(cacheKey);
  const count = accessor.count ?? 0;
  const strideBytes = view.byteStride && view.byteStride >= componentsPerElement * 4 ? view.byteStride : componentsPerElement * 4;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const end = base + (count > 0 ? (count - 1) * strideBytes + componentsPerElement * 4 : 0);
  if (end > bin.byteLength) return undefined;
  const out = new Float32Array(count * componentsPerElement);
  for (let i = 0; i < count; i += 1) {
    const elementBase = base + i * strideBytes;
    for (let c = 0; c < componentsPerElement; c += 1) {
      out[i * componentsPerElement + c] = new DataView(bin.buffer, bin.byteOffset + elementBase + c * 4, 4).getFloat32(0, true);
    }
  }
  if (!perBin) {
    perBin = new Map();
    floatAccessorCache.set(bin, perBin);
  }
  perBin.set(cacheKey, out);
  return out;
}
