/**
 * PRD 11 Phase 3 (§6.6 layer 1) — content-keyed dedupe keys the renderer can
 * trust. The engine compiler creates a unique `Geometry` and `Material` per
 * primitive node (lane 15, `compiler/primitives.ts`); identical primitive
 * instances therefore miss every identity-based merge. These keys recover
 * value equality:
 *
 * - `geometryContentKey(geometry)` — the C-07 primitive/tessellation
 *   descriptor when one was stamped on the geometry, combined with its
 *   complete layout and a hash of the current vertex/index bytes. Hash
 *   collisions are verified against byte snapshots.
 * - `materialSpecKey(material)` — stable key over every scalar field and
 *   texture identity, excluding `baseColor`, `emissive`/`emissiveIntensity`
 *   and `opacity` (when ≥ 0.999): per-node colour and emissive ride
 *   `RenderItem.instanceColors`/`instanceEmissive` instead, so materials that
 *   differ only there still merge.
 *
 * Both are pure functions; no GPU work happens here.
 */

import type { Geometry } from "../Geometry";
import { Material } from "../Material";
import { MaterialInstance } from "../MaterialInstance";
import type { RenderMaterial } from "../ForwardPass";
import { isTextureBinding } from "../TextureBinding";
import type { Texture } from "../Texture";
import type { UniformValue } from "../RenderDevice";
import type { VertexFormat } from "../VertexFormat";

/** Optional C-07 carry stamped on a Geometry by the primitive compiler (Q-15-2). */
interface TessellationDescriptorCarrier {
  readonly __a3dPrimitiveDescriptor?: Readonly<Record<string, unknown>>;
}

interface GeometryKeyOwner {
  readonly key: string;
  readonly vertexBytes: readonly Uint8Array[];
  readonly indexBytes: Uint8Array | null;
  references: number;
}
interface GeometryKeyRegistration {
  readonly baseKey: string;
  readonly owner: GeometryKeyOwner;
  readonly token: object;
}
/** Snapshots exist only while a live geometry owns this content version. */
const geometryKeyOwners = new Map<string, GeometryKeyOwner[]>();
const geometryKeyRegistrations = new WeakMap<Geometry, GeometryKeyRegistration>();
const geometryKeyFinalizer = typeof FinalizationRegistry === "function"
  ? new FinalizationRegistry<Pick<GeometryKeyRegistration, "baseKey" | "owner">>((registration) => releaseGeometryKey(registration))
  : null;
const textureIds = new WeakMap<Texture, number>();
let nextTextureId = 1;
let nextCollisionSuffix = 0;

function textureIdentity(texture: Texture | null): number {
  if (!texture) return 0;
  let id = textureIds.get(texture);
  if (id === undefined) {
    id = nextTextureId;
    nextTextureId += 1;
    textureIds.set(texture, id);
  }
  return id;
}

function stableValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "nonfinite";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return `[${Array.from(value as ArrayLike<unknown>, (entry) => stableValue(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableValue(v)}`);
    return `{${entries.join(",")}}`;
  }
  return typeof value;
}

/**
 * Parameter names whose per-node value is carried by the merged draw, not by
 * the material key. `u_`-prefixed uniforms and engine-level names both match.
 */
const COLOR_PARAMS: ReadonlySet<string> = new Set(["baseColor"]);
const EMISSIVE_PARAMS: ReadonlySet<string> = new Set(["emissive", "emissiveColor", "emissiveStrength", "emissiveIntensity"]);
const OPACITY_PARAMS: ReadonlySet<string> = new Set(["opacity"]);

function bareParamName(name: string): string {
  return name.startsWith("u_") ? name.slice(2) : name;
}

function opacityOf(parameters: ReadonlyMap<string, UniformValue>): number | null {
  for (const [name, value] of parameters) {
    if (OPACITY_PARAMS.has(bareParamName(name)) && typeof value === "number") return value;
  }
  return null;
}

