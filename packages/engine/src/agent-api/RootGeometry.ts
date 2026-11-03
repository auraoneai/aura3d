import type { SdfTextStyle } from "@aura3d/rendering";
import type { AuraColor } from "./nodes/types.js";
import { assertGeometryMorphChannels } from "./geometry/MorphChannels.js";

export type AuraRootVec3 = readonly [number, number, number];

/**
 * SG-05 (threejs-parity L2): vertex data accepts the legacy tuple layout or a
 * flat packed array (Float32Array or plain number[]). Tuple input keeps the
 * pre-L2 `defineAuraCustomGeometry` shape bit-for-bit; flat input is the
 * typed-array `geometry.dynamic` / `handle.setGeometry` path.
 */
export type AuraVec3Attribute = readonly AuraRootVec3[] | Float32Array | readonly number[];
export type AuraVec2Attribute = readonly (readonly [number, number])[] | Float32Array | readonly number[];
export type AuraIndexAttribute = readonly number[] | Uint16Array | Uint32Array;

export interface AuraGeometryGroupSpec {
  readonly start: number;
  readonly count: number;
  readonly materialIndex?: number;
}

export interface AuraGeometryDrawRangeSpec {
  readonly start: number;
  readonly count: number;
}

export interface AuraGeometryMorphTargetSpec {
  readonly name?: string;
  readonly positions: Float32Array | readonly number[];
  /** Optional per-vertex normal deltas, packed as xyz components. */
  readonly normals?: Float32Array | readonly number[];
  /** Optional per-vertex tangent deltas, packed as xyz components. */
  readonly tangents?: Float32Array | readonly number[];
}

/** Typed components accepted for a custom vertex attribute. */
export type AuraCustomVertexAttributeData = Float32Array | Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | readonly number[];

/**
 * Author-named per-vertex data. Stride and offset are measured in components,
 * not bytes. Integer data can be mapped to normalized shader values.
 */
export interface AuraCustomVertexAttributeSpec {
  readonly itemSize: 1 | 2 | 3 | 4;
  readonly data: AuraCustomVertexAttributeData;
  readonly normalized?: boolean;
  readonly stride?: number;
  readonly offset?: number;
}

export interface AuraCustomGeometrySpec {
  readonly kind: "aura-custom-geometry";
  readonly positions: AuraVec3Attribute;
  readonly normals?: AuraVec3Attribute;
  /** Optional UVs (one per position) — the decal batch path samples pages with them. */
  readonly uvs?: AuraVec2Attribute;
  /** Optional second UV channel, for example lightmap coordinates. */
  readonly uv1s?: AuraVec2Attribute;
  /** SG-05: per-vertex RGBA colors (Float32Array or `[r,g,b,a]` tuples/`AuraColor` list). */
  readonly colors?: Float32Array | readonly number[] | readonly AuraColor[];
  readonly indices: AuraIndexAttribute;
  /** R-23: author-named per-vertex attributes (max 11), bound by name in `material.custom` GLSL. */
  readonly attributes?: Readonly<Record<string, AuraCustomVertexAttributeSpec>>;
  readonly bounds?: { readonly min: AuraRootVec3; readonly max: AuraRootVec3 };
  /** SG-05: three's geometry.groups — material-index index ranges. */
  readonly groups?: readonly AuraGeometryGroupSpec[];
  /** SG-05: three's setDrawRange — only this index range draws. */
  readonly drawRange?: AuraGeometryDrawRangeSpec;
  /** Authored morph-target position and optional normal/tangent deltas, one vec3 per vertex. */
  readonly morphTargets?: readonly AuraGeometryMorphTargetSpec[];
  /** SG-05: `"lines"` produces line-segment topology (geometry.edges/wireframe). R-23: `"points"` draws one point per vertex (the vertex shader sets gl_PointSize). Default `"triangles"`. */
  readonly topology?: "triangles" | "lines" | "points";
  /** SG-05: set by `geometry.dynamic` — flags the spec as a `handle.setGeometry` target. */
  readonly dynamic?: boolean;
}

export interface AuraText3DOptions {
  readonly size?: number;
  readonly depth?: number;
  readonly letterSpacing?: number;
}

export interface AuraText3DGeometry {
  readonly geometry: AuraCustomGeometrySpec;
  readonly text: string;
  readonly glyphCount: number;
  readonly unsupportedCharacters: readonly string[];
  readonly method: "extruded-bitmap-glyph-mesh" | "sdf-atlas-quad";
  /** SDF backend request (muse3jsparity-PRD G1): validated layout summary; rendering stays extruded until the native SDF sampler lands. */
  readonly backend?: "extruded-mesh" | "sdf";
  readonly sdfQuadCount?: number;
  readonly sdfWidthWorld?: number;
  readonly sdfHeightWorld?: number;
  /**
   * SDF bridge inputs (muse3jsparity-PRD G1): the sampler replays this exact
   * layout at mount (fail-closed), so the descriptor carries the full author
   * intent — size, spacing, style, and occlusion policy — not just extents.
   */
  readonly sdfSize?: number;
  readonly sdfLetterSpacing?: number;
  readonly sdfStyle?: SdfTextStyle;
  readonly sdfOcclusion?: "dim" | "hide" | "show";
  /** Explicit request for the shared built-in glyph atlas; unsupported cases use the existing SDF path. */
  readonly sdfGlyphAtlas?: "shared";
  /** Precomputed dynamic SDF layout and raster image consumed by the text bridge. */
  readonly sdfDynamic?: import("@aura3d/rendering").DynamicSdfText;
  /** Accessible DOM label for font-backed text, or false to suppress it. */
  readonly sdfAccessibleLabel?: string | false;
}

export interface AuraRootLodThreshold {
  readonly maxDistance?: number;
}

export interface AuraRootLodSelection {
  readonly levelIndex: number;
  readonly reason: "initial-distance" | "farther-threshold" | "nearer-threshold" | "hysteresis-hold";
}

/** Select a distance LOD while preserving the previous level inside a symmetric hysteresis band. */
export function selectAuraRootLodLevel(
  distance: number,
  levels: readonly AuraRootLodThreshold[],
  previousLevelIndex?: number,
  hysteresis = 0
): AuraRootLodSelection {
  if (!Number.isFinite(distance) || distance < 0) throw new Error("Aura3D LOD distance must be finite and non-negative.");
  if (levels.length === 0) throw new Error("Aura3D LOD requires at least one level.");
  if (!Number.isFinite(hysteresis) || hysteresis < 0) throw new Error("Aura3D LOD hysteresis must be finite and non-negative.");
  validateLodLevels(levels);
  const initial = firstLevelForDistance(distance, levels);
  if (previousLevelIndex === undefined || !Number.isInteger(previousLevelIndex) || previousLevelIndex < 0 || previousLevelIndex >= levels.length) {
    return { levelIndex: initial, reason: "initial-distance" };
  }
  let selected = previousLevelIndex;
  while (selected < levels.length - 1) {
    const boundary = levels[selected]!.maxDistance;
    if (boundary === undefined || distance <= boundary + hysteresis) break;
    selected += 1;
  }
  if (selected > previousLevelIndex) return { levelIndex: selected, reason: "farther-threshold" };
  while (selected > 0) {
    const nearerBoundary = levels[selected - 1]!.maxDistance;
    if (nearerBoundary === undefined || distance >= Math.max(0, nearerBoundary - hysteresis)) break;
    selected -= 1;
  }
  if (selected < previousLevelIndex) return { levelIndex: selected, reason: "nearer-threshold" };
  return { levelIndex: selected, reason: "hysteresis-hold" };
}

