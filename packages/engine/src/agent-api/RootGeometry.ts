import type { SdfTextStyle } from "@aura3d/rendering";

export type AuraRootVec3 = readonly [number, number, number];

export interface AuraCustomGeometrySpec {
  readonly kind: "aura-custom-geometry";
  readonly positions: readonly AuraRootVec3[];
  readonly normals?: readonly AuraRootVec3[];
  readonly indices: readonly number[];
  readonly bounds?: { readonly min: AuraRootVec3; readonly max: AuraRootVec3 };
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
  if (spec.positions.length < 3) throw new Error("Aura3D custom geometry requires at least three positions.");
  if (spec.indices.length < 3 || spec.indices.length % 3 !== 0) throw new Error("Aura3D custom triangle geometry indices must contain complete triangles.");
  for (const [index, position] of spec.positions.entries()) validateVec3(position, `position ${index}`);
  for (const [index, value] of spec.indices.entries()) {
    if (!Number.isInteger(value) || value < 0 || value >= spec.positions.length) throw new Error(`Aura3D custom geometry index ${index} is outside the position buffer.`);
  }
  if (spec.normals && spec.normals.length !== spec.positions.length) throw new Error("Aura3D custom geometry normals must match the position count.");
  spec.normals?.forEach((normal, index) => validateVec3(normal, `normal ${index}`));
  if (spec.bounds) {
    validateVec3(spec.bounds.min, "bounds min");
    validateVec3(spec.bounds.max, "bounds max");
    for (let axis = 0; axis < 3; axis += 1) if (spec.bounds.max[axis]! < spec.bounds.min[axis]!) throw new Error("Aura3D custom geometry bounds max must be greater than or equal to min.");
  }
  return {
    kind: "aura-custom-geometry",
    positions: spec.positions.map((value) => [...value] as AuraRootVec3),
    ...(spec.normals ? { normals: spec.normals.map((value) => [...value] as AuraRootVec3) } : {}),
    indices: [...spec.indices],
    ...(spec.bounds ? { bounds: { min: [...spec.bounds.min] as AuraRootVec3, max: [...spec.bounds.max] as AuraRootVec3 } } : {})
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
