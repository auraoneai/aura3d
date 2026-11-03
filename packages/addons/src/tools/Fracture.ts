/**
 * Deterministic, CPU-side fracture of closed convex triangle meshes.
 *
 * The algorithm clips each outward-facing polygon against a plane, then fills
 * the cross section on both sides. It is authored for Aura3D and does not
 * invoke another geometry engine. Returned geometry can be passed to
 * `defineAuraCustomGeometry` / `geometry.dynamic` without a GPU allocation.
 */

export type FractureVec3 = readonly [number, number, number];

export interface FractureGeometryGroup {
  readonly start: number;
  readonly count: number;
  readonly materialIndex?: number;
}

/**
 * A closed, consistently wound convex triangle mesh. Coincident seam vertices
 * are accepted when their coordinates are exactly equal. Flat packed
 * positions and an optional triangle index stream are supported; omitted or
 * empty indices mean a non-indexed triangle list. Input normals
 * are validated and recomputed as flat geometric normals. UV/color/custom
 * attribute interpolation, skinned/morph meshes, draw ranges, lines, points,
 * concave or open meshes are rejected rather than silently discarded.
 */
export interface ConvexFractureInput {
  readonly positions: ArrayLike<number>;
  readonly indices?: ArrayLike<number>;
  readonly groups?: readonly FractureGeometryGroup[];
  readonly topology?: string;
  readonly normals?: ArrayLike<number>;
  readonly uvs?: unknown;
  readonly colors?: unknown;
  readonly attributes?: unknown;
  readonly morphTargets?: unknown;
  readonly drawRange?: unknown;
}

/** Plane equation is dot(normal, position) = constant, in mesh-local space. */
export interface FracturePlane {
  readonly normal: FractureVec3;
  readonly constant: number;
}

export interface ConvexFractureOptions {
  /** Exact target fragment count for seeded cuts; defaults to 2. */
  readonly pieces?: number;
  /** Integer in [0, 2^32 - 1]. Identical inputs and seed give identical output. */
  readonly seed?: number;
  /** Ordered local-space planes. Mutually exclusive with `pieces`. */
  readonly planes?: readonly FracturePlane[];
  /** Hard limit on fragments, 1..128. Defaults to 64. */
  readonly maxFragments?: number;
  /** Maximum total output triangles, 4..250000. Defaults to 100000. */
  readonly maxTriangles?: number;
  /** Material slot assigned to new cross-section faces; defaults to 1. */
  readonly capMaterialIndex?: number;
}

export interface FractureGeometry {
  readonly kind: "aura-custom-geometry";
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly bounds: { readonly min: FractureVec3; readonly max: FractureVec3 };
  readonly groups: readonly FractureGeometryGroup[];
}

export interface ConvexFractureFragment {
  /** Geometry is in the input's local coordinate system. */
  readonly geometry: FractureGeometry;
  readonly volume: number;
  readonly centroid: FractureVec3;
}

export interface ConvexFractureResult {
  /** Empty after dispose. Fragment arrays already retained by a caller remain valid. */
  readonly fragments: readonly ConvexFractureFragment[];
  readonly disposed: boolean;
  /** Drops the result's references; no GPU resources or input buffers are owned. */
  dispose(): void;
}

type Vec = [number, number, number];
interface Face { points: Vec[]; normal: Vec; material: number }
interface Solid { faces: Face[] }
interface NormalizedPlane { normal: Vec; constant: number }
interface Mass { volume: number; centroid: Vec }

const MAX_INPUT_VERTICES = 4096;
const MAX_INPUT_TRIANGLES = 8192;
const MAX_FRAGMENTS = 128;
const MAX_OUTPUT_TRIANGLES = 250_000;

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec): number => Math.hypot(a[0], a[1], a[2]);
const distance = (a: Vec, b: Vec): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];

