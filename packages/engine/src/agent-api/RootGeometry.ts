import type { SdfTextStyle } from "@aura3d/rendering";
import type { AuraColor } from "./nodes/types.js";
import { geometry } from "./nodes/geometry.js";

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
}

/**
 * R-23: one author-named per-vertex attribute (three's `setAttribute(name, new
 * BufferAttribute(array, itemSize))`). `data.length` must equal
 * `vertexCount * itemSize`; the vertex shader reads it as `in <type> <name>;`.
 */
export interface AuraCustomVertexAttributeSpec {
  readonly itemSize: 1 | 2 | 3 | 4;
  readonly data: Float32Array | readonly number[];
}

export interface AuraCustomGeometrySpec {
  readonly kind: "aura-custom-geometry";
  readonly positions: AuraVec3Attribute;
  readonly normals?: AuraVec3Attribute;
  /** Optional UVs (one per position) — the decal batch path samples pages with them. */
  readonly uvs?: AuraVec2Attribute;
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
  /** SG-05: authored morph-target position arrays (absolute or delta per the morph pipeline). */
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
    ...(spec.colors ? { colors: spec.colors } : {}),
    indices: spec.indices,
    ...(normalized.custom.length > 0 ? { attributes: customAttributesRecord(normalized.custom) } : {}),
    ...(spec.groups ? { groups: [...spec.groups] } : {}),
    ...(spec.drawRange ? { drawRange: { ...spec.drawRange } } : {}),
    ...(spec.morphTargets ? { morphTargets: spec.morphTargets.map((target) => ({ ...target })) } : {}),
    ...(spec.topology ? { topology: spec.topology } : {}),
    ...(spec.dynamic === true ? { dynamic: true } : {}),
    ...(spec.bounds ? { bounds: { min: [...spec.bounds.min] as AuraRootVec3, max: [...spec.bounds.max] as AuraRootVec3 } } : {})
  };
}

function customAttributesRecord(custom: readonly NormalizedCustomVertexAttribute[]): Readonly<Record<string, AuraCustomVertexAttributeSpec>> {
  return Object.fromEntries(custom.map((entry) => [entry.name, { itemSize: entry.itemSize, data: entry.data }]));
}

// ── SG-05 (threejs-parity L2): dynamic geometry + BufferGeometryUtils ────────

export interface NormalizedCustomVertexAttribute {
  readonly name: string;
  readonly itemSize: 1 | 2 | 3 | 4;
  readonly data: Float32Array;
}

/** R-23: names a custom attribute may not take — engine semantics, their updateAttribute aliases, and the `a_` engine prefix. */
const RESERVED_CUSTOM_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
  "position", "positions", "normal", "normals", "uv", "uv0", "uvs", "uv1", "color", "colors", "tangent", "tangents",
  "joints", "weights", "joints1", "weights1", "lineStart", "lineEnd", "lineCorner", "lineDistance", "index",
  "instanceMatrix", "instanceColor"
]);
export const MAX_CUSTOM_VERTEX_ATTRIBUTES = 11;