/** True when `name` is a colour/emissive slot or an opacity slot equal to 1. */
export function materialKeyExcludesParameter(name: string, parameters: ReadonlyMap<string, UniformValue>): boolean {
  const bare = bareParamName(name);
  if (COLOR_PARAMS.has(bare) || EMISSIVE_PARAMS.has(bare)) return true;
  if (OPACITY_PARAMS.has(bare)) {
    const value = parameters.get(name);
    return typeof value === "number" ? value >= 0.999 : true;
  }
  return false;
}

export function materialSpecKey(material: RenderMaterial): string {
  const base: Material = material instanceof MaterialInstance ? material.baseMaterial : material;
  const parameters = material.getParameters();

  const opacity = opacityOf(parameters);
  // MaterialInstance overrides, render-state objects and texture bindings can
  // change independently of the base material's revision. Recompute from the
  // effective values rather than reusing an incomplete revision key. Structured
  // encoding keeps parameter names and non-finite values unambiguous.
  return JSON.stringify([
    base.shaderKey, base.shaderVariant ?? null, base.fog, snapshotValue(base.renderState),
    [...parameters.entries()].filter(([name]) => !materialKeyExcludesParameter(name, parameters))
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([name, value]) => [name, snapshotUniform(value)]),
    opacity !== null && opacity < 0.999 ? snapshotValue(opacity) : null
  ]);
}

function snapshotValue(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === undefined) return ["undefined"];
  if (value === null) return ["null"];
  if (typeof value === "number") return ["number", Object.is(value, -0) ? "-0" : String(value)];
  if (typeof value === "string" || typeof value === "boolean") return [typeof value, value];
  if (typeof value === "object") {
    if (ancestors.has(value)) throw new TypeError("Cyclic material snapshot value");
    ancestors.add(value);
    try {
      if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        const kind = Array.isArray(value) ? "array" : Object.prototype.toString.call(value);
        return [kind, Array.from(value as ArrayLike<unknown>, entry => snapshotValue(entry, ancestors))];
      }
      return ["object", Object.keys(value).sort().map(key => [key, snapshotValue((value as Record<string, unknown>)[key], ancestors)])];
    } finally { ancestors.delete(value); }
  }
  throw new TypeError(`Unsupported material snapshot value: ${typeof value}`);
}

function snapshotUniform(value: UniformValue): unknown {
  if (!isTextureBinding(value)) return snapshotValue(value);
  const texture = value.texture;
  return ["texture-binding", textureIdentity(texture), texture?.revision ?? null, texture?.disposed ?? null,
    texture?.colorSpace ?? null, texture?.dimension ?? null,
    snapshotValue({ name: value.name, sampler: value.sampler, required: value.required, ready: value.ready,
      expectedColorSpace: value.expectedColorSpace, expectedDimension: value.expectedDimension,
      offset: value.offset, scale: value.scale, rotation: value.rotation })];
}

/** Exact effective material state for invalidating a cached batch plan. */
export function materialSnapshotKey(material: RenderMaterial): string {
  const base = material instanceof MaterialInstance ? material.baseMaterial : material;
  const parameters = material.getParameters();
  return JSON.stringify([
    base.shaderKey, base.shaderVariant ?? null, base.fog, snapshotValue(base.renderState),
    [...parameters.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([name, value]) => [name, snapshotUniform(value)])
  ]);
}

function geometryDescriptor(geometry: Geometry): string | null {
  const descriptor = (geometry as unknown as TessellationDescriptorCarrier).__a3dPrimitiveDescriptor;
  return descriptor ? `prim:${stableValue(descriptor)}` : null;
}

/** Canonical identity of all buffer streams and shader-visible attribute fields. */
export function vertexFormatKey(format: VertexFormat): string {
  return JSON.stringify([
    format.streams.map((stream) => [stream.slot, stream.stride, stream.stepMode, stream.divisor]),
    format.attributes.map((attribute) => [
      attribute.semantic, attribute.components, attribute.offset, attribute.type,
      attribute.normalized, attribute.integer, attribute.bufferSlot,
      attribute.shaderLocation, attribute.shaderName
    ])
  ]);
}