function boundedInteger(value: number, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function average(points: readonly Vec[]): Vec {
  const origin = points[0]!;
  let x = 0, y = 0, z = 0;
  for (const p of points) { x += p[0] - origin[0]; y += p[1] - origin[1]; z += p[2] - origin[2]; }
  return [origin[0] + x / points.length, origin[1] + y / points.length, origin[2] + z / points.length];
}

/** Signed tetrahedral integration around an interior point avoids origin cancellation. */
function measure(solid: Solid): Mass {
  // The weighted mean of all face vertices is inside any convex solid. It is
  // sufficient as an integration origin and avoids an O(vertices²) dedupe.
  const ref = average(solid.faces.flatMap((face) => face.points));
  let sum = 0, x = 0, y = 0, z = 0;
  for (const face of solid.faces) {
    const a = face.points[0]!;
    for (let i = 1; i + 1 < face.points.length; i++) {
      const b = face.points[i]!, c = face.points[i + 1]!;
      const v = dot(sub(a, ref), cross(sub(b, ref), sub(c, ref))) / 6;
      sum += v;
      x += v * ((a[0] - ref[0]) + (b[0] - ref[0]) + (c[0] - ref[0])) / 4;
      y += v * ((a[1] - ref[1]) + (b[1] - ref[1]) + (c[1] - ref[1])) / 4;
      z += v * ((a[2] - ref[2]) + (b[2] - ref[2]) + (c[2] - ref[2])) / 4;
    }
  }
  if (!Number.isFinite(sum) || sum === 0) throw new Error("Fracture requires a solid with nonzero finite volume.");
  return { volume: sum, centroid: [ref[0] + x / sum, ref[1] + y / sum, ref[2] + z / sum] };
}

function materialAssignments(groups: readonly FractureGeometryGroup[] | undefined, indexCount: number): number[] {
  if (!groups) return Array<number>(indexCount / 3).fill(0);
  let cursor = 0;
  const materials: number[] = [];
  for (const group of groups) {
    const material = group.materialIndex ?? 0;
    if (!Number.isSafeInteger(group.start) || !Number.isSafeInteger(group.count) || group.start !== cursor || group.count <= 0 || group.count % 3 !== 0 || !Number.isSafeInteger(material) || material < 0) {
      throw new Error("Fracture groups must be ordered, contiguous, triangle-aligned ranges with nonnegative material indices.");
    }
    cursor += group.count;
    if (cursor > indexCount) throw new Error("Fracture groups exceed the triangle index stream.");
    for (let n = 0; n < group.count / 3; n++) materials.push(material);
  }
  if (cursor !== indexCount) throw new Error("Fracture groups must cover the entire triangle index stream.");
  return materials;
}

function parseSolid(input: ConvexFractureInput): { solid: Solid; epsilon: number; extent: number } {
  if (!input || !input.positions || typeof input.positions.length !== "number") throw new TypeError("Fracture requires flat packed positions.");
  if (input.topology !== undefined && input.topology !== "triangles") throw new Error("Fracture only supports triangle topology.");
  for (const key of ["uvs", "colors", "attributes", "morphTargets", "drawRange"] as const) {
    if (input[key] !== undefined) throw new Error(`Fracture does not support ${key}; remove it explicitly before fracturing.`);
  }
  const count = input.positions.length;
  if (!Number.isSafeInteger(count) || count < 12 || count % 3 !== 0 || count / 3 > MAX_INPUT_VERTICES) {
    throw new RangeError(`Fracture positions must contain 4..${MAX_INPUT_VERTICES} packed vertices.`);
  }
  if (input.normals !== undefined) {
    if (input.normals === null || input.normals.length !== count) throw new Error("Fracture normals must match the packed position length.");
    for (let i = 0; i < count; i++) if (!Number.isFinite(input.normals[i])) throw new TypeError("Fracture normals must be finite numbers.");
  }
  const positions: Vec[] = [];
  const min: Vec = [Infinity, Infinity, Infinity], max: Vec = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i += 3) {
    const p: Vec = [input.positions[i]!, input.positions[i + 1]!, input.positions[i + 2]!];
    if (!p.every(Number.isFinite)) throw new TypeError("Fracture positions must be finite numbers.");
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, p[k]!); max[k] = Math.max(max[k]!, p[k]!); }
    positions.push(p);
  }
  const extent = distance(min, max);
  if (!Number.isFinite(extent) || extent <= 0) throw new Error("Fracture requires non-degenerate bounds.");
  // The public renderer consumes float32 positions. Refuse coordinates whose
  // conversion would erase meaningful geometry instead of returning bad meshes.
  const floatTolerance = Math.max(extent * 1e-6, Number.MIN_VALUE);
  for (const p of positions) for (const c of p) {
    if (!Number.isFinite(Math.fround(c)) || Math.abs(Math.fround(c) - c) > floatTolerance) {
      throw new RangeError("Fracture positions cannot be represented accurately as float32 at this scale.");
    }
  }
  // Output is float32, so use a scale-aware tolerance large enough to accept
  // fragments as valid future inputs after float32 rounding.
  const epsilon = Math.max(extent * 2e-6, Number.MIN_VALUE);
  const indexed = input.indices?.length ? input.indices : undefined;
  const indexCount = indexed?.length ?? positions.length;
  if (!Number.isSafeInteger(indexCount) || indexCount < 12 || indexCount % 3 !== 0 || indexCount / 3 > MAX_INPUT_TRIANGLES) {
    throw new RangeError(`Fracture requires 4..${MAX_INPUT_TRIANGLES} triangles.`);
  }
  const materials = materialAssignments(input.groups, indexCount);
  const faces: Face[] = [];
  const vertexIds = new Map<string, number>();
  const edgeCounts = new Map<string, { count: number; direction: number }>();
  const used = new Map<number, Vec>();
  const canonical = (p: Vec): number => {
    const key = p.map((v) => Object.is(v, -0) ? 0 : v).join(",");
    let id = vertexIds.get(key);
    if (id === undefined) { id = vertexIds.size; vertexIds.set(key, id); used.set(id, p); }
    return id;
  };
  for (let i = 0; i < indexCount; i += 3) {
    const tri: Vec[] = [];
    const ids: number[] = [];
    for (let j = 0; j < 3; j++) {
      const index = indexed ? indexed[i + j]! : i + j;
      if (!Number.isSafeInteger(index) || index < 0 || index >= positions.length) throw new RangeError("Fracture indices must reference existing vertices.");
      const p = positions[index]!;
      tri.push(p);
      ids.push(canonical(p));
    }
    if (new Set(ids).size !== 3 || length(cross(sub(tri[1]!, tri[0]!), sub(tri[2]!, tri[0]!))) <= epsilon * epsilon) {
      throw new Error("Fracture does not support degenerate triangles.");
    }
    for (let j = 0; j < 3; j++) {
      const a = ids[j]!, b = ids[(j + 1) % 3]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const entry = edgeCounts.get(key) ?? { count: 0, direction: 0 };
      entry.count++; entry.direction += a < b ? 1 : -1; edgeCounts.set(key, entry);
    }
    const normal = cross(sub(tri[1]!, tri[0]!), sub(tri[2]!, tri[0]!));
    faces.push({ points: tri, normal: scale(normal, 1 / length(normal)), material: materials[i / 3]! });
  }
  for (const edge of edgeCounts.values()) {
    if (edge.count !== 2 || edge.direction !== 0) throw new Error("Fracture requires a closed, consistently wound two-manifold triangle mesh.");
  }
  const solid = { faces };
  let mass = measure(solid);
  if (Math.abs(mass.volume) <= extent ** 3 * 1e-12) throw new Error("Fracture requires a non-degenerate solid volume.");
  if (mass.volume < 0) {
    for (const face of faces) { face.points.reverse(); face.normal = scale(face.normal, -1); }
    mass = measure(solid);
  }
  // A closed oriented mesh is convex iff every vertex lies on or behind every
  // outward face plane. This deliberately rejects concavities and cavities.
  for (const face of faces) {
    const n = face.normal, origin = face.points[0]!;
    for (const p of used.values()) {
      if (dot(n, sub(p, origin)) > epsilon * 4) throw new Error("Fracture only supports convex solids without cavities.");
    }
  }
  return { solid, epsilon, extent };
}