export function defineAuraCustomGeometry(spec: Omit<AuraCustomGeometrySpec, "kind">): AuraCustomGeometrySpec {
  const normalized = normalizeGeometryAttributes(spec);
  validateGeometryMetadata(spec, normalized);
  const lines = spec.topology === "lines";
  const points = spec.topology === "points";
  if (points) {
    if (normalized.vertexCount < 1) throw new Error("Aura3D custom point geometry requires at least one position.");
  } else {
    if (normalized.vertexCount < (lines ? 2 : 3)) throw new Error(`Aura3D custom ${lines ? "line" : "triangle"} geometry requires at least ${lines ? "two" : "three"} positions.`);
    const indexCount = normalized.indices?.length ?? normalized.vertexCount;
    if (lines ? indexCount % 2 !== 0 : indexCount % 3 !== 0) throw new Error(`Aura3D custom ${lines ? "line" : "triangle"} geometry indices must contain complete ${lines ? "segments" : "triangles"}.`);
  }
  if (spec.bounds) {
    validateVec3(spec.bounds.min, "bounds min");
    validateVec3(spec.bounds.max, "bounds max");
    for (let axis = 0; axis < 3; axis += 1) if (spec.bounds.max[axis]! < spec.bounds.min[axis]!) throw new Error("Aura3D custom geometry bounds max must be greater than or equal to min.");
  }
  return {
    kind: "aura-custom-geometry",
    positions: spec.positions,
    ...(spec.normals ? { normals: spec.normals } : {}),
    ...(spec.uvs ? { uvs: spec.uvs } : {}),
    ...(spec.uv1s ? { uv1s: spec.uv1s } : {}),
    ...(spec.colors ? { colors: spec.colors } : {}),
    indices: spec.indices,
    ...(spec.attributes ? { attributes: cloneCustomAttributes(spec.attributes) } : {}),
    ...(spec.groups ? { groups: [...spec.groups] } : {}),
    ...(spec.drawRange ? { drawRange: { ...spec.drawRange } } : {}),
    ...(spec.morphTargets ? { morphTargets: spec.morphTargets.map((target) => ({ ...target })) } : {}),
    ...(spec.topology ? { topology: spec.topology } : {}),
    ...(spec.dynamic === true ? { dynamic: true } : {}),
    ...(spec.bounds ? { bounds: { min: [...spec.bounds.min] as AuraRootVec3, max: [...spec.bounds.max] as AuraRootVec3 } } : {})
  };
}

function cloneCustomAttributes(attributes: Readonly<Record<string, AuraCustomVertexAttributeSpec>>): Readonly<Record<string, AuraCustomVertexAttributeSpec>> {
  return Object.fromEntries(Object.entries(attributes).map(([name, entry]) => [name, {
    ...entry,
    data: Array.isArray(entry.data) && entry.stride === undefined && entry.offset === undefined
      ? Float32Array.from(entry.data)
      : entry.data
  }]));
}

// ── SG-05 (threejs-parity L2): dynamic geometry + BufferGeometryUtils ────────

export interface NormalizedCustomVertexAttribute {
  readonly name: string;
  readonly itemSize: 1 | 2 | 3 | 4;
  readonly data: Float32Array;
}

/** R-23: names a custom attribute may not take — engine semantics, their updateAttribute aliases, and the `a_` engine prefix. */
const RESERVED_CUSTOM_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
  "position", "positions", "normal", "normals", "uv", "uv0", "uvs", "uv1", "uv1s", "color", "colors", "tangent", "tangents",
  "joints", "weights", "joints1", "weights1", "lineStart", "lineEnd", "lineCorner", "lineDistance", "index",
  "instanceMatrix", "instanceColor"
]);
export const MAX_CUSTOM_VERTEX_ATTRIBUTES = 11;

export function assertCustomAttributeName(name: string): void {
  const invalid = (message: string): Error => geometryOperationError("AURA_GEOMETRY_INVALID", `attributes.${name}`, message);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw invalid(`Aura3D custom vertex attribute name "${name}" must be a GLSL identifier ([A-Za-z_][A-Za-z0-9_]*).`);
  if (name.startsWith("gl_") || name.includes("__")) throw invalid(`Aura3D custom vertex attribute name "${name}" is reserved by GLSL (gl_ prefix or double underscore).`);
  if (name.startsWith("a_") || name.startsWith("u_")) throw invalid(`Aura3D custom vertex attribute name "${name}" uses a prefix reserved for engine attributes/uniforms (a_, u_).`);
  if (RESERVED_CUSTOM_ATTRIBUTE_NAMES.has(name)) throw invalid(`Aura3D custom vertex attribute name "${name}" collides with a built-in vertex semantic.`);
}

/** Validate and decode custom attributes into packed float shader values. */
export function normalizeCustomVertexAttributes(
  attributes: Readonly<Record<string, AuraCustomVertexAttributeSpec>> | undefined,
  vertexCount: number
): readonly NormalizedCustomVertexAttribute[] {
  if (attributes === undefined) return [];
  const names = Object.keys(attributes).sort();
  if (names.length > MAX_CUSTOM_VERTEX_ATTRIBUTES) {
    throw geometryOperationError("AURA_GEOMETRY_INVALID", "attributes", `Aura3D geometry supports at most ${MAX_CUSTOM_VERTEX_ATTRIBUTES} custom vertex attributes, got ${names.length}.`);
  }
  return names.map((name) => {
    assertCustomAttributeName(name);
    const entry = attributes[name]!;
    const invalid = (field: string, message: string): Error => geometryOperationError("AURA_GEOMETRY_INVALID", `attributes.${name}.${field}`, message);
    const itemSize = entry?.itemSize;
    if (itemSize !== 1 && itemSize !== 2 && itemSize !== 3 && itemSize !== 4) throw invalid("itemSize", `Aura3D custom vertex attribute "${name}" itemSize must be 1, 2, 3 or 4.`);
    for (const key of Reflect.ownKeys(entry)) {
      if (!Object.prototype.propertyIsEnumerable.call(entry, key)) continue;
      if (typeof key === "string" && ["itemSize", "data", "normalized", "stride", "offset"].includes(key)) continue;
      throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", `attributes.${name}.${String(key)}`, `Aura3D custom vertex attribute "${name}" has unsupported metadata "${String(key)}".`);
    }
    const raw = entry.data;
    if (!(raw instanceof Float32Array || raw instanceof Int8Array || raw instanceof Uint8Array || raw instanceof Int16Array || raw instanceof Uint16Array || raw instanceof Int32Array || raw instanceof Uint32Array || Array.isArray(raw))) {
      throw invalid("data", `Aura3D custom vertex attribute "${name}" data must be a supported typed array or number[].`);
    }
    const stride = entry.stride ?? itemSize;
    const offset = entry.offset ?? 0;
    if (!Number.isInteger(stride) || stride < itemSize) throw invalid("stride", `Aura3D custom vertex attribute "${name}" stride must be an integer at least itemSize.`);
    if (!Number.isInteger(offset) || offset < 0 || offset + itemSize > stride) throw invalid("offset", `Aura3D custom vertex attribute "${name}" offset must fit within stride.`);
    if (entry.normalized !== undefined && typeof entry.normalized !== "boolean") throw invalid("normalized", `Aura3D custom vertex attribute "${name}" normalized must be boolean.`);
    const divisor = raw instanceof Int8Array ? 127 : raw instanceof Uint8Array ? 255 : raw instanceof Int16Array ? 32767 : raw instanceof Uint16Array ? 65535 : raw instanceof Int32Array ? 2147483647 : raw instanceof Uint32Array ? 4294967295 : undefined;
    if (entry.normalized && divisor === undefined) throw invalid("normalized", `Aura3D custom vertex attribute "${name}" normalized requires integer typed data.`);
    const needed = vertexCount === 0 ? 0 : (vertexCount - 1) * stride + offset + itemSize;
    const packed = entry.stride === undefined && entry.offset === undefined;
    if (raw.length < needed || (packed && raw.length !== needed)) {
      throw invalid("data", `Aura3D custom vertex attribute "${name}" has ${raw.length} values; expected ${vertexCount} vertices x ${itemSize} components with the declared stride and offset.`);
    }
    for (let i = 0; i < raw.length; i += 1) if (!Number.isFinite(raw[i])) throw invalid("data", `Aura3D custom vertex attribute "${name}" value ${i} must be finite.`);
    const data = raw instanceof Float32Array && packed && !entry.normalized ? raw : new Float32Array(vertexCount * itemSize);
    if (data !== raw) {
      for (let vertex = 0; vertex < vertexCount; vertex += 1) for (let component = 0; component < itemSize; component += 1) {
        const value = raw[vertex * stride + offset + component]!;
        const index = vertex * itemSize + component;
        data[index] = divisor !== undefined && entry.normalized ? Math.max(-1, value / divisor) : value;
        if (!Number.isFinite(data[index])) throw invalid("data", `Aura3D custom vertex attribute "${name}" values must be finite in float32 storage.`);
      }
    }
    return { name, itemSize, data };
  });
}

