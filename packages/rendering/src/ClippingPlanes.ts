/** Plane clipping shared by the forward, camera-depth and shadow passes.
 *
 * A plane `[a,b,c,d]` retains points for which `a*x+b*y+c*z+d >= 0`.
 * Planes in a group retain their intersection (all) or union (any); a
 * fragment must satisfy both the global and the material group. An empty or
 * disabled group is the identity. Shadow passes only use groups that opt in
 * with `clipShadows`; ordinary depth passes use the same groups as forward.
 */

export type ClippingPlane = readonly [number, number, number, number];
export type ClippingSpace = "world" | "local";
export type ClippingCombination = "intersection" | "union";
export type ClippingScope = "global" | "material";
export type ClippingPass = "forward" | "depth" | "shadow";
export type ClippingPrimitive = "mesh" | "line" | "point" | "sprite";

export interface ClippingGroupInput {
  readonly planes: readonly ClippingPlane[];
  /** Present on public snapshots/controllers, absent on raw renderer inputs. */
  readonly scope?: ClippingScope;
  readonly space?: ClippingSpace;
  readonly combine?: ClippingCombination;
  readonly clipShadows?: boolean;
  readonly enabled?: boolean;
  readonly disposed?: boolean;
}

export interface ClippingGroup extends ClippingGroupInput {
  readonly space: ClippingSpace;
  readonly combine: ClippingCombination;
  readonly clipShadows: boolean;
  readonly enabled: boolean;
}

export interface ClippingGroupBinding {
  readonly scope: ClippingScope;
  readonly offset: number;
  readonly count: number;
  readonly space: ClippingSpace;
  readonly combine: ClippingCombination;
}

export interface ClippingBinding {
  /** Tightly packed vec4 plane equations; normalized and rounded for GPU use. */
  readonly planes: Float32Array;
  readonly groups: readonly ClippingGroupBinding[];
  readonly pass: ClippingPass;
  readonly primitive: ClippingPrimitive;
  readonly backend: "webgl2" | "webgpu" | "mock";
}

export interface ClippingBindingOptions {
  readonly global?: ClippingGroupInput | null;
  readonly material?: ClippingGroupInput | null;
  readonly pass?: ClippingPass;
  readonly primitive?: ClippingPrimitive;
  readonly backend?: "webgl2" | "webgpu" | "mock";
  /** Device capacity, up to the fixed shader capacity. No plane is silently dropped. */
  readonly maxPlanes?: number;
}

/** Default shader budget per draw. Device integrations can supply a lower limit. */
export const DEFAULT_CLIPPING_PLANE_LIMIT = 8;

/** Normalize without overflowing the normal length for very large coefficients. */
export function normalizeClippingPlane(plane: ClippingPlane): ClippingPlane {
  if (!Array.isArray(plane) || plane.length !== 4 || !plane.every(Number.isFinite)) {
    throw new RangeError("Clipping plane must contain four finite coefficients.");
  }
  const scale = Math.max(Math.abs(plane[0]), Math.abs(plane[1]), Math.abs(plane[2]));
  if (scale === 0) throw new RangeError("Clipping plane normal must be nonzero.");
  const x = plane[0] / scale;
  const y = plane[1] / scale;
  const z = plane[2] / scale;
  const length = Math.hypot(x, y, z);
  const constant = (plane[3] / scale) / length;
  if (!Number.isFinite(constant)) throw new RangeError("Clipping plane normalized constant is out of range.");
  return [x / length, y / length, z / length, constant];
}

/** Copies and validates external input, including values received over JSON. */
export function validateClippingGroup(input: ClippingGroupInput, scope: ClippingScope): ClippingGroup {
  if (!input || typeof input !== "object" || !Array.isArray(input.planes)) {
    throw new TypeError("Clipping group must include a planes array.");
  }
  if (scope !== "global" && scope !== "material") throw new RangeError("Invalid clipping group scope.");
  if (input.scope !== undefined && input.scope !== scope) throw new RangeError(`Expected a ${scope} clipping group.`);
  const space = input.space ?? "world";
  const combine = input.combine ?? "intersection";
  const clipShadows = input.clipShadows ?? false;
  const enabled = input.enabled ?? true;
  if (space !== "world" && space !== "local") throw new RangeError("Clipping space must be world or local.");
  if (scope === "global" && space !== "world") throw new RangeError("Global clipping planes must use world space.");
  if (combine !== "intersection" && combine !== "union") throw new RangeError("Clipping combination must be intersection or union.");
  if (typeof clipShadows !== "boolean" || typeof enabled !== "boolean" || (input.disposed !== undefined && typeof input.disposed !== "boolean")) {
    throw new TypeError("Clipping enabled, disposed and clipShadows must be boolean.");
  }
  return { planes: input.planes.map(normalizeClippingPlane), space, combine, clipShadows, enabled: enabled && !input.disposed };
}