function normalizePlane(plane: FracturePlane): NormalizedPlane {
  if (!plane || !plane.normal || plane.normal.length !== 3 || !plane.normal.every(Number.isFinite) || !Number.isFinite(plane.constant)) {
    throw new TypeError("Fracture plane requires a finite normal and constant.");
  }
  const n: Vec = [plane.normal[0], plane.normal[1], plane.normal[2]];
  const size = length(n);
  if (!Number.isFinite(size) || size < 1e-15) throw new RangeError("Fracture plane normal must be nonzero.");
  const constant = plane.constant / size;
  if (!Number.isFinite(constant)) throw new RangeError("Fracture plane is outside the finite coordinate range.");
  return { normal: scale(n, 1 / size), constant };
}

function clipPolygon(points: readonly Vec[], plane: NormalizedPlane, side: 1 | -1, epsilon: number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    const da = side * (dot(plane.normal, a) - plane.constant);
    const db = side * (dot(plane.normal, b) - plane.constant);
    const insideA = da <= epsilon, insideB = db <= epsilon;
    if (insideA) out.push(a);
    if (insideA !== insideB) {
      const t = Math.max(0, Math.min(1, da / (da - db)));
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
    }
  }
  const compact: Vec[] = [];
  for (const p of out) if (!compact.length || distance(p, compact[compact.length - 1]!) > epsilon) compact.push(p);
  if (compact.length > 1 && distance(compact[0]!, compact[compact.length - 1]!) <= epsilon) compact.pop();
  return compact;
}