export interface NormalizedGeometryAttributes {
  readonly positions: Float32Array;
  readonly vertexCount: number;
  readonly custom: readonly NormalizedCustomVertexAttribute[];
  readonly normals?: Float32Array;
  readonly uvs?: Float32Array;
  readonly uv1s?: Float32Array;
  readonly colors?: Float32Array;
  readonly indices?: Uint16Array | Uint32Array;
}

/** True when `value` is a flat packed component array rather than a tuple list. */
export function isFlatAttributeArray(value: unknown): value is Float32Array | readonly number[] {
  return value instanceof Float32Array || (Array.isArray(value) && (value.length === 0 || typeof value[0] === "number"));
}

function readVec3Attribute(value: AuraVec3Attribute | undefined, label: string): Float32Array | undefined {
  if (value === undefined) return undefined;
  if (isFlatAttributeArray(value)) {
    const flat = value instanceof Float32Array ? value : Float32Array.from(value as readonly number[]);
    if (flat.length % 3 !== 0) throw new Error(`Aura3D geometry ${label} array length must be a multiple of 3.`);
    for (const component of flat) if (!Number.isFinite(component)) throw new Error(`Aura3D geometry ${label} must contain finite values.`);
    return flat;
  }
  const flat = new Float32Array((value as readonly AuraRootVec3[]).length * 3);
  (value as readonly AuraRootVec3[]).forEach((tuple, index) => {
    validateVec3(tuple, `${label} ${index}`);
    flat[index * 3] = tuple[0];
    flat[index * 3 + 1] = tuple[1];
    flat[index * 3 + 2] = tuple[2];
  });
  for (const component of flat) if (!Number.isFinite(component)) throw new Error(`Aura3D geometry ${label} must contain finite float32 values.`);
  return flat;
}

function readVec2Attribute(value: AuraVec2Attribute | undefined, label: string): Float32Array | undefined {
  if (value === undefined) return undefined;
  if (isFlatAttributeArray(value)) {
    const flat = value instanceof Float32Array ? value : Float32Array.from(value as readonly number[]);
    if (flat.length % 2 !== 0) throw new Error(`Aura3D geometry ${label} array length must be a multiple of 2.`);
    for (const component of flat) if (!Number.isFinite(component)) throw new Error(`Aura3D geometry ${label} must contain finite values.`);
    return flat;
  }
  const flat = new Float32Array((value as readonly (readonly [number, number])[]).length * 2);
  (value as readonly (readonly [number, number])[]).forEach((tuple, index) => {
    if (tuple.length !== 2 || !Number.isFinite(tuple[0]) || !Number.isFinite(tuple[1])) throw new Error(`Aura3D geometry ${label} ${index} must be a finite vec2.`);
    flat[index * 2] = tuple[0];
    flat[index * 2 + 1] = tuple[1];
  });
  for (const component of flat) if (!Number.isFinite(component)) throw new Error(`Aura3D geometry ${label} must contain finite float32 values.`);
  return flat;
}

// Unknown top-level fields can be vertex streams. Deindexing would otherwise
// retain their old layout and merging would silently discard them.
const SUPPORTED_GEOMETRY_FIELDS: ReadonlySet<string> = new Set([
  "kind", "positions", "normals", "uvs", "uv1s", "colors", "indices", "attributes",
  "bounds", "groups", "drawRange", "morphTargets", "topology", "dynamic"
]);

function assertSupportedGeometryFields(spec: object): void {
  for (const key of Reflect.ownKeys(spec)) {
    if (!Object.prototype.propertyIsEnumerable.call(spec, key)) continue;
    if (typeof key === "string" && SUPPORTED_GEOMETRY_FIELDS.has(key)) continue;
    const field = String(key);
    throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", field, `Aura3D geometry cannot preserve unsupported top-level field "${field}".`);
  }
}

/** Normalize every SG-05 attribute shape into flat Float32/Uint arrays for the buffer path. */
export function normalizeGeometryAttributes(spec: {
  readonly positions: AuraVec3Attribute;
  readonly normals?: AuraVec3Attribute;
  readonly uvs?: AuraVec2Attribute;
  readonly uv1s?: AuraVec2Attribute;
  readonly colors?: Float32Array | readonly number[] | readonly AuraColor[];
  readonly indices?: AuraIndexAttribute;
  readonly attributes?: Readonly<Record<string, AuraCustomVertexAttributeSpec>>;
}): NormalizedGeometryAttributes {
  assertSupportedGeometryFields(spec);
  const positions = readVec3Attribute(spec.positions, "positions");
  if (!positions) throw new Error("Aura3D geometry requires positions.");
  const vertexCount = positions.length / 3;
  const normals = readVec3Attribute(spec.normals, "normals");
  if (normals && normals.length !== positions.length) throw new Error("Aura3D geometry normals must match the position count.");
  const uvs = readVec2Attribute(spec.uvs, "uvs");
  if (uvs && uvs.length !== vertexCount * 2) throw new Error("Aura3D geometry uvs must match the position count.");
  const uv1s = readVec2Attribute(spec.uv1s, "uv1s");
  if (uv1s && uv1s.length !== vertexCount * 2) throw new Error("Aura3D geometry uv1s must match the position count.");
  let colors: Float32Array | undefined;
  if (spec.colors !== undefined) {
    if (isFlatAttributeArray(spec.colors)) {
      colors = spec.colors instanceof Float32Array ? spec.colors : Float32Array.from(spec.colors as readonly number[]);
      if (colors.length !== vertexCount * 4 && colors.length !== vertexCount * 3) {
        throw new Error("Aura3D geometry colors must be 3 or 4 components per vertex.");
      }
      if (colors.length === vertexCount * 3) {
        const rgba = new Float32Array(vertexCount * 4);
        for (let i = 0; i < vertexCount; i += 1) {
          rgba[i * 4] = colors[i * 3]!;
          rgba[i * 4 + 1] = colors[i * 3 + 1]!;
          rgba[i * 4 + 2] = colors[i * 3 + 2]!;
          rgba[i * 4 + 3] = 1;
        }
        colors = rgba;
      }
    } else {
      if (spec.colors.length !== vertexCount) throw new Error("Aura3D geometry colors must match the position count.");
      colors = new Float32Array(vertexCount * 4);
      (spec.colors as readonly AuraColor[]).forEach((color, index) => {
        if (index >= vertexCount) return;
        const rgba = colorToFlatRgba(color);
        colors![index * 4] = rgba[0];
        colors![index * 4 + 1] = rgba[1];
        colors![index * 4 + 2] = rgba[2];
        colors![index * 4 + 3] = rgba[3];
      });
    }
    for (const component of colors) if (!Number.isFinite(component)) throw new Error("Aura3D geometry colors must contain finite values.");
  }
  let indices: Uint16Array | Uint32Array | undefined;
  // An empty index list means "non-indexed" (sequential 0..n-1) — e.g. the
  // edges/wireframe helpers emit line-vertex pairs with no index stream.
  if (spec.indices !== undefined && spec.indices.length > 0) {
    indices = spec.indices instanceof Uint16Array || spec.indices instanceof Uint32Array ? spec.indices : null as never;
    if (!indices) {
      const list = spec.indices as readonly number[];
      let max = 0;
      for (const [offset, value] of list.entries()) {
        if (!Number.isInteger(value) || value < 0) throw new Error("Aura3D geometry indices must be non-negative integers.");
        // Validate before converting: Uint32Array would wrap 2^32 to zero.
        if (value > 0xffffffff || value >= vertexCount) throw new Error(`Aura3D geometry index ${offset} is outside the position buffer.`);
        if (value > max) max = value;
      }
      indices = max > 65535 ? Uint32Array.from(list) : Uint16Array.from(list);
    }
    for (const [offset, value] of indices.entries()) {
      if (!Number.isInteger(value) || value < 0 || value >= vertexCount) throw new Error(`Aura3D geometry index ${offset} is outside the position buffer.`);
    }
  }
  return { positions, vertexCount, custom: normalizeCustomVertexAttributes(spec.attributes, vertexCount), normals, uvs, uv1s, colors, indices };
}