/**
 * Transform an object-local plane by an affine column-major local-to-world
 * matrix. Solve `transpose(linear) * worldNormal = localNormal`, then account
 * for translation and normalize. This also handles nonuniform and negative
 * scale; applying the position matrix to the normal would not.
 */
export function transformClippingPlane(plane: ClippingPlane, localToWorld: ArrayLike<number>): ClippingPlane {
  const p = normalizeClippingPlane(plane);
  if (localToWorld.length !== 16 || Array.from(localToWorld).some((value) => !Number.isFinite(value))) {
    throw new RangeError("Clipping transform must contain sixteen finite values.");
  }
  if (localToWorld[3] !== 0 || localToWorld[7] !== 0 || localToWorld[11] !== 0 || localToWorld[15] !== 1) {
    throw new RangeError("Clipping transform must be affine.");
  }
  const rows = [
    [localToWorld[0], localToWorld[1], localToWorld[2], p[0]],
    [localToWorld[4], localToWorld[5], localToWorld[6], p[1]],
    [localToWorld[8], localToWorld[9], localToWorld[10], p[2]]
  ];
  // Pivoted elimination avoids explicit determinant division and handles
  // rotations and reflected/nonuniform scales with the same code path.
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (rows[pivot][column] === 0) throw new RangeError("Clipping transform is singular.");
    [rows[pivot], rows[column]] = [rows[column], rows[pivot]];
    const divisor = rows[column][column];
    for (let j = column; j < 4; j += 1) rows[column][j] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let j = column; j < 4; j += 1) rows[row][j] -= factor * rows[column][j];
    }
  }
  const normal: ClippingPlane = [
    rows[0][3], rows[1][3], rows[2][3],
    p[3] - rows[0][3] * localToWorld[12] - rows[1][3] * localToWorld[13] - rows[2][3] * localToWorld[14]
  ];
  return normalizeClippingPlane(normal);
}

/** Prepare a single draw's clipping state for either backend, without truncation. */
export function createClippingBinding(options: ClippingBindingOptions = {}): ClippingBinding {
  const pass = options.pass ?? "forward";
  const primitive = options.primitive ?? "mesh";
  const backend = options.backend ?? "webgl2";
  const maxPlanes = options.maxPlanes ?? DEFAULT_CLIPPING_PLANE_LIMIT;
  if (pass !== "forward" && pass !== "depth" && pass !== "shadow") throw new RangeError("Unsupported clipping pass.");
  if (primitive !== "mesh" && primitive !== "line" && primitive !== "point" && primitive !== "sprite") throw new RangeError("Unsupported clipping primitive.");
  if (backend !== "webgl2" && backend !== "webgpu" && backend !== "mock") throw new RangeError("Unsupported clipping backend.");
  if (!Number.isSafeInteger(maxPlanes) || maxPlanes < 0) throw new RangeError("Clipping plane limit must be a nonnegative integer.");
  const effectiveLimit = Math.min(maxPlanes, DEFAULT_CLIPPING_PLANE_LIMIT);

  const all: number[] = [];
  const groups: ClippingGroupBinding[] = [];
  const append = (raw: ClippingGroupInput | null | undefined, scope: ClippingScope): void => {
    if (raw == null) return;
    const group = validateClippingGroup(raw, scope);
    if (!group.enabled || group.planes.length === 0 || (pass === "shadow" && !group.clipShadows)) return;
    if (all.length / 4 + group.planes.length > effectiveLimit) {
      throw new RangeError(`Clipping plane count exceeds ${backend} limit of ${effectiveLimit}.`);
    }
    const offset = all.length / 4;
    for (const plane of group.planes) {
      for (const value of plane) {
        const packed = Math.fround(value);
        if (!Number.isFinite(packed)) throw new RangeError("Clipping plane coefficient is outside the GPU float range.");
        all.push(packed);
      }
    }
    groups.push({ scope, offset, count: group.planes.length, space: group.space, combine: group.combine });
  };
  append(options.global, "global");
  append(options.material, "material");
  return { planes: new Float32Array(all), groups, pass, primitive, backend };
}