function triangleCount(solid: Solid): number {
  return solid.faces.reduce((sum, f) => sum + (f.points.length === 3 ? 1 : f.points.length), 0);
}

function splitSolid(solid: Solid, plane: NormalizedPlane, capMaterial: number, epsilon: number, triangleBudget: number): readonly [Solid, Solid] | null {
  let low = Infinity, high = -Infinity;
  for (const face of solid.faces) for (const p of face.points) {
    const d = dot(plane.normal, p) - plane.constant;
    low = Math.min(low, d); high = Math.max(high, d);
  }
  if (low >= -epsilon || high <= epsilon) return null;
  const negative: Solid = { faces: [] }, positive: Solid = { faces: [] };
  const crossSection: Vec[] = [];
  const crossSectionBins = new Map<string, Vec[]>();
  let crossSectionOrigin: Vec | undefined;
  const cellSize = epsilon * 2;
  let triangles = 0;
  const remember = (p: Vec): void => {
    crossSectionOrigin ??= p;
    const cell: Vec = [Math.floor((p[0] - crossSectionOrigin[0]) / cellSize), Math.floor((p[1] - crossSectionOrigin[1]) / cellSize), Math.floor((p[2] - crossSectionOrigin[2]) / cellSize)];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const bucket = crossSectionBins.get(`${cell[0] + x},${cell[1] + y},${cell[2] + z}`);
      if (bucket?.some((q) => distance(p, q) <= cellSize)) return;
    }
    const key = cell.join(",");
    const bucket = crossSectionBins.get(key) ?? [];
    bucket.push(p); crossSectionBins.set(key, bucket); crossSection.push(p);
  };
  for (const face of solid.faces) {
    const a = clipPolygon(face.points, plane, 1, epsilon);
    const b = clipPolygon(face.points, plane, -1, epsilon);
    for (const p of a) if (Math.abs(dot(plane.normal, p) - plane.constant) <= epsilon * 2) remember(p);
    if (a.length >= 3) { negative.faces.push({ points: a, normal: face.normal, material: face.material }); triangles += a.length === 3 ? 1 : a.length; }
    if (b.length >= 3) { positive.faces.push({ points: b, normal: face.normal, material: face.material }); triangles += b.length === 3 ? 1 : b.length; }
    if (triangles > triangleBudget) throw new RangeError("Fracture triangle budget exceeded.");
  }
  if (crossSection.length < 3) throw new Error("Fracture plane produced a degenerate cross-section.");
  const center = average(crossSection);
  const axis: Vec = Math.abs(plane.normal[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  const tangent = cross(axis, plane.normal);
  const tangentLength = length(tangent);
  const u = scale(tangent, 1 / tangentLength), v = cross(plane.normal, u);
  crossSection.sort((a, b) => Math.atan2(dot(sub(a, center), v), dot(sub(a, center), u)) - Math.atan2(dot(sub(b, center), v), dot(sub(b, center), u)));
  // u x v points along +normal, outward for the negative half.
  negative.faces.push({ points: crossSection, normal: plane.normal, material: capMaterial });
  positive.faces.push({ points: crossSection.slice().reverse(), normal: scale(plane.normal, -1), material: capMaterial });
  if (triangleCount(negative) + triangleCount(positive) > triangleBudget) throw new RangeError("Fracture triangle budget exceeded.");
  return [negative, positive];
}

function makeGeometry(solid: Solid): FractureGeometry {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const groups: Array<{ start: number; count: number; materialIndex: number }> = [];
  const min: Vec = [Infinity, Infinity, Infinity], max: Vec = [-Infinity, -Infinity, -Infinity];
  const addTriangle = (a: Vec, b: Vec, c: Vec, n: Vec, material: number): void => {
    const rounded = [a, b, c].map((p): Vec => [Math.fround(p[0]), Math.fround(p[1]), Math.fround(p[2])]);
    const facing = dot(cross(sub(rounded[1]!, rounded[0]!), sub(rounded[2]!, rounded[0]!)), n);
    if (!Number.isFinite(facing) || facing <= 0) {
      throw new RangeError("Fracture triangle cannot be represented reliably as float32; use a better-scaled local-space mesh or a less degenerate cut.");
    }
    let group = groups[groups.length - 1];
    if (!group || group.materialIndex !== material) { group = { start: indices.length, count: 0, materialIndex: material }; groups.push(group); }
    for (const p of rounded) {
      const index = positions.length / 3;
      positions.push(p[0], p[1], p[2]); normals.push(n[0], n[1], n[2]); indices.push(index); group.count++;
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, p[k]!); max[k] = Math.max(max[k]!, p[k]!); }
    }
  };
  for (const face of solid.faces) {
    const n = face.normal;
    if (face.points.length === 3) addTriangle(face.points[0]!, face.points[1]!, face.points[2]!, n, face.material);
    else {
      const center = average(face.points);
      for (let i = 0; i < face.points.length; i++) addTriangle(center, face.points[i]!, face.points[(i + 1) % face.points.length]!, n, face.material);
    }
  }
  return { kind: "aura-custom-geometry", positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), bounds: { min, max }, groups };
}