function geometryOperationError(code: string, field: string, message: string): Error {
  return Object.assign(new Error(message), { code, field });
}

/** @internal Shared validation for operations which copy geometry metadata. */
export function validateGeometryMetadata(
  spec: Pick<AuraCustomGeometrySpec, "topology" | "groups" | "drawRange" | "morphTargets" | "bounds">,
  normalized: NormalizedGeometryAttributes
): void {
  if (spec.topology !== undefined && spec.topology !== "triangles" && spec.topology !== "lines" && spec.topology !== "points") {
    throw geometryOperationError("AURA_GEOMETRY_INVALID", "topology", "Aura3D geometry topology must be triangles, lines or points.");
  }
  const available = normalized.indices?.length ?? normalized.vertexCount;
  for (const [index, group] of (spec.groups ?? []).entries()) {
    if (!Number.isSafeInteger(group.start) || group.start < 0 || !Number.isSafeInteger(group.count) || group.count < 0 || group.start + group.count > available ||
        (group.materialIndex !== undefined && (!Number.isSafeInteger(group.materialIndex) || group.materialIndex < 0))) {
      throw geometryOperationError("AURA_GEOMETRY_INVALID", `groups[${index}]`, "Aura3D geometry group must be a valid range and material index.");
    }
  }
  if (spec.drawRange && (!Number.isSafeInteger(spec.drawRange.start) || spec.drawRange.start < 0 ||
      !(spec.drawRange.count === Infinity || (Number.isSafeInteger(spec.drawRange.count) && spec.drawRange.count >= 0)))) {
    throw geometryOperationError("AURA_GEOMETRY_INVALID", "drawRange", "Aura3D geometry drawRange requires a non-negative integer start and count.");
  }
  if (spec.bounds) {
    validateVec3(spec.bounds.min, "bounds min"); validateVec3(spec.bounds.max, "bounds max");
    if (spec.bounds.min.some((value, axis) => value > spec.bounds!.max[axis]!)) {
      throw geometryOperationError("AURA_GEOMETRY_INVALID", "bounds", "Aura3D geometry bounds min exceeds max.");
    }
  }
  assertGeometryMorphChannels(spec.morphTargets, normalized.vertexCount, (code, field, message) => {
    throw geometryOperationError(code, field, message);
  });
}