export function assertCustomAttributeName(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Aura3D custom vertex attribute name "${name}" must be a GLSL identifier ([A-Za-z_][A-Za-z0-9_]*).`);
  if (name.startsWith("gl_") || name.includes("__")) throw new Error(`Aura3D custom vertex attribute name "${name}" is reserved by GLSL (gl_ prefix or double underscore).`);
  if (name.startsWith("a_") || name.startsWith("u_")) throw new Error(`Aura3D custom vertex attribute name "${name}" uses a prefix reserved for engine attributes/uniforms (a_, u_).`);
  if (RESERVED_CUSTOM_ATTRIBUTE_NAMES.has(name)) throw new Error(`Aura3D custom vertex attribute name "${name}" collides with a built-in vertex semantic.`);
}

/** R-23: validate and flatten `spec.attributes`; entries come back sorted by name (the stable location order). */
export function normalizeCustomVertexAttributes(
  attributes: Readonly<Record<string, AuraCustomVertexAttributeSpec>> | undefined,
  vertexCount: number
): readonly NormalizedCustomVertexAttribute[] {
  if (attributes === undefined) return [];
  const names = Object.keys(attributes).sort();
  if (names.length > MAX_CUSTOM_VERTEX_ATTRIBUTES) {
    throw new Error(`Aura3D geometry supports at most ${MAX_CUSTOM_VERTEX_ATTRIBUTES} custom vertex attributes, got ${names.length}.`);
  }
  return names.map((name) => {
    assertCustomAttributeName(name);
    const entry = attributes[name]!;
    const itemSize = entry?.itemSize;
    if (itemSize !== 1 && itemSize !== 2 && itemSize !== 3 && itemSize !== 4) throw new Error(`Aura3D custom vertex attribute "${name}" itemSize must be 1, 2, 3 or 4.`);
    const raw = entry.data;
    if (!(raw instanceof Float32Array) && !Array.isArray(raw)) throw new Error(`Aura3D custom vertex attribute "${name}" data must be a Float32Array or number[].`);
    const data = raw instanceof Float32Array ? raw : Float32Array.from(raw as readonly number[]);
    if (data.length !== vertexCount * itemSize) {
      throw new Error(`Aura3D custom vertex attribute "${name}" has ${data.length} values; expected ${vertexCount} vertices x ${itemSize} = ${vertexCount * itemSize}.`);
    }
    for (let i = 0; i < data.length; i += 1) {
      if (!Number.isFinite(data[i])) throw new Error(`Aura3D custom vertex attribute "${name}" value ${i} must be finite.`);
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
    return flat;
  }
  const flat = new Float32Array((value as readonly AuraRootVec3[]).length * 3);
  (value as readonly AuraRootVec3[]).forEach((tuple, index) => {
    validateVec3(tuple, `${label} ${index}`);
    flat[index * 3] = tuple[0];
    flat[index * 3 + 1] = tuple[1];
    flat[index * 3 + 2] = tuple[2];
  });
  return flat;
}

function readVec2Attribute(value: AuraVec2Attribute | undefined, label: string): Float32Array | undefined {
  if (value === undefined) return undefined;
  if (isFlatAttributeArray(value)) {
    const flat = value instanceof Float32Array ? value : Float32Array.from(value as readonly number[]);
    if (flat.length % 2 !== 0) throw new Error(`Aura3D geometry ${label} array length must be a multiple of 2.`);
    return flat;
  }
  const flat = new Float32Array((value as readonly (readonly [number, number])[]).length * 2);
  (value as readonly (readonly [number, number])[]).forEach((tuple, index) => {
    if (tuple.length !== 2 || !Number.isFinite(tuple[0]) || !Number.isFinite(tuple[1])) throw new Error(`Aura3D geometry ${label} ${index} must be a finite vec2.`);
    flat[index * 2] = tuple[0];
    flat[index * 2 + 1] = tuple[1];
  });
  return flat;
}

/** Normalize every SG-05 attribute shape into flat Float32/Uint arrays for the buffer path. */
export function normalizeGeometryAttributes(spec: {
  readonly positions: AuraVec3Attribute;
  readonly normals?: AuraVec3Attribute;
  readonly uvs?: AuraVec2Attribute;
  readonly colors?: Float32Array | readonly number[] | readonly AuraColor[];
  readonly indices?: AuraIndexAttribute;
  readonly attributes?: Readonly<Record<string, AuraCustomVertexAttributeSpec>>;
}): NormalizedGeometryAttributes {
  const positions = readVec3Attribute(spec.positions, "positions");
  if (!positions) throw new Error("Aura3D geometry requires positions.");
  const vertexCount = positions.length / 3;
  const normals = readVec3Attribute(spec.normals, "normals");
  if (normals && normals.length !== positions.length) throw new Error("Aura3D geometry normals must match the position count.");
  const uvs = readVec2Attribute(spec.uvs, "uvs");
  if (uvs && uvs.length !== vertexCount * 2) throw new Error("Aura3D geometry uvs must match the position count.");
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
  }
  let indices: Uint16Array | Uint32Array | undefined;
  // An empty index list means "non-indexed" (sequential 0..n-1) — e.g. the
  // edges/wireframe helpers emit line-vertex pairs with no index stream.
  if (spec.indices !== undefined && spec.indices.length > 0) {
    indices = spec.indices instanceof Uint16Array || spec.indices instanceof Uint32Array ? spec.indices : null as never;
    if (!indices) {
      const list = spec.indices as readonly number[];
      let max = 0;
      for (const value of list) {
        if (!Number.isInteger(value) || value < 0) throw new Error("Aura3D geometry indices must be non-negative integers.");
        if (value > max) max = value;
      }
      indices = max > 65535 ? Uint32Array.from(list) : Uint16Array.from(list);
    }
    for (const [offset, value] of indices.entries()) {
      if (!Number.isInteger(value) || value < 0 || value >= vertexCount) throw new Error(`Aura3D geometry index ${offset} is outside the position buffer.`);
    }
  }
  return { positions, vertexCount, custom: normalizeCustomVertexAttributes(spec.attributes, vertexCount), normals, uvs, colors, indices };
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
  if (normalized.vertexCount === 0) throw new Error("Aura3D dynamic geometry requires at least one vertex.");
  const indexCount = normalized.indices?.length ?? normalized.vertexCount;
  if (indexCount === 0) throw new Error("Aura3D dynamic geometry requires at least one index or vertex.");
  return {
    kind: "aura-custom-geometry",
    positions: normalized.positions,
    ...(spec.normals !== undefined ? { normals: normalized.normals! } : {}),
    ...(spec.uvs !== undefined ? { uvs: normalized.uvs! } : {}),
    ...(spec.colors !== undefined ? { colors: normalized.colors! } : {}),
    indices: normalized.indices ?? Uint16Array.from({ length: normalized.vertexCount }, (_, i) => i),
    ...(normalized.custom.length > 0 ? { attributes: customAttributesRecord(normalized.custom) } : {}),
    ...(spec.topology === "points" ? { topology: "points" as const } : {}),
    ...(spec.groups ? { groups: [...spec.groups] } : {}),
    ...(spec.drawRange ? { drawRange: { ...spec.drawRange } } : {}),
    ...(spec.morphTargets ? { morphTargets: spec.morphTargets.map((target) => ({ ...target })) } : {}),
    ...(spec.bounds ? { bounds: { min: [...spec.bounds.min] as AuraRootVec3, max: [...spec.bounds.max] as AuraRootVec3 } } : {}),
    dynamic: true
  };
}

// ── SG-05 helpers: three's BufferGeometryUtils equivalents (L2-05) ───────────

/** three's `BufferGeometry.computeVertexNormals` over an Aura spec — returns a fresh flat normal array. */
export function computeAuraGeometryNormals(spec: { readonly positions: AuraVec3Attribute; readonly indices?: AuraIndexAttribute }): Float32Array {
  const positions = readVec3Attribute(spec.positions, "positions")!;
  const count = positions.length / 3;
  const normals = new Float32Array(positions.length);
  const faceNormal = (ia: number, ib: number, ic: number): readonly [number, number, number] => {
    const cbx = positions[ic * 3]! - positions[ib * 3]!;
    const cby = positions[ic * 3 + 1]! - positions[ib * 3 + 1]!;
    const cbz = positions[ic * 3 + 2]! - positions[ib * 3 + 2]!;
    const abx = positions[ia * 3]! - positions[ib * 3]!;
    const aby = positions[ia * 3 + 1]! - positions[ib * 3 + 1]!;
    const abz = positions[ia * 3 + 2]! - positions[ib * 3 + 2]!;
    let nx = cby * abz - cbz * aby;
    let ny = cbz * abx - cbx * abz;
    let nz = cbx * aby - cby * abx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }
    return [nx, ny, nz];
  };
  if (spec.indices && spec.indices.length > 0) {
    for (let i = 0; i + 2 < spec.indices.length; i += 3) {
      const ia = spec.indices[i]!;
      const ib = spec.indices[i + 1]!;
      const ic = spec.indices[i + 2]!;
      const n = faceNormal(ia, ib, ic);
      for (const v of [ia, ib, ic]) {
        normals[v * 3] = normals[v * 3]! + n[0];
        normals[v * 3 + 1] = normals[v * 3 + 1]! + n[1];
        normals[v * 3 + 2] = normals[v * 3 + 2]! + n[2];
      }
    }
    for (let i = 0; i < count; i += 1) {
      const len = Math.hypot(normals[i * 3]!, normals[i * 3 + 1]!, normals[i * 3 + 2]!);
      if (len > 0) {
        normals[i * 3] = normals[i * 3]! / len;
        normals[i * 3 + 1] = normals[i * 3 + 1]! / len;
        normals[i * 3 + 2] = normals[i * 3 + 2]! / len;
      }
    }
  } else {
    for (let i = 0; i < count; i += 3) {
      const n = faceNormal(i, i + 1, i + 2);
      for (const v of [i, i + 1, i + 2]) {
        normals[v * 3] = n[0];
        normals[v * 3 + 1] = n[1];
        normals[v * 3 + 2] = n[2];
      }
    }
  }
  return normals;
}

/** three's `BufferGeometry.computeBoundingBox` — finite min/max over positions. */
export function computeAuraGeometryBounds(spec: { readonly positions: AuraVec3Attribute }): { readonly min: AuraRootVec3; readonly max: AuraRootVec3 } {
  const positions = readVec3Attribute(spec.positions, "positions")!;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const v = positions[i + axis]!;
      if (v < min[axis]) min[axis] = v;
      if (v > max[axis]) max[axis] = v;
    }
  }
  return { min, max };
}

/**
 * three's `BufferGeometry.applyMatrix4` — positions take the full column-major
 * mat4; normals take the upper 3x3 (the three `normalMatrix` inverse-transpose
 * reduces to the same rotation/scale here for rigid+scale matrices, matching
 * the engine mergeGeometries convention) and are renormalized.
 */
export function applyAuraGeometryMatrix4(spec: AuraCustomGeometrySpec, matrix: readonly number[]): AuraCustomGeometrySpec {
  if (matrix.length !== 16 || ![...matrix].every(Number.isFinite)) throw new Error("applyAuraGeometryMatrix4 requires a finite mat4.");
  const positions = readVec3Attribute(spec.positions, "positions")!.slice();
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    positions[i] = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
    positions[i + 1] = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!;
    positions[i + 2] = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!;
  }
  let normals: Float32Array | undefined;
  if (spec.normals !== undefined) {
    normals = readVec3Attribute(spec.normals, "normals")!.slice();
    for (let i = 0; i < normals.length; i += 3) {
      const x = normals[i]!, y = normals[i + 1]!, z = normals[i + 2]!;
      const nx = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z;
      const ny = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z;
      const nz = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }
  return {
    ...spec,
    positions,
    ...(normals ? { normals } : {}),
    bounds: spec.bounds ? computeAuraGeometryBounds({ positions }) : undefined
  };
}

/** three's `BufferGeometryUtils.toNonIndexed` — one vertex per index, in index order. */
export function auraGeometryToNonIndexed(spec: AuraCustomGeometrySpec): AuraCustomGeometrySpec {
  const positions = readVec3Attribute(spec.positions, "positions")!;
  const normals = readVec3Attribute(spec.normals, "normals");
  const uvs = readVec2Attribute(spec.uvs, "uvs");
  const colors = spec.colors !== undefined ? normalizeGeometryAttributes({ positions: spec.positions, colors: spec.colors }).colors : undefined;
  const indices = spec.indices;
  if (!indices || indices.length === 0) return spec;
  const custom = normalizeCustomVertexAttributes(spec.attributes, positions.length / 3);
  const expand = (source: Float32Array | undefined, components: number): Float32Array | undefined => {
    if (!source) return undefined;
    const out = new Float32Array(indices.length * components);
    for (let i = 0; i < indices.length; i += 1) {
      const v = indices[i]!;
      for (let c = 0; c < components; c += 1) out[i * components + c] = source[v * components + c]!;
    }
    return out;
  };
  return {
    ...spec,
    positions: expand(positions, 3)!,
    ...(normals ? { normals: expand(normals, 3)! } : {}),
    ...(uvs ? { uvs: expand(uvs, 2)! } : {}),
    ...(colors ? { colors: expand(colors, 4)! } : {}),
    ...(custom.length > 0 ? { attributes: Object.fromEntries(custom.map((entry) => [entry.name, { itemSize: entry.itemSize, data: expand(entry.data, entry.itemSize)! }])) } : {}),
    indices: []
  };
}

/**
 * three's `BufferGeometryUtils.mergeGeometries` — concatenates specs (no
 * transform baking; the R/MeshConsolidation merge bakes model matrices for
 * the static path, while the authored merge keeps authored coordinates).
 * Index-bearing specs share the index stream; attribute sets must match.
 */
export function mergeAuraGeometries(specs: readonly AuraCustomGeometrySpec[]): AuraCustomGeometrySpec {
  if (specs.length === 0) throw new Error("mergeAuraGeometries requires at least one geometry spec.");
  const normalized = specs.map((spec) => normalizeGeometryAttributes(spec));
  const withUvs = normalized.every((entry) => entry.uvs !== undefined);
  const withNormals = normalized.every((entry) => entry.normals !== undefined);
  const withColors = normalized.every((entry) => entry.colors !== undefined);
  const withIndex = normalized.every((entry) => entry.indices !== undefined && entry.indices.length > 0);
  const customNames = normalized[0]!.custom.map((entry) => entry.name);
  for (const entry of normalized) {
    if (entry.custom.length !== customNames.length || entry.custom.some((attribute, i) => attribute.name !== customNames[i] || attribute.itemSize !== normalized[0]!.custom[i]!.itemSize)) {
      throw new Error("mergeAuraGeometries requires every geometry to carry the same custom vertex attributes (names and itemSize), like three's mergeGeometries.");
    }
  }
  const totalVertices = normalized.reduce((sum, entry) => sum + entry.vertexCount, 0);
  const positions = new Float32Array(totalVertices * 3);
  const normals = withNormals ? new Float32Array(totalVertices * 3) : undefined;
  const uvs = withUvs ? new Float32Array(totalVertices * 2) : undefined;
  const colors = withColors ? new Float32Array(totalVertices * 4) : undefined;
  const customMerged = normalized[0]!.custom.map((attribute) => ({ name: attribute.name, itemSize: attribute.itemSize, data: new Float32Array(totalVertices * attribute.itemSize) }));
  const indices: number[] = [];
  const groups: AuraGeometryGroupSpec[] = [];
  let cursor = 0;
  for (const entry of normalized) {
    entry.custom.forEach((attribute, i) => customMerged[i]!.data.set(attribute.data, cursor * attribute.itemSize));
    positions.set(entry.positions, cursor * 3);
    if (normals && entry.normals) normals.set(entry.normals, cursor * 3);
    if (uvs && entry.uvs) uvs.set(entry.uvs, cursor * 2);
    if (colors && entry.colors) colors.set(entry.colors, cursor * 4);
    if (withIndex) {
      const source = entry.indices!;
      const start = indices.length;
      for (let i = 0; i < source.length; i += 1) indices.push(source[i]! + cursor);
      groups.push({ start, count: source.length });
    }
    cursor += entry.vertexCount;
  }
  return {
    kind: "aura-custom-geometry",
    positions,
    ...(normals ? { normals } : {}),
    ...(uvs ? { uvs } : {}),
    ...(colors ? { colors } : {}),
    ...(customMerged.length > 0 ? { attributes: customAttributesRecord(customMerged) } : {}),
    indices,
    ...(withIndex ? { groups } : {})
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