/**
 * Cut a closed convex solid into independently renderable pieces. With `planes`,
 * every supplied plane is applied to every piece it actually intersects. With
 * `pieces`, seeded planes go through the largest piece's centroid. A tangent or
 * external explicit plane leaves the solid unchanged. Limits are checked while
 * clipping, before final typed-array allocation. Unsupported geometry throws.
 */
export function fractureConvex(input: ConvexFractureInput, options: ConvexFractureOptions = {}): ConvexFractureResult {
  const maxFragments = boundedInteger(options.maxFragments ?? 64, 1, MAX_FRAGMENTS, "maxFragments");
  const maxTriangles = boundedInteger(options.maxTriangles ?? 100_000, 4, MAX_OUTPUT_TRIANGLES, "maxTriangles");
  const capMaterial = boundedInteger(options.capMaterialIndex ?? 1, 0, 0x7fffffff, "capMaterialIndex");
  if (options.planes !== undefined && options.pieces !== undefined) throw new Error("Choose either explicit fracture planes or a seeded piece count.");
  if (options.planes !== undefined && options.seed !== undefined) throw new Error("seed only applies to seeded fracture; omit it when supplying planes.");
  const seed = boundedInteger(options.seed ?? 0, 0, 0xffffffff, "seed");
  const desired = options.planes === undefined ? boundedInteger(options.pieces ?? 2, 1, maxFragments, "pieces") : 0;
  if (options.planes !== undefined && (!Array.isArray(options.planes) || options.planes.length > MAX_FRAGMENTS)) {
    throw new RangeError(`planes must be an array of at most ${MAX_FRAGMENTS} planes.`);
  }
  const planes = options.planes?.map(normalizePlane);
  const { solid, epsilon, extent } = parseSolid(input);
  if (triangleCount(solid) > maxTriangles) throw new RangeError("Fracture triangle budget exceeded.");
  let solids: Solid[] = [solid];
  if (planes) {
    for (const plane of planes) {
      const next: Solid[] = [];
      let remainingTriangles = maxTriangles;
      for (const current of solids) {
        const pair = splitSolid(current, plane, capMaterial, epsilon, remainingTriangles);
        for (const piece of pair ?? [current]) {
          if (next.length >= maxFragments) throw new RangeError("Fracture fragment budget exceeded.");
          remainingTriangles -= triangleCount(piece);
          if (remainingTriangles < 0) throw new RangeError("Fracture triangle budget exceeded.");
          next.push(piece);
        }
      }
      solids = next;
    }
  } else {
    let state = seed;
    const random = (): number => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
    while (solids.length < desired) {
      let chosen = 0, largest = -Infinity;
      for (let i = 0; i < solids.length; i++) {
        const volume = measure(solids[i]!).volume;
        if (volume > largest) { chosen = i; largest = volume; }
      }
      const source = solids[chosen]!, centroid = measure(source).centroid;
      let n: Vec = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];
      if (length(n) < 1e-10) n = [1, 0, 0];
      n = scale(n, 1 / length(n));
      const currentTotal = solids.reduce((sum, s) => sum + triangleCount(s), 0);
      const pair = splitSolid(source, { normal: n, constant: dot(n, centroid) }, capMaterial, epsilon, maxTriangles - currentTotal + triangleCount(source));
      if (!pair) throw new Error("Fracture could not make a non-degenerate seeded cut at this scale.");
      for (const piece of pair) {
        if (measure(piece).volume <= extent ** 3 * 1e-14) throw new Error("Fracture produced a degenerate fragment.");
      }
      solids.splice(chosen, 1, ...pair);
    }
  }
  let fragments: ConvexFractureFragment[] = solids.map((piece) => {
    const mass = measure(piece);
    if (mass.volume <= extent ** 3 * 1e-14) throw new Error("Fracture produced a degenerate fragment.");
    return { geometry: makeGeometry(piece), volume: mass.volume, centroid: mass.centroid };
  });
  let disposed = false;
  return {
    get fragments() { return fragments; },
    get disposed() { return disposed; },
    dispose() { if (!disposed) { disposed = true; fragments = []; } }
  };
}