function colorToFlatRgba(color: AuraColor): readonly [number, number, number, number] {
  if (typeof color === "string") {
    // Inline the hex grammar so RootGeometry stays dependency-light: #rgb/#rrggbb/#rrggbbaa.
    const hex = color.trim().replace(/^#/, "");
    const expand = (s: string) => (s.length === 3 || s.length === 4 ? s.split("").map((c) => c + c).join("") : s);
    const full = expand(hex);
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    const a = full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a];
  }
  if (Array.isArray(color)) {
    const tuple = color as readonly number[];
    return [srgbToLinear(tuple[0] ?? 0), srgbToLinear(tuple[1] ?? 0), srgbToLinear(tuple[2] ?? 0), tuple[3] ?? 1];
  }
  return [1, 1, 1, 1];
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

/** SG-05: `geometry.dynamic(spec)` — validate and tag the spec as a runtime-mutable target. */
export function defineAuraDynamicGeometry(spec: {
  readonly positions: AuraVec3Attribute;
  readonly normals?: AuraVec3Attribute;
  readonly uvs?: AuraVec2Attribute;
  readonly uv1s?: AuraVec2Attribute;
  readonly colors?: Float32Array | readonly number[] | readonly AuraColor[];
  readonly indices?: AuraIndexAttribute;
  readonly attributes?: Readonly<Record<string, AuraCustomVertexAttributeSpec>>;
  readonly topology?: "triangles" | "points";
  readonly groups?: readonly AuraGeometryGroupSpec[];
  readonly drawRange?: AuraGeometryDrawRangeSpec;
  readonly morphTargets?: readonly AuraGeometryMorphTargetSpec[];
  readonly bounds?: { readonly min: AuraRootVec3; readonly max: AuraRootVec3 };
}): AuraCustomGeometrySpec {
  if (spec.topology !== undefined && spec.topology !== "triangles" && spec.topology !== "points") {
    throw new Error(`Aura3D geometry.dynamic topology must be "triangles" or "points", got ${String(spec.topology)}.`);
  }
  const normalized = normalizeGeometryAttributes(spec);
  validateGeometryMetadata(spec, normalized);
  if (normalized.vertexCount === 0) throw new Error("Aura3D dynamic geometry requires at least one vertex.");
  const indexCount = normalized.indices?.length ?? normalized.vertexCount;
  if (indexCount === 0) throw new Error("Aura3D dynamic geometry requires at least one index or vertex.");
  if (spec.topology !== "points" && indexCount % 3 !== 0) throw geometryOperationError("AURA_GEOMETRY_INVALID", "topology", "Aura3D dynamic geometry requires complete triangles.");
  return {
    kind: "aura-custom-geometry",
    positions: normalized.positions,
    ...(spec.normals !== undefined ? { normals: normalized.normals! } : {}),
    ...(spec.uvs !== undefined ? { uvs: normalized.uvs! } : {}),
    ...(spec.uv1s !== undefined ? { uv1s: normalized.uv1s! } : {}),
    ...(spec.colors !== undefined ? { colors: normalized.colors! } : {}),
    indices: normalized.indices ?? (normalized.vertexCount > 65536
      ? Uint32Array.from({ length: normalized.vertexCount }, (_, i) => i)
      : Uint16Array.from({ length: normalized.vertexCount }, (_, i) => i)),
    ...(spec.attributes ? { attributes: cloneCustomAttributes(spec.attributes) } : {}),
    ...(spec.topology === "points" ? { topology: "points" as const } : {}),
    ...(spec.groups ? { groups: [...spec.groups] } : {}),
    ...(spec.drawRange ? { drawRange: { ...spec.drawRange } } : {}),
    ...(spec.morphTargets ? { morphTargets: spec.morphTargets.map((target) => ({ ...target })) } : {}),
    ...(spec.bounds ? { bounds: { min: [...spec.bounds.min] as AuraRootVec3, max: [...spec.bounds.max] as AuraRootVec3 } } : {}),
    dynamic: true
  };
}

// ── SG-05 helpers: three's BufferGeometryUtils equivalents (L2-05) ───────────

/** Area-weighted vertex normals for indexed triangles, or face normals for triangle lists. */
export function computeAuraGeometryNormals(spec: { readonly positions: AuraVec3Attribute; readonly indices?: AuraIndexAttribute; readonly topology?: AuraCustomGeometrySpec["topology"] }): Float32Array {
  if (spec.topology !== undefined && spec.topology !== "triangles") {
    throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", "topology", "Computing normals requires triangle topology.");
  }
  const normalized = normalizeGeometryAttributes(spec);
  const positions = normalized.positions;
  const count = normalized.vertexCount;
  const indices = normalized.indices;
  if ((indices?.length ?? count) % 3 !== 0) throw geometryOperationError("AURA_GEOMETRY_INVALID", "topology", "Computing normals requires complete triangles.");
  const normals = new Float32Array(positions.length);
  const faceNormal = (ia: number, ib: number, ic: number): readonly [number, number, number] => {
    const cbx = positions[ic * 3]! - positions[ib * 3]!;
    const cby = positions[ic * 3 + 1]! - positions[ib * 3 + 1]!;
    const cbz = positions[ic * 3 + 2]! - positions[ib * 3 + 2]!;
    const abx = positions[ia * 3]! - positions[ib * 3]!;
    const aby = positions[ia * 3 + 1]! - positions[ib * 3 + 1]!;
    const abz = positions[ia * 3 + 2]! - positions[ib * 3 + 2]!;
    return [cby * abz - cbz * aby, cbz * abx - cbx * abz, cbx * aby - cby * abx];
  };
  if (indices) {
    // Accumulate in double precision so large but finite float positions do
    // not overflow before the final unit vector is stored in Float32Array.
    const accumulated = new Float64Array(positions.length);
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const ia = indices[i]!;
      const ib = indices[i + 1]!;
      const ic = indices[i + 2]!;
      const n = faceNormal(ia, ib, ic);
      for (const v of [ia, ib, ic]) {
        accumulated[v * 3] = accumulated[v * 3]! + n[0];
        accumulated[v * 3 + 1] = accumulated[v * 3 + 1]! + n[1];
        accumulated[v * 3 + 2] = accumulated[v * 3 + 2]! + n[2];
      }
    }
    for (let i = 0; i < count; i += 1) {
      const len = Math.hypot(accumulated[i * 3]!, accumulated[i * 3 + 1]!, accumulated[i * 3 + 2]!);
      if (len > 0) {
        normals[i * 3] = accumulated[i * 3]! / len;
        normals[i * 3 + 1] = accumulated[i * 3 + 1]! / len;
        normals[i * 3 + 2] = accumulated[i * 3 + 2]! / len;
      }
    }
  } else {
    for (let i = 0; i < count; i += 3) {
      const n = faceNormal(i, i + 1, i + 2);
      const len = Math.hypot(...n) || 1;
      for (const v of [i, i + 1, i + 2]) {
        normals[v * 3] = n[0] / len;
        normals[v * 3 + 1] = n[1] / len;
        normals[v * 3 + 2] = n[2] / len;
      }
    }
  }
  return normals;
}

/** three's `BufferGeometry.computeBoundingBox` — finite min/max over positions. */
export function computeAuraGeometryBounds(spec: { readonly positions: AuraVec3Attribute }): { readonly min: AuraRootVec3; readonly max: AuraRootVec3 } {
  const positions = readVec3Attribute(spec.positions, "positions")!;
  if (positions.length === 0) throw geometryOperationError("AURA_GEOMETRY_INVALID", "positions", "Computing bounds requires non-empty positions.");
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const v = positions[i + axis]!;
      if (v < min[axis]!) min[axis] = v;
      if (v > max[axis]!) max[axis] = v;
    }
  }
  return { min, max };
}

