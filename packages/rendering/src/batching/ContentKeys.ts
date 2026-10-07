/**
 * PRD 11 Phase 3 (§6.6 layer 1) — content-keyed dedupe keys the renderer can
 * trust. The engine compiler creates a unique `Geometry` and `Material` per
 * primitive node (lane 15, `compiler/primitives.ts`); identical primitive
 * instances therefore miss every identity-based merge. These keys recover
 * value equality:
 *
 * - `geometryContentKey(geometry)` — the C-07 primitive/tessellation
 *   descriptor when one was stamped on the geometry, else a hash of vertex
 *   count, index count and a strided sample of the position/normal/uv data,
 *   memoised per `Geometry` in a `WeakMap` and verified by a full-array
 *   compare on the first collision (a collision between unequal arrays yields
 *   different keys).
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

/** Optional C-07 carry stamped on a Geometry by the primitive compiler (Q-15-2). */
interface TessellationDescriptorCarrier {
  readonly __a3dPrimitiveDescriptor?: Readonly<Record<string, unknown>>;
}

const geometryMemo = new WeakMap<Geometry, string>();
/** Registration order per key, for the full-array collision check. */
const geometryKeyOwners = new Map<string, Geometry[]>();
const textureIds = new WeakMap<Texture, number>();
const materialMemo = new WeakMap<object, { key: string; revision: number }>();
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

function uniformKeyValue(name: string, value: UniformValue): string {
  if (typeof value === "number") return `n:${value}`;
  if (isTextureBinding(value)) {
    const binding = value;
    return `t:${textureIdentity(binding.texture)}:${stableValue({
      minFilter: binding.sampler.minFilter, magFilter: binding.sampler.magFilter,
      addressU: binding.sampler.addressU, addressV: binding.sampler.addressV,
      maxAnisotropy: binding.sampler.maxAnisotropy
    })}:${binding.offset.join(",")}:${binding.scale.join(",")}:${binding.rotation}`;
  }
  return `a:${Array.from(value as ArrayLike<number>, (v) => stableValue(v)).join(",")}`;
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
  const memoized = materialMemo.get(material);
  if (memoized && memoized.revision === base.getRevision()) return memoized.key;

  const parts: string[] = [
    `shader:${base.shaderKey}`,
    `variant:${base.shaderVariant ?? ""}`,
    `rs:${stableValue(base.renderState)}`
  ];
  const opacity = opacityOf(parameters);
  for (const name of [...parameters.keys()].sort()) {
    if (materialKeyExcludesParameter(name, parameters)) continue;
    parts.push(`${name}=${uniformKeyValue(name, parameters.get(name)!)}`);
  }
  // Opacity below the exclusion threshold still batches: alpha rides baseColor.
  if (opacity !== null && opacity < 0.999) parts.push(`opacity<0.999:${opacity}`);
  const key = parts.join("|");
  materialMemo.set(material, { key, revision: base.getRevision() });
  return key;
}

function geometryDescriptor(geometry: Geometry): string | null {
  const descriptor = (geometry as unknown as TessellationDescriptorCarrier).__a3dPrimitiveDescriptor;
  return descriptor ? `prim:${stableValue(descriptor)}` : null;
}

/**
 * 64-bit FNV-1a over a strided sample of the interleaved vertex data plus the
 * whole index buffer. Vertex samples stay cheap for large buffers; the
 * collision-verification pass below is what makes equal keys trustworthy.
 */
function geometryHash(geometry: Geometry): string {
  const vertex = geometry.vertexBuffer;
  const floats = vertex.floats;
  const indices = geometry.indexBuffer?.data ?? null;
  const strideFloats = Math.max(1, vertex.format.stride >> 2);
  const maxSampledVertices = 64;
  const step = Math.max(1, Math.floor(vertex.vertexCount / maxSampledVertices));
  let h1 = 0x811c9dc5 ^ 0x9e3779b9;
  let h2 = 0x811c9dc5 ^ 0xc4ceb9fe;
  const mix = (value: number) => {
    const bits = Math.fround(value) * 2654435761;
    h1 = Math.imul(h1 ^ bits, 16777619);
    h2 = Math.imul(h2 + bits, 16777619 + 0x9e3779b9);
  };
  for (let i = 0; i < vertex.vertexCount; i += step) {
    const base = i * strideFloats;
    for (let c = 0; c < strideFloats; c += 1) mix(floats[base + c] ?? 0);
  }
  if (indices) {
    for (let i = 0; i < indices.length; i += 1) mix(indices[i]!);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

function vertexDataEquals(a: Geometry, b: Geometry): boolean {
  const fa = a.vertexBuffer.floats;
  const fb = b.vertexBuffer.floats;
  if (fa.length !== fb.length) return false;
  for (let i = 0; i < fa.length; i += 1) if (fa[i] !== fb[i]) return false;
  const ia = a.indexBuffer?.data ?? null;
  const ib = b.indexBuffer?.data ?? null;
  if ((ia === null) !== (ib === null)) return false;
  if (ia && ib) {
    if (ia.length !== ib.length) return false;
    for (let i = 0; i < ia.length; i += 1) if (ia[i] !== ib[i]) return false;
  }
  return true;
}

export function geometryContentKey(geometry: Geometry): string {
  const memoized = geometryMemo.get(geometry);
  if (memoized) return memoized;

  const descriptor = geometryDescriptor(geometry);
  let key = descriptor ?? [
    "hash",
    geometry.topology,
    geometry.vertexBuffer.vertexCount,
    geometry.indexBuffer?.count ?? 0,
    geometry.vertexBuffer.format.attributes.map((a) => `${a.semantic}:${a.components}`).join(","),
    geometryHash(geometry)
  ].join(":");

  // Full-array compare on first collision: equal data keeps the shared key,
  // unequal data gets a disambiguating suffix (deterministic in registration
  // order, memoised per Geometry forever after).
  if (!descriptor) {
    const owners = geometryKeyOwners.get(key);
    if (owners) {
      let verified = false;
      for (const other of owners) {
        if (vertexDataEquals(geometry, other)) {
          verified = true;
          break;
        }
      }
      if (!verified) {
        key = `${key}#c${nextCollisionSuffix}`;
        nextCollisionSuffix += 1;
      }
      owners.push(geometry);
    } else {
      geometryKeyOwners.set(key, [geometry]);
    }
  }
  geometryMemo.set(geometry, key);
  return key;
}