/**
 * Fixed GLSL/WGSL uniform packet. `u_a3dClipGroups` stores
 * `[offset, count, unionFlag, localFlag]` per group; unused slots are zero.
 * Group and plane edits are uniforms and do not change shader variants.
 */
export function createClippingUniforms(binding: ClippingBinding): ReadonlyMap<string, number | Float32Array> {
  if (binding.groups.length > 2 || binding.planes.length > DEFAULT_CLIPPING_PLANE_LIMIT * 4) {
    throw new RangeError("Clipping binding exceeds shader capacity.");
  }
  const planes = new Float32Array(DEFAULT_CLIPPING_PLANE_LIMIT * 4);
  const groups = new Float32Array(2 * 4);
  planes.set(binding.planes);
  binding.groups.forEach((group, index) => {
    groups.set([group.offset, group.count, group.combine === "union" ? 1 : 0, group.space === "local" ? 1 : 0], index * 4);
  });
  return new Map([
    ["u_a3dClipPlanes", planes],
    ["u_a3dClipGroups", groups],
    ["u_a3dClipGroupCount", binding.groups.length]
  ] as [string, number | Float32Array][]);
}

/** Evaluate the same retained-half-space rule as the shader for a point. */
export function clippingRetainsPoint(binding: ClippingBinding, world: readonly [number, number, number], local?: readonly [number, number, number]): boolean {
  if (!Array.isArray(world) || world.length !== 3 || !world.every(Number.isFinite) ||
      (local !== undefined && (!Array.isArray(local) || local.length !== 3 || !local.every(Number.isFinite)))) {
    throw new RangeError("Clipping point must have three finite coordinates.");
  }
  for (const group of binding.groups) {
    if (group.space === "local" && local === undefined) throw new RangeError("Local clipping requires a local point.");
    const point = group.space === "local" ? local! : world;
    let retained = group.combine === "intersection";
    for (let index = group.offset; index < group.offset + group.count; index += 1) {
      const i = index * 4;
      const inside = binding.planes[i] * point[0] + binding.planes[i + 1] * point[1] + binding.planes[i + 2] * point[2] + binding.planes[i + 3] >= 0;
      retained = group.combine === "intersection" ? retained && inside : retained || inside;
    }
    if (!retained) return false;
  }
  return true;
}

export interface ClippingBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/**
 * Conservative AABB classification in world space. Local groups require the
 * object's transform; call once per instance for per-instance culling. An
 * ambiguous union is reported intersecting, never wrongly culled.
 */
export function classifyClippingBounds(binding: ClippingBinding, bounds: ClippingBounds, localToWorld?: ArrayLike<number>): "inside" | "outside" | "intersecting" {
  if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max) || bounds.min.length !== 3 || bounds.max.length !== 3 ||
      !bounds.min.every(Number.isFinite) || !bounds.max.every(Number.isFinite) || bounds.min.some((value, i) => value > bounds.max[i])) {
    throw new RangeError("Clipping bounds must be finite and ordered.");
  }
  let allInside = true;
  for (const group of binding.groups) {
    let groupInside = group.combine === "intersection";
    let groupOutside = group.combine === "union";
    if (group.space === "local" && !localToWorld) throw new RangeError("Local clipping bounds require a local-to-world transform.");
    for (let index = group.offset; index < group.offset + group.count; index += 1) {
      const i = index * 4;
      let plane: ClippingPlane = [binding.planes[i], binding.planes[i + 1], binding.planes[i + 2], binding.planes[i + 3]];
      if (group.space === "local") plane = transformClippingPlane(plane, localToWorld!);
      let min = plane[3];
      let max = plane[3];
      for (let axis = 0; axis < 3; axis += 1) {
        min += plane[axis] * (plane[axis] >= 0 ? bounds.min[axis] : bounds.max[axis]);
        max += plane[axis] * (plane[axis] >= 0 ? bounds.max[axis] : bounds.min[axis]);
      }
      if (group.combine === "intersection") {
        groupOutside ||= max < 0;
        groupInside &&= min >= 0;
      } else {
        groupOutside &&= max < 0;
        groupInside ||= min >= 0;
      }
    }
    if (groupOutside) return "outside";
    allInside &&= groupInside;
  }
  return allInside ? "inside" : "intersecting";
}