/** Apply an affine column-major matrix, transforming normals by its inverse transpose. */
export function applyAuraGeometryMatrix4(spec: AuraCustomGeometrySpec, matrix: readonly number[]): AuraCustomGeometrySpec {
  if (matrix.length !== 16 || ![...matrix].every(Number.isFinite)) {
    throw geometryOperationError("AURA_GEOMETRY_INVALID_MATRIX", "matrix", "applyAuraGeometryMatrix4 requires a finite mat4.");
  }
  if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) {
    throw geometryOperationError("AURA_GEOMETRY_INVALID_MATRIX", "matrix", "applyAuraGeometryMatrix4 requires an affine matrix.");
  }
  const normalized = normalizeGeometryAttributes(spec);
  validateGeometryMetadata(spec, normalized);
  for (const [index, target] of (spec.morphTargets ?? []).entries()) {
    if (target.normals !== undefined && !normalized.normals) {
      throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", `morphTargets[${index}].normals`, "Transforming morph normal deltas requires authored base normals.");
    }
    if (target.tangents !== undefined) {
      throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", `morphTargets[${index}].tangents`, "Transforming morph tangent deltas requires a base tangent stream.");
    }
  }
  const a00 = matrix[0]!, a01 = matrix[4]!, a02 = matrix[8]!;
  const a10 = matrix[1]!, a11 = matrix[5]!, a12 = matrix[9]!;
  const a20 = matrix[2]!, a21 = matrix[6]!, a22 = matrix[10]!;
  const c00 = a11 * a22 - a12 * a21, c01 = a12 * a20 - a10 * a22, c02 = a10 * a21 - a11 * a20;
  const c10 = a02 * a21 - a01 * a22, c11 = a00 * a22 - a02 * a20, c12 = a01 * a20 - a00 * a21;
  const c20 = a01 * a12 - a02 * a11, c21 = a02 * a10 - a00 * a12, c22 = a00 * a11 - a01 * a10;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  if (normalized.normals && (!Number.isFinite(det) || det === 0)) {
    throw geometryOperationError("AURA_GEOMETRY_SINGULAR_MATRIX", "matrix", "Cannot transform normals with a singular matrix.");
  }
  const transformPositions = (source: ArrayLike<number>, translate: boolean): Float32Array => {
    const result = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 3) {
      const x = source[i]!, y = source[i + 1]!, z = source[i + 2]!;
      result[i] = a00 * x + a01 * y + a02 * z + (translate ? matrix[12]! : 0);
      result[i + 1] = a10 * x + a11 * y + a12 * z + (translate ? matrix[13]! : 0);
      result[i + 2] = a20 * x + a21 * y + a22 * z + (translate ? matrix[14]! : 0);
      if (!Number.isFinite(result[i]) || !Number.isFinite(result[i + 1]) || !Number.isFinite(result[i + 2])) {
        throw geometryOperationError("AURA_GEOMETRY_INVALID_MATRIX", "matrix", "Geometry transform produced a non-finite position.");
      }
    }
    return result;
  };
  const positions = transformPositions(normalized.positions, true);
  let bounds: AuraCustomGeometrySpec["bounds"];
  if (spec.bounds) {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const include = (x: number, y: number, z: number): void => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw geometryOperationError("AURA_GEOMETRY_INVALID_MATRIX", "matrix", "Geometry transform produced non-finite bounds.");
      min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
    };
    for (let corner = 0; corner < 8; corner += 1) {
      const x = (corner & 1) ? spec.bounds.max[0] : spec.bounds.min[0];
      const y = (corner & 2) ? spec.bounds.max[1] : spec.bounds.min[1];
      const z = (corner & 4) ? spec.bounds.max[2] : spec.bounds.min[2];
      include(a00 * x + a01 * y + a02 * z + matrix[12]!, a10 * x + a11 * y + a12 * z + matrix[13]!, a20 * x + a21 * y + a22 * z + matrix[14]!);
    }
    for (let i = 0; i < positions.length; i += 3) include(positions[i]!, positions[i + 1]!, positions[i + 2]!);
    bounds = { min, max };
  }
  let normals: Float32Array | undefined;
  let transformedNormalLengths: Float64Array | undefined;
  if (normalized.normals) {
    normals = new Float32Array(normalized.normals.length);
    transformedNormalLengths = new Float64Array(normalized.vertexCount);
    for (let i = 0; i < normals.length; i += 3) {
      const x = normalized.normals[i]!, y = normalized.normals[i + 1]!, z = normalized.normals[i + 2]!;
      const nx = (c00 * x + c01 * y + c02 * z) / det;
      const ny = (c10 * x + c11 * y + c12 * z) / det;
      const nz = (c20 * x + c21 * y + c22 * z) / det;
      if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) {
        throw geometryOperationError("AURA_GEOMETRY_INVALID_MATRIX", "matrix", "Geometry transform produced a non-finite normal.");
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      transformedNormalLengths[i / 3] = len;
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }
  const transformMorphNormals = (source: ArrayLike<number>): Float32Array => {
    const result = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 3) {
      const x = source[i]!, y = source[i + 1]!, z = source[i + 2]!;
      // The base normal was normalized after applying the inverse transpose.
      // Divide each delta by the same base length so normalizing base + w*d
      // remains equivalent for every morph weight w.
      const baseLength = transformedNormalLengths![i / 3]!;
      result[i] = ((c00 * x + c01 * y + c02 * z) / det) / baseLength;
      result[i + 1] = ((c10 * x + c11 * y + c12 * z) / det) / baseLength;
      result[i + 2] = ((c20 * x + c21 * y + c22 * z) / det) / baseLength;
      if (!Number.isFinite(result[i]) || !Number.isFinite(result[i + 1]) || !Number.isFinite(result[i + 2])) {
        throw geometryOperationError("AURA_GEOMETRY_INVALID_MATRIX", "matrix", "Geometry transform produced a non-finite morph normal delta.");
      }
    }
    return result;
  };
  return {
    ...spec,
    positions,
    ...(normals ? { normals } : {}),
    ...(spec.morphTargets ? { morphTargets: spec.morphTargets.map((target) => ({
      ...target,
      positions: transformPositions(target.positions, false),
      ...(target.normals !== undefined ? { normals: transformMorphNormals(target.normals) } : {})
    })) } : {}),
    bounds
  };
}

/** Allocate a packed custom stream without losing the component representation. */
function allocateCustomData(source: AuraCustomVertexAttributeData, length: number): Exclude<AuraCustomVertexAttributeData, readonly number[]> | number[] {
  if (source instanceof Int8Array) return new Int8Array(length);
  if (source instanceof Uint8Array) return new Uint8Array(length);
  if (source instanceof Int16Array) return new Int16Array(length);
  if (source instanceof Uint16Array) return new Uint16Array(length);
  if (source instanceof Int32Array) return new Int32Array(length);
  if (source instanceof Uint32Array) return new Uint32Array(length);
  if (source instanceof Float32Array) return new Float32Array(length);
  return new Array<number>(length).fill(0);
}

function copyCustomVertex(source: AuraCustomVertexAttributeSpec, index: number, target: Exclude<AuraCustomVertexAttributeData, readonly number[]> | number[], destination: number): void {
  const stride = source.stride ?? source.itemSize;
  const offset = source.offset ?? 0;
  for (let component = 0; component < source.itemSize; component += 1) {
    target[destination * source.itemSize + component] = source.data[index * stride + offset + component]!;
  }
}

/** Expand every indexed vertex stream, retaining stream order and draw metadata. */
export function auraGeometryToNonIndexed(spec: AuraCustomGeometrySpec): AuraCustomGeometrySpec {
  const normalized = normalizeGeometryAttributes(spec);
  validateGeometryMetadata(spec, normalized);
  const indices = normalized.indices;
  const primitiveSize = spec.topology === "points" ? 1 : spec.topology === "lines" ? 2 : 3;
  if ((indices?.length ?? normalized.vertexCount) % primitiveSize !== 0) {
    throw geometryOperationError("AURA_GEOMETRY_INVALID", "topology", "Deindexing requires complete primitives.");
  }
  if (!indices) return spec;
  const expand = (source: ArrayLike<number> | undefined, components: number): Float32Array | undefined => {
    if (!source) return undefined;
    const out = new Float32Array(indices.length * components);
    for (let i = 0; i < indices.length; i += 1) {
      const v = indices[i]!;
      for (let c = 0; c < components; c += 1) out[i * components + c] = source[v * components + c]!;
    }
    return out;
  };
  const attributes = spec.attributes && Object.fromEntries(Object.entries(spec.attributes).map(([name, entry]) => {
    const data = allocateCustomData(entry.data, indices.length * entry.itemSize);
    for (let i = 0; i < indices.length; i += 1) copyCustomVertex(entry, indices[i]!, data, i);
    return [name, { itemSize: entry.itemSize, data, ...(entry.normalized !== undefined ? { normalized: entry.normalized } : {}) }];
  }));
  return {
    ...spec,
    positions: expand(normalized.positions, 3)!,
    ...(normalized.normals ? { normals: expand(normalized.normals, 3)! } : {}),
    ...(normalized.uvs ? { uvs: expand(normalized.uvs, 2)! } : {}),
    ...(normalized.uv1s ? { uv1s: expand(normalized.uv1s, 2)! } : {}),
    ...(normalized.colors ? { colors: expand(normalized.colors, 4)! } : {}),
    ...(attributes ? { attributes } : {}),
    ...(spec.morphTargets ? { morphTargets: spec.morphTargets.map((target) => ({
      ...target,
      positions: expand(target.positions, 3)!,
      ...(target.normals !== undefined ? { normals: expand(target.normals, 3)! } : {}),
      ...(target.tangents !== undefined ? { tangents: expand(target.tangents, 3)! } : {})
    })) } : {}),
    indices: []
  };
}