/** Two independent 32-bit byte hashes, followed by a byte-wise collision check. */
function geometryHash(vertexBytes: readonly Uint8Array[], indexBytes: Uint8Array | null): string {
  let h1 = 0x811c9dc5 ^ 0x9e3779b9;
  let h2 = 0x811c9dc5 ^ 0xc4ceb9fe;
  const mix = (value: number) => {
    h1 = Math.imul(h1 ^ value, 16777619);
    h2 = Math.imul(h2 ^ value, 2246822519);
  };
  for (const stream of vertexBytes) for (const value of stream) mix(value);
  if (indexBytes) for (const value of indexBytes) mix(value);
  return `${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`;
}

function bytesEqual(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function ownerMatches(owner: GeometryKeyOwner, vertices: readonly Uint8Array[], indices: Uint8Array | null): boolean {
  return owner.vertexBytes.length === vertices.length
    && owner.vertexBytes.every((bytes, index) => bytesEqual(bytes, vertices[index]!))
    && bytesEqual(owner.indexBytes, indices);
}

function exactBytesKey(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += byte.toString(16).padStart(2, "0");
  return value;
}

function releaseGeometryKey(registration: Pick<GeometryKeyRegistration, "baseKey" | "owner">): void {
  const { baseKey, owner } = registration;
  owner.references -= 1;
  if (owner.references > 0) return;
  const owners = geometryKeyOwners.get(baseKey);
  if (!owners) return;
  const index = owners.indexOf(owner);
  if (index >= 0) owners.splice(index, 1);
  if (owners.length === 0) geometryKeyOwners.delete(baseKey);
}

export function geometryContentKey(geometry: Geometry): string {
  const format = geometry.vertexBuffer.format;
  const streams = format.streams.map((stream) => {
    const buffer = geometry.getVertexBuffer(stream.slot);
    return { slot: stream.slot, count: buffer.vertexCount, bytes: new Uint8Array(buffer.data) };
  });
  const vertices = streams.map((stream) => stream.bytes);
  const indices = geometry.indexBuffer?.data;
  const indexBytes = indices ? new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength) : null;
  const descriptor = geometryDescriptor(geometry);
  const baseKey = JSON.stringify([
    descriptor,
    geometry.topology,
    streams.map((stream) => [stream.slot, stream.count]),
    geometry.indexBuffer?.count ?? 0,
    geometry.indexBuffer?.type ?? null,
    vertexFormatKey(format),
    geometryHash(vertices, indexBytes)
  ]);

  // Older hosts without finalizers use an exact, self-contained key instead
  // of retaining collision snapshots for an unknowable lifetime.
  if (!geometryKeyFinalizer) {
    return JSON.stringify([baseKey, vertices.map(exactBytesKey), indexBytes ? exactBytesKey(indexBytes) : null]);
  }

  const previous = geometryKeyRegistrations.get(geometry);
  if (previous && previous.baseKey === baseKey && ownerMatches(previous.owner, vertices, indexBytes)) return previous.owner.key;

  let owners = geometryKeyOwners.get(baseKey);
  let owner = owners?.find((candidate) => ownerMatches(candidate, vertices, indexBytes));
  if (!owner) {
    const key = owners ? `${baseKey}#c${nextCollisionSuffix++}` : baseKey;
    owner = { key, vertexBytes: vertices.map((bytes) => bytes.slice()), indexBytes: indexBytes?.slice() ?? null, references: 0 };
    if (owners) owners.push(owner);
    else { owners = [owner]; geometryKeyOwners.set(baseKey, owners); }
  }

  // Register the new value before releasing the old one, so even a true hash
  // collision with this geometry's previous bytes receives a different key.
  owner.references += 1;
  const token = {};
  geometryKeyRegistrations.set(geometry, { baseKey, owner, token });
  geometryKeyFinalizer.register(geometry, { baseKey, owner }, token);
  if (previous) {
    geometryKeyFinalizer.unregister(previous.token);
    releaseGeometryKey(previous);
  }
  return owner.key;
}