/** Merge compatible geometry streams without silently losing attributes or draw metadata. */
export function mergeAuraGeometries(specs: readonly AuraCustomGeometrySpec[]): AuraCustomGeometrySpec {
  if (specs.length === 0) throw new Error("mergeAuraGeometries requires at least one geometry spec.");
  const normalized = specs.map((spec) => normalizeGeometryAttributes(spec));
  specs.forEach((spec, index) => validateGeometryMetadata(spec, normalized[index]!));
  const first = normalized[0]!;
  const topology = specs[0]!.topology ?? "triangles";
  const customNames = first.custom.map((entry) => entry.name);
  const targetCount = specs[0]!.morphTargets?.length ?? 0;
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index]!;
    const entry = normalized[index]!;
    if (entry.vertexCount === 0) throw geometryOperationError("AURA_GEOMETRY_INVALID", "positions", "mergeAuraGeometries requires non-empty geometry.");
    if ((spec.topology ?? "triangles") !== topology) throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", "topology", "mergeAuraGeometries requires matching topology.");
    const primitiveSize = topology === "triangles" ? 3 : topology === "lines" ? 2 : 1;
    if ((entry.indices?.length ?? entry.vertexCount) % primitiveSize !== 0) throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", "topology", "mergeAuraGeometries requires complete primitives in each source.");
    for (const key of ["normals", "uvs", "uv1s", "colors"] as const) {
      if ((entry[key] !== undefined) !== (first[key] !== undefined)) throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", key, `mergeAuraGeometries requires every geometry to carry the same ${key} attribute.`);
    }
    if (entry.custom.length !== customNames.length || entry.custom.some((attribute, i) => attribute.name !== customNames[i] || attribute.itemSize !== first.custom[i]!.itemSize)) {
      throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", "attributes", "mergeAuraGeometries requires every geometry to carry the same custom vertex attributes (names and itemSize).");
    }
    for (const name of customNames) {
      const a = specs[0]!.attributes![name]!, b = spec.attributes![name]!;
      if (a.data.constructor !== b.data.constructor || Boolean(a.normalized) !== Boolean(b.normalized)) {
        throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", `attributes.${name}`, "mergeAuraGeometries requires matching custom attribute component types and normalization.");
      }
    }
    if ((spec.morphTargets?.length ?? 0) !== targetCount || spec.morphTargets?.some((target, i) => target.name !== specs[0]!.morphTargets![i]!.name)) {
      throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", "morphTargets", "mergeAuraGeometries requires matching morph target counts and names.");
    }
    for (let target = 0; target < targetCount; target += 1) {
      for (const key of ["normals", "tangents"] as const) {
        if ((spec.morphTargets![target]![key] !== undefined) !== (specs[0]!.morphTargets![target]![key] !== undefined)) {
          throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", `morphTargets[${target}].${key}`, `mergeAuraGeometries requires matching morph ${key} channels.`);
        }
      }
    }
  }
  const totalVertices = normalized.reduce((sum, entry) => sum + entry.vertexCount, 0);
  const positions = new Float32Array(totalVertices * 3);
  const normals = first.normals ? new Float32Array(totalVertices * 3) : undefined;
  const uvs = first.uvs ? new Float32Array(totalVertices * 2) : undefined;
  const uv1s = first.uv1s ? new Float32Array(totalVertices * 2) : undefined;
  const colors = first.colors ? new Float32Array(totalVertices * 4) : undefined;
  const attributes: Record<string, AuraCustomVertexAttributeSpec> = {};
  for (const name of customNames) {
    const entry = specs[0]!.attributes![name]!;
    attributes[name] = { itemSize: entry.itemSize, data: allocateCustomData(entry.data, totalVertices * entry.itemSize), ...(entry.normalized !== undefined ? { normalized: entry.normalized } : {}) };
  }
  const morphTargets = specs[0]!.morphTargets?.map((target) => ({
    ...(target.name !== undefined ? { name: target.name } : {}),
    positions: new Float32Array(totalVertices * 3),
    ...(target.normals !== undefined ? { normals: new Float32Array(totalVertices * 3) } : {}),
    ...(target.tangents !== undefined ? { tangents: new Float32Array(totalVertices * 3) } : {})
  }));
  const withIndex = normalized.some((entry) => entry.indices !== undefined);
  const indices: number[] = [];
  const groups: AuraGeometryGroupSpec[] = [];
  const intervals: { start: number; end: number }[] = [];
  const includeGroups = withIndex || specs.some((spec) => (spec.groups?.length ?? 0) > 0);
  let vertexCursor = 0, drawCursor = 0;
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index]!, entry = normalized[index]!;
    positions.set(entry.positions, vertexCursor * 3);
    if (normals) normals.set(entry.normals!, vertexCursor * 3);
    if (uvs) uvs.set(entry.uvs!, vertexCursor * 2);
    if (uv1s) uv1s.set(entry.uv1s!, vertexCursor * 2);
    if (colors) colors.set(entry.colors!, vertexCursor * 4);
    for (const name of customNames) for (let v = 0; v < entry.vertexCount; v += 1) {
      copyCustomVertex(spec.attributes![name]!, v, attributes[name]!.data as Exclude<AuraCustomVertexAttributeData, readonly number[]> | number[], vertexCursor + v);
    }
    for (let target = 0; target < targetCount; target += 1) {
      const destination = morphTargets![target]!, source = spec.morphTargets![target]!;
      destination.positions.set(source.positions, vertexCursor * 3);
      if (destination.normals) destination.normals.set(source.normals!, vertexCursor * 3);
      if (destination.tangents) destination.tangents.set(source.tangents!, vertexCursor * 3);
    }
    const count = entry.indices?.length ?? entry.vertexCount;
    if (withIndex) {
      if (entry.indices) for (const value of entry.indices) indices.push(value + vertexCursor);
      else for (let i = 0; i < entry.vertexCount; i += 1) indices.push(i + vertexCursor);
    }
    if (includeGroups) {
      if (spec.groups?.length) for (const group of spec.groups) groups.push({ ...group, start: drawCursor + group.start });
      else groups.push({ start: drawCursor, count });
    }
    const start = Math.min(count, spec.drawRange?.start ?? 0);
    const end = Math.min(count, start + (spec.drawRange?.count ?? count));
    if (end > start) intervals.push({ start: drawCursor + start, end: drawCursor + end });
    vertexCursor += entry.vertexCount;
    drawCursor += count;
  }
  for (let i = 1; i < intervals.length; i += 1) {
    if (intervals[i]!.start !== intervals[i - 1]!.end) throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", "drawRange", "mergeAuraGeometries cannot represent disjoint draw ranges as one drawRange.");
    const primitiveSize = topology === "triangles" ? 3 : topology === "lines" ? 2 : 1;
    if ((intervals[i - 1]!.end - intervals[i - 1]!.start) % primitiveSize !== 0) {
      throw geometryOperationError("AURA_GEOMETRY_INCOMPATIBLE", "drawRange", "mergeAuraGeometries cannot join draw ranges across an incomplete primitive.");
    }
  }
  const drawRange = specs.some((spec) => spec.drawRange !== undefined)
    ? { start: intervals[0]?.start ?? 0, count: intervals.length ? intervals[intervals.length - 1]!.end - intervals[0]!.start : 0 }
    : undefined;
  let bounds: AuraCustomGeometrySpec["bounds"];
  if (specs.some((spec) => spec.bounds !== undefined)) {
    const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < specs.length; i += 1) {
      const positionBounds = computeAuraGeometryBounds({ positions: normalized[i]!.positions });
      const authoredBounds = specs[i]!.bounds;
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, positionBounds.min[axis]!, authoredBounds?.min[axis] ?? Infinity);
        max[axis] = Math.max(max[axis]!, positionBounds.max[axis]!, authoredBounds?.max[axis] ?? -Infinity);
      }
    }
    bounds = { min, max };
  }
  return {
    kind: "aura-custom-geometry", positions,
    ...(normals ? { normals } : {}), ...(uvs ? { uvs } : {}), ...(uv1s ? { uv1s } : {}), ...(colors ? { colors } : {}),
    ...(customNames.length ? { attributes } : {}),
    indices: withIndex ? (totalVertices > 65536 ? Uint32Array.from(indices) : Uint16Array.from(indices)) : [],
    ...(includeGroups ? { groups } : {}), ...(drawRange ? { drawRange } : {}), ...(morphTargets ? { morphTargets } : {}),
    ...(topology !== "triangles" ? { topology } : {}), ...(specs.some((spec) => spec.dynamic) ? { dynamic: true } : {}), ...(bounds ? { bounds } : {})
  };
}

/** Build depth-bearing triangle geometry; this is not a DOM label or canvas texture. */
export function createAuraText3DGeometry(text: string, options: AuraText3DOptions = {}): AuraText3DGeometry {
  if (!text.length) throw new Error("Aura3D 3D text requires at least one character.");
  const size = positive(options.size, 1, "size");
  const depth = positive(options.depth, size * 0.16, "depth");
  const spacing = nonNegative(options.letterSpacing, size * 0.14, "letterSpacing");
  const cell = size / 7;
  const positions: AuraRootVec3[] = [];
  const normals: AuraRootVec3[] = [];
  const indices: number[] = [];
  const unsupported = new Set<string>();
  let cursor = 0;
  let glyphCount = 0;
  for (const rawCharacter of text.toUpperCase()) {
    if (rawCharacter === " ") { cursor += size * 0.5 + spacing; continue; }
    const rows = GLYPHS[rawCharacter];
    if (!rows) { unsupported.add(rawCharacter); cursor += size * 0.5 + spacing; continue; }
    glyphCount += 1;
    for (let row = 0; row < 7; row += 1) for (let column = 0; column < 5; column += 1) {
      if (rows[row]?.[column] !== "1") continue;
      appendBox(positions, normals, indices, cursor + column * cell, (6 - row) * cell, 0, cell * 0.92, cell * 0.92, depth);
    }
    cursor += cell * 5 + spacing;
  }
  if (glyphCount === 0) throw new Error("Aura3D 3D text contains no supported glyphs.");
  return {
    geometry: defineAuraCustomGeometry({ positions, normals, indices }),
    text,
    glyphCount,
    unsupportedCharacters: [...unsupported],
    method: "extruded-bitmap-glyph-mesh"
  };
}

function firstLevelForDistance(distance: number, levels: readonly AuraRootLodThreshold[]): number {
  const found = levels.findIndex((level) => level.maxDistance === undefined || distance <= level.maxDistance);
  return found === -1 ? levels.length - 1 : found;
}
function validateLodLevels(levels: readonly AuraRootLodThreshold[]): void {
  let previous = -Infinity;
  levels.forEach((level, index) => {
    if (level.maxDistance === undefined) {
      if (index !== levels.length - 1) throw new Error("Only the final Aura3D LOD level may omit maxDistance.");
      return;
    }
    if (!Number.isFinite(level.maxDistance) || level.maxDistance < 0 || level.maxDistance <= previous) throw new Error("Aura3D LOD maxDistance values must be finite, non-negative, and strictly increasing.");
    previous = level.maxDistance;
  });
}
function validateVec3(value: readonly number[], label: string): void { if (value.length !== 3 || value.some((entry) => !Number.isFinite(entry))) throw new Error(`Aura3D custom geometry ${label} must be a finite vec3.`); }
function positive(value: number | undefined, fallback: number, label: string): number { const resolved = value ?? fallback; if (!Number.isFinite(resolved) || resolved <= 0) throw new Error(`Aura3D 3D text ${label} must be positive.`); return resolved; }
function nonNegative(value: number | undefined, fallback: number, label: string): number { const resolved = value ?? fallback; if (!Number.isFinite(resolved) || resolved < 0) throw new Error(`Aura3D 3D text ${label} must be non-negative.`); return resolved; }

function appendBox(positions: AuraRootVec3[], normals: AuraRootVec3[], indices: number[], x: number, y: number, z: number, width: number, height: number, depth: number): void {
  const min = [x, y, z - depth / 2] as const;
  const max = [x + width, y + height, z + depth / 2] as const;
  const faces = [
    { n: [0, 0, 1] as const, v: [[min[0], min[1], max[2]], [max[0], min[1], max[2]], [max[0], max[1], max[2]], [min[0], max[1], max[2]]] },
    { n: [0, 0, -1] as const, v: [[max[0], min[1], min[2]], [min[0], min[1], min[2]], [min[0], max[1], min[2]], [max[0], max[1], min[2]]] },
    { n: [-1, 0, 0] as const, v: [[min[0], min[1], min[2]], [min[0], min[1], max[2]], [min[0], max[1], max[2]], [min[0], max[1], min[2]]] },
    { n: [1, 0, 0] as const, v: [[max[0], min[1], max[2]], [max[0], min[1], min[2]], [max[0], max[1], min[2]], [max[0], max[1], max[2]]] },
    { n: [0, 1, 0] as const, v: [[min[0], max[1], max[2]], [max[0], max[1], max[2]], [max[0], max[1], min[2]], [min[0], max[1], min[2]]] },
    { n: [0, -1, 0] as const, v: [[min[0], min[1], min[2]], [max[0], min[1], min[2]], [max[0], min[1], max[2]], [min[0], min[1], max[2]]] }
  ];
  for (const face of faces) {
    const base = positions.length;
    for (const vertex of face.v) positions.push([vertex[0]!, vertex[1]!, vertex[2]!]);
    normals.push(face.n, face.n, face.n, face.n);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A:["01110","10001","10001","11111","10001","10001","10001"], B:["11110","10001","10001","11110","10001","10001","11110"], C:["01111","10000","10000","10000","10000","10000","01111"], D:["11110","10001","10001","10001","10001","10001","11110"], E:["11111","10000","10000","11110","10000","10000","11111"], F:["11111","10000","10000","11110","10000","10000","10000"], G:["01111","10000","10000","10111","10001","10001","01111"], H:["10001","10001","10001","11111","10001","10001","10001"], I:["11111","00100","00100","00100","00100","00100","11111"], J:["00111","00010","00010","00010","10010","10010","01100"], K:["10001","10010","10100","11000","10100","10010","10001"], L:["10000","10000","10000","10000","10000","10000","11111"], M:["10001","11011","10101","10101","10001","10001","10001"], N:["10001","11001","10101","10011","10001","10001","10001"], O:["01110","10001","10001","10001","10001","10001","01110"], P:["11110","10001","10001","11110","10000","10000","10000"], Q:["01110","10001","10001","10001","10101","10010","01101"], R:["11110","10001","10001","11110","10100","10010","10001"], S:["01111","10000","10000","01110","00001","00001","11110"], T:["11111","00100","00100","00100","00100","00100","00100"], U:["10001","10001","10001","10001","10001","10001","01110"], V:["10001","10001","10001","10001","10001","01010","00100"], W:["10001","10001","10001","10101","10101","11011","10001"], X:["10001","10001","01010","00100","01010","10001","10001"], Y:["10001","10001","01010","00100","00100","00100","00100"], Z:["11111","00001","00010","00100","01000","10000","11111"],
  "0":["01110","10001","10011","10101","11001","10001","01110"], "1":["00100","01100","00100","00100","00100","00100","01110"], "2":["01110","10001","00001","00010","00100","01000","11111"], "3":["11110","00001","00001","01110","00001","00001","11110"], "4":["00010","00110","01010","10010","11111","00010","00010"], "5":["11111","10000","10000","11110","00001","00001","11110"], "6":["01110","10000","10000","11110","10001","10001","01110"], "7":["11111","00001","00010","00100","01000","01000","01000"], "8":["01110","10001","10001","01110","10001","10001","01110"], "9":["01110","10001","10001","01111","00001","00001","01110"], "-":["00000","00000","00000","11111","00000","00000","00000"], ".":["00000","00000","00000","00000","00000","01100","01100"]
};
