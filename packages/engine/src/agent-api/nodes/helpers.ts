// threejs-parity lane L6 (§5.6, SC-03 — P2): `helpers.*` debug glyphs composed
// entirely over `lines.*` — every helper returns an `AuraLineNode` builder
// (segment pairs, optionally vertex-coloured) drawn by the L6 line compiler.
// three.js counterparts: AxesHelper, GridHelper, PolarGridHelper, Box3Helper,
// ArrowHelper, CameraHelper, DirectionalLightHelper, SpotLightHelper,
// PointLightHelper, SkeletonHelper.

import { AuraNodeBuilder } from "./builder.js";
import { normalizeLinePositions, segments } from "./lines.js";
import type { AuraApp, AuraColor, AuraLineNode, AuraRuntimeNodeHandle, AuraVec3 } from "./types.js";
import {
  buildAnimationPathHelper, buildAreaLightHelper, buildAudioOrientationHelper,
  buildColliderHelper, buildOctreeHelper, buildProbeGridHelper, buildProbeHelper,
  buildTangentHelper, buildTextureHelper, buildVertexNormalHelper,
  type AnimationPathHelperOptions, type AreaLightHelperOptions, type AudioOrientationHelperOptions,
  type ColliderHelperOptions, type OctreeHelperOptions, type ProbeGridHelperOptions,
  type ProbeHelperOptions, type TangentHelperOptions, type TextureHelperOptions,
  type VertexNormalHelperOptions
} from "@aura3d/debug/helpers";
import type { DebugRenderLine } from "@aura3d/debug";

export interface AuraHelperBaseOptions {
  readonly name?: string;
  readonly visible?: boolean;
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly scale?: number | AuraVec3;
}

interface Seg {
  readonly positions: AuraVec3[];
  readonly colors: AuraColor[];
}

const push = (s: Seg, a: AuraVec3, b: AuraVec3, color: AuraColor): void => {
  s.positions.push(a, b);
  s.colors.push(color, color);
};

const v = (x: number, y: number, z: number): AuraVec3 => [x, y, z];

function build(id: string, s: Seg, options: AuraHelperBaseOptions = {}): AuraNodeBuilder<AuraLineNode> {
  // An empty line node is useful while a live source has no geometry yet.
  void id;
  const b = segments({ positions: s.positions, colors: s.colors, name: options.name, visible: options.visible, position: options.position, rotation: options.rotation, scale: options.scale });
  return b;
}

type AdvancedOptions<T> = Omit<T, "color"> & AuraHelperBaseOptions & { readonly color?: AuraColor };

function advanced(lines: readonly DebugRenderLine[], options: AuraHelperBaseOptions & { readonly color?: AuraColor }): AuraNodeBuilder<AuraLineNode> {
  const s: Seg = { positions: [], colors: [] };
  for (const line of lines) {
    // Preserve texture transparency in the line's per-vertex color; the line
    // compiler selects blending whenever any endpoint carries alpha.
    const channels = line.color[3] === 1 ? line.color.slice(0, 3) : line.color;
    const color = options.color ?? `#${channels.map((n) => Math.round(n * 255).toString(16).padStart(2, "0")).join("")}`;
    push(s, line.from, line.to, color);
  }
  return build("advanced", s, options);
}

/** A sampled animation path; supply current points again to `helpers.dynamic` for live updates. */
export function animationPath(options: AdvancedOptions<AnimationPathHelperOptions>): AuraNodeBuilder<AuraLineNode> {
  return advanced(buildAnimationPathHelper({ points: options.points, closed: options.closed }), options);
}
export function audioOrientation(options: AdvancedOptions<AudioOrientationHelperOptions>): AuraNodeBuilder<AuraLineNode> {
  return advanced(buildAudioOrientationHelper({ origin: options.origin, direction: options.direction, up: options.up, length: options.length }), options);
}
export function probe(options: AdvancedOptions<ProbeHelperOptions> = {}): AuraNodeBuilder<AuraLineNode> {
  return advanced(buildProbeHelper({ center: options.center, size: options.size, segments: options.segments }), options);
}
export function probeGrid(options: AdvancedOptions<ProbeGridHelperOptions>): AuraNodeBuilder<AuraLineNode> {
  return advanced(buildProbeGridHelper({ min: options.min, max: options.max, divisions: options.divisions, size: options.size, maxProbes: options.maxProbes }), options);
}
export function octree(options: AdvancedOptions<OctreeHelperOptions>): AuraNodeBuilder<AuraLineNode> {
  return advanced(buildOctreeHelper({ root: options.root, maxDepth: options.maxDepth, maxNodes: options.maxNodes }), options);
}
export function collider(options: AdvancedOptions<ColliderHelperOptions>): AuraNodeBuilder<AuraLineNode> {
  return advanced(buildColliderHelper({ shape: options.shape, planeSize: options.planeSize, segments: options.segments }), options);
}
export function areaLight(options: AdvancedOptions<AreaLightHelperOptions>): AuraNodeBuilder<AuraLineNode> {
  return advanced(buildAreaLightHelper({ width: options.width, height: options.height, length: options.length }), options);
}
export function texture(options: TextureHelperOptions & AuraHelperBaseOptions): AuraNodeBuilder<AuraLineNode> {
  return advanced(buildTextureHelper(options), options);
}
export function vertexNormals(options: AdvancedOptions<VertexNormalHelperOptions>): AuraNodeBuilder<AuraLineNode> {
  return advanced(buildVertexNormalHelper({ positions: options.positions, normals: options.normals, length: options.length, transform: options.transform }), options);
}
export function tangents(options: AdvancedOptions<TangentHelperOptions>): AuraNodeBuilder<AuraLineNode> {
  return advanced(buildTangentHelper({ positions: options.positions, tangents: options.tangents, length: options.length, transform: options.transform }), options);
}

export interface AuraDynamicHelperOptions {
  readonly id?: string;
  readonly parent?: string;
  readonly visible?: boolean;
}

export interface AuraDynamicHelper {
  readonly id: string;
  readonly disposed: boolean;
  readonly handle: AuraRuntimeNodeHandle | undefined;
  /** Sample the latest source immediately; frame callbacks also sample it. */
  update(): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

let nextHelperId = 0;

/**
 * Mount a scene-driven helper and resample it on app frames. The current line
 * compiler owns immutable geometry, so a changed node is replaced through the
 * runtime registry and its prior GPU resource is disposed by that registry.
 * Unchanged nodes are retained. Empty nodes are valid and draw nothing.
 */
export function dynamic(
  app: Pick<AuraApp, "nodes" | "onFrame">,
  read: () => AuraNodeBuilder<AuraLineNode> | AuraLineNode,
  options: AuraDynamicHelperOptions = {}
): AuraDynamicHelper {
  const registry = app.nodes;
  if (typeof registry.add !== "function" || typeof registry.remove !== "function") throw new Error("helpers.dynamic requires a runtime registry with add and remove support.");
  const add = registry.add.bind(registry), remove = registry.remove.bind(registry);
  let id = options.id;
  if (id !== undefined && (typeof id !== "string" || !id.trim())) throw new Error("helpers.dynamic id must be a non-empty string.");
  if (id === undefined) do { id = `aura-helper-${++nextHelperId}`; } while (registry.has(id));
  if (registry.has(id)) throw new Error(`helpers.dynamic node id '${id}' is already in use.`);
  const ownedId = id;
  const ownerTag = `aura-helper-owner-${++nextHelperId}`;
  let closed = false;
  let shown = options.visible ?? true;
  let current: AuraRuntimeNodeHandle | undefined;
  let previous: AuraLineNode | undefined;
  let signature: string | undefined;
  let unsubscribe: (() => void) | undefined;

  function update(): void {
    if (closed) throw new Error("helpers.dynamic has been disposed.");
    const supplied = read();
    // Readers may tear the helper down while reacting to scene state.
    if (closed) return;
    const value = supplied instanceof AuraNodeBuilder ? supplied.toJSON() : supplied;
    if (!value || value.kind !== "line" || value.line !== "segments") throw new Error("helpers.dynamic requires a line-segments helper.");
    const positions = normalizeLinePositions(value.positions, 2, "helpers.dynamic");
    if (positions.length % 2 !== 0 || positions.some((p) => !p.every(Number.isFinite))) throw new Error("helpers.dynamic positions must contain finite segment pairs.");
    if (value.colors !== undefined && value.colors.length !== positions.length) throw new Error("helpers.dynamic colors must match the position count.");
    const next: AuraLineNode = { ...value, positions, runtime: { ...value.runtime, id: ownedId, mutable: true, tags: [...(value.runtime?.tags ?? []), ownerTag] }, visible: shown && value.visible !== false };
    const nextSignature = JSON.stringify(next);
    const registered = registry.get(ownedId);
    if (registered && !registered.tags.includes(ownerTag)) throw new Error(`helpers.dynamic node id '${ownedId}' is now owned by another node.`);
    if (registered) current = registered;
    else if (current) { current = undefined; previous = undefined; signature = undefined; }
    if (nextSignature === signature) return;
    if (current) remove(ownedId);
    try {
      current = add(next, options.parent === undefined ? undefined : { parent: options.parent });
      previous = next;
      signature = nextSignature;
    } catch (error) {
      current = undefined;
      // The compiler may have inserted a subtree before compilation failed.
      // Its registry removal also cleans partially added subtrees with no handle.
      try {
        const owner = registry.get(ownedId);
        if (!owner || owner.tags.includes(ownerTag)) remove(ownedId);
      } catch { /* Preserve the original compilation error. */ }
      if (previous) {
        try { current = add(previous, options.parent === undefined ? undefined : { parent: options.parent }); }
        catch { previous = undefined; signature = undefined; }
      }
      throw error;
    }
  }

  update();
  try { unsubscribe = app.onFrame(() => { if (!closed) update(); }); }
  catch (error) { remove(ownedId); throw error; }

  return {
    id: ownedId,
    get disposed() { return closed; },
    get handle() { return current; },
    update,
    setVisible(visible) {
      if (closed) throw new Error("helpers.dynamic has been disposed.");
      shown = visible;
      // Rebuild handles authored visibility and the explicit visibility gate consistently.
      update();
    },
    dispose() {
      if (closed) return;
      closed = true;
      const off = unsubscribe;
      unsubscribe = undefined;
      try { off?.(); }
      finally {
        if (registry.get(ownedId)?.tags.includes(ownerTag)) remove(ownedId);
        current = undefined;
        previous = undefined;
      }
    }
  };
}

/** `helpers.axes({ size = 1 })` — X red, Y green, Z blue (three's `AxesHelper`). */
export function axes(options: AuraHelperBaseOptions & { readonly size?: number } = {}): AuraNodeBuilder<AuraLineNode> {
  const size = options.size ?? 1;
  if (!Number.isFinite(size) || size <= 0) throw new Error("helpers.axes size must be a positive finite number");
  const s: Seg = { positions: [], colors: [] };
  push(s, v(0, 0, 0), v(size, 0, 0), "#ff0000");
  push(s, v(0, 0, 0), v(0, size, 0), "#00ff00");
  push(s, v(0, 0, 0), v(0, 0, size), "#0000ff");
  return build("axes", s, options);
}

/** `helpers.grid({ size = 10, divisions = 10, colorCenterLine?, colorGrid? })` — XZ grid (three's `GridHelper`). */
export function grid(options: AuraHelperBaseOptions & {
  readonly size?: number;
  readonly divisions?: number;
  readonly colorCenterLine?: AuraColor;
  readonly colorGrid?: AuraColor;
} = {}): AuraNodeBuilder<AuraLineNode> {
  const size = options.size ?? 10;
  const rawDivisions = options.divisions ?? 10;
  if (!Number.isFinite(rawDivisions) || rawDivisions > 65535) throw new RangeError("helpers.grid divisions must be finite and at most 65535");
  const divisions = Math.max(1, Math.floor(rawDivisions));
  const center = options.colorCenterLine ?? "#444444";
  const color = options.colorGrid ?? "#888888";
  if (!Number.isFinite(size) || size <= 0) throw new Error("helpers.grid size must be a positive finite number");
  const half = size / 2;
  const step = size / divisions;
  const s: Seg = { positions: [], colors: [] };
  for (let i = 0; i <= divisions; i += 1) {
    const t = -half + i * step;
    const c = i === Math.floor(divisions / 2) && divisions % 2 === 0 ? center : color;
    push(s, v(t, 0, -half), v(t, 0, half), c);
    push(s, v(-half, 0, t), v(half, 0, t), c);
  }
  return build("grid", s, options);
}

/** `helpers.polarGrid({ radius = 10, sectors = 16, rings = 5, division = 64 })` (three's `PolarGridHelper`). */
export function polarGrid(options: AuraHelperBaseOptions & {
  readonly radius?: number;
  readonly sectors?: number;
  readonly rings?: number;
  readonly division?: number;
  readonly colorCenterLine?: AuraColor;
  readonly colorGrid?: AuraColor;
} = {}): AuraNodeBuilder<AuraLineNode> {
  const radius = options.radius ?? 10;
  const rawSectors = options.sectors ?? 16;
  const rawRings = options.rings ?? 5;
  const rawDivision = options.division ?? 64;
  if (![rawSectors, rawRings, rawDivision].every(Number.isFinite)) throw new RangeError("helpers.polarGrid segment counts must be finite");
  const sectors = Math.max(1, Math.floor(rawSectors));
  const rings = Math.max(1, Math.floor(rawRings));
  const division = Math.max(8, Math.floor(rawDivision));
  if (sectors + rings * division > 262144) throw new RangeError("helpers.polarGrid exceeds 262144 segments");
  const spoke = options.colorCenterLine ?? "#444444";
  const ring = options.colorGrid ?? "#888888";
  if (!Number.isFinite(radius) || radius <= 0) throw new Error("helpers.polarGrid radius must be a positive finite number");
  const s: Seg = { positions: [], colors: [] };
  // Concentric rings (segment pairs around each circle, closing included).
  for (let r = 1; r <= rings; r += 1) {
    const rr = (radius * r) / rings;
    for (let i = 0; i < division; i += 1) {
      const a0 = (i / division) * Math.PI * 2;
      const a1 = ((i + 1) / division) * Math.PI * 2;
      push(s, v(Math.cos(a0) * rr, 0, Math.sin(a0) * rr), v(Math.cos(a1) * rr, 0, Math.sin(a1) * rr), ring);
    }
  }
  // Radial spokes.
  for (let i = 0; i < sectors; i += 1) {
    const a = (i / sectors) * Math.PI * 2;
    push(s, v(0, 0, 0), v(Math.cos(a) * radius, 0, Math.sin(a) * radius), spoke);
  }
  return build("polarGrid", s, options);
}

/** `helpers.box3({ min, max })` — the 12 edges of an AABB (three's `Box3Helper`). */
export function box3(options: AuraHelperBaseOptions & {
  readonly min: AuraVec3;
  readonly max: AuraVec3;
  readonly color?: AuraColor;
}): AuraNodeBuilder<AuraLineNode> {
  const [ax, ay, az] = options.min;
  const [bx, by, bz] = options.max;
  if (![ax, ay, az, bx, by, bz].every(Number.isFinite) || bx < ax || by < ay || bz < az) throw new RangeError("helpers.box3 requires finite min <= max on each axis");
  const color = options.color ?? "#ffff00";
  const s: Seg = { positions: [], colors: [] };
  const c = [
    v(ax, ay, az), v(bx, ay, az), v(bx, ay, bz), v(ax, ay, bz),
    v(ax, by, az), v(bx, by, az), v(bx, by, bz), v(ax, by, bz)
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
  for (const [a, b] of edges) push(s, c[a]!, c[b]!, color);
  return build("box3", s, options);
}

/** `helpers.box({ size = 1, center = [0,0,0] })` — centred AABB convenience over `box3` (three's `BoxHelper` static form). */
export function box(options: AuraHelperBaseOptions & { readonly size?: number | AuraVec3; readonly center?: AuraVec3; readonly color?: AuraColor } = {}): AuraNodeBuilder<AuraLineNode> {
  const center = options.center ?? [0, 0, 0];
  const size = typeof options.size === "number" ? [options.size, options.size, options.size] as const : options.size ?? [1, 1, 1] as const;
  return box3({
    ...options,
    min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
    max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2]
  });
}

/** `helpers.arrow({ dir, origin?, length?, headLength?, headWidth?, color? })` (three's `ArrowHelper`, line-only). */
export function arrow(options: AuraHelperBaseOptions & {
  readonly dir: AuraVec3;
  readonly origin?: AuraVec3;
  readonly length?: number;
  readonly headLength?: number;
  readonly headWidth?: number;
  readonly color?: AuraColor;
}): AuraNodeBuilder<AuraLineNode> {
  const dir = normalize3(options.dir);
  if (dir === null) throw new Error("helpers.arrow dir must be a non-zero finite vec3");
  const origin = options.origin ?? [0, 0, 0];
  const length = options.length ?? 1;
  const headLength = Math.min(options.headLength ?? length * 0.2, length * 0.999);
  const headWidth = options.headWidth ?? headLength * 0.5;
  if (!origin.every(Number.isFinite) || !Number.isFinite(length) || length <= 0 || !Number.isFinite(headLength) || headLength < 0 || !Number.isFinite(headWidth) || headWidth < 0) throw new RangeError("helpers.arrow requires finite origin, positive length and non-negative head dimensions");
  const color = options.color ?? "#ffff00";
  const tip: AuraVec3 = [origin[0] + dir[0] * length, origin[1] + dir[1] * length, origin[2] + dir[2] * length];
  // Two perpendicular vectors spanning the plane ⊥ dir for the V-fins.
  const up = Math.abs(dir[1]) < 0.95 ? v(0, 1, 0) : v(1, 0, 0);
  const u = normalize3(cross3(dir, up))!;
  const w = normalize3(cross3(dir, u))!;
  const base: AuraVec3 = [tip[0] - dir[0] * headLength, tip[1] - dir[1] * headLength, tip[2] - dir[2] * headLength];
  const s: Seg = { positions: [], colors: [] };
  push(s, origin, tip, color);
  for (const axis of [u, w] as const) {
    for (const sign of [-1, 1] as const) {
      push(s, tip, [base[0] + axis[0] * headWidth * sign, base[1] + axis[1] * headWidth * sign, base[2] + axis[2] * headWidth * sign], color);
    }
  }
  return build("arrow", s, options);
}

/** `helpers.camera({ position?, rotation?, fov?, aspect?, near?, far? })` — frustum lines (three's `CameraHelper`, static pose form). */
export function camera(options: AuraHelperBaseOptions & {
  readonly fov?: number;
  readonly aspect?: number;
  readonly near?: number;
  readonly far?: number;
  readonly color?: AuraColor;
} = {}): AuraNodeBuilder<AuraLineNode> {
  const fov = (options.fov ?? 50) * (Math.PI / 180);
  const aspect = options.aspect ?? 1;
  const near = options.near ?? 1;
  const far = options.far ?? 100;
  const color = options.color ?? "#ffffff";
  if (![fov, aspect, near, far].every(Number.isFinite) || !(far > near) || !(near > 0) || !(aspect > 0) || !(fov > 0 && fov < Math.PI)) throw new Error("helpers.camera requires finite 0 < near < far, positive aspect and fov in (0, 180)");
  const nh = Math.tan(fov / 2) * near;
  const nw = nh * aspect;
  const fh = Math.tan(fov / 2) * far;
  const fw = fh * aspect;
  const s: Seg = { positions: [], colors: [] };
  // near rect (z = −near, camera looks down −Z like three's convention)
  const nr = [v(-nw, -nh, -near), v(nw, -nh, -near), v(nw, nh, -near), v(-nw, nh, -near)];
  const fr = [v(-fw, -fh, -far), v(fw, -fh, -far), v(fw, fh, -far), v(-fw, fh, -far)];
  for (let i = 0; i < 4; i += 1) {
    push(s, nr[i]!, nr[(i + 1) % 4]!, color);
    push(s, fr[i]!, fr[(i + 1) % 4]!, color);
    push(s, nr[i]!, fr[i]!, color);
    push(s, v(0, 0, 0), nr[i]!, color); // eye → near corners (three's camera glyph)
  }
  return build("camera", s, options);
}

/** `helpers.directionalLight({ position?, target?, size?, color? })` — plane glyph + rays (three's `DirectionalLightHelper`). */
export function directionalLight(options: AuraHelperBaseOptions & {
  readonly target?: AuraVec3;
  readonly size?: number;
  readonly color?: AuraColor;
} = {}): AuraNodeBuilder<AuraLineNode> {
  const size = options.size ?? 1;
  const color = options.color ?? "#ffffff";
  if (!Number.isFinite(size) || size <= 0) throw new RangeError("helpers.directionalLight size must be positive and finite");
  const origin = options.position ?? [0, 0, 0];
  if (!origin.every(Number.isFinite)) throw new RangeError("helpers.directionalLight position must be finite");
  if (options.target !== undefined && options.rotation !== undefined) throw new Error("helpers.directionalLight accepts target or rotation, not both");
  const dir = options.target === undefined ? v(0, 0, -1) : normalize3([options.target[0] - origin[0], options.target[1] - origin[1], options.target[2] - origin[2]]);
  if (!dir) throw new Error("helpers.directionalLight target must differ from position and be finite");
  const up = Math.abs(dir[1]) < 0.95 ? v(0, 1, 0) : v(1, 0, 0);
  const right = normalize3(cross3(dir, up))!;
  const vertical = normalize3(cross3(right, dir))!;
  const s: Seg = { positions: [], colors: [] };
  const h = size / 2;
  const onPlane = (x: number, y: number): AuraVec3 => [right[0] * x + vertical[0] * y, right[1] * x + vertical[1] * y, right[2] * x + vertical[2] * y];
  const quad = [onPlane(-h, h), onPlane(h, h), onPlane(h, -h), onPlane(-h, -h)];
  for (let i = 0; i < 4; i += 1) push(s, quad[i]!, quad[(i + 1) % 4]!, color);
  for (const off of [...quad, v(0, 0, 0)]) {
    push(s, off, [off[0] + dir[0] * size, off[1] + dir[1] * size, off[2] + dir[2] * size], color);
  }
  return build("directionalLight", s, options);
}

/** `helpers.pointLight({ sphereSize?, distance?, color? })` — wireframe bulb rings (three's `PointLightHelper`). */
export function pointLight(options: AuraHelperBaseOptions & {
  readonly sphereSize?: number;
  readonly color?: AuraColor;
} = {}): AuraNodeBuilder<AuraLineNode> {
  const r = options.sphereSize ?? 0.5;
  const color = options.color ?? "#ffffff";
  if (!Number.isFinite(r) || r <= 0) throw new Error("helpers.pointLight sphereSize must be a positive finite number");
  const s: Seg = { positions: [], colors: [] };
  const seg = 24;
  for (const project of [
    (a: number): AuraVec3 => v(Math.cos(a) * r, Math.sin(a) * r, 0),
    (a: number): AuraVec3 => v(Math.cos(a) * r, 0, Math.sin(a) * r),
    (a: number): AuraVec3 => v(0, Math.cos(a) * r, Math.sin(a) * r)
  ] as const) {
    for (let i = 0; i < seg; i += 1) {
      push(s, project((i / seg) * Math.PI * 2), project(((i + 1) / seg) * Math.PI * 2), color);
    }
  }
  return build("pointLight", s, options);
}

/** `helpers.spotLight({ angle?, distance?, color? })` — cone wireframe (three's `SpotLightHelper`). */
export function spotLight(options: AuraHelperBaseOptions & {
  readonly angle?: number;
  readonly distance?: number;
  readonly color?: AuraColor;
} = {}): AuraNodeBuilder<AuraLineNode> {
  const angle = options.angle ?? Math.PI / 3;
  const distance = options.distance ?? 10;
  const color = options.color ?? "#ffffff";
  if (!(angle > 0 && angle < Math.PI / 2)) throw new Error("helpers.spotLight angle must be in (0, π/2)");
  if (!Number.isFinite(distance) || distance <= 0) throw new Error("helpers.spotLight distance must be a positive finite number");
  const r = Math.tan(angle) * distance;
  const s: Seg = { positions: [], colors: [] };
  const seg = 24;
  for (let i = 0; i < seg; i += 1) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    push(s, v(Math.cos(a0) * r, Math.sin(a0) * r, -distance), v(Math.cos(a1) * r, Math.sin(a1) * r, -distance), color);
  }
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const) {
    push(s, v(0, 0, 0), v(Math.cos(a) * r, Math.sin(a) * r, -distance), color);
  }
  return build("spotLight", s, options);
}

/**
 * `helpers.skeleton({ positions, parents? })` — bone lines joint→parent
 * (three's `SkeletonHelper` static form). `parents[i]` is the parent joint
 * index, `-1` for roots; absent → a sequential chain.
 */
export function skeleton(options: AuraHelperBaseOptions & {
  readonly positions: readonly AuraVec3[];
  readonly parents?: readonly number[];
  readonly color?: AuraColor;
}): AuraNodeBuilder<AuraLineNode> {
  const { positions, parents } = options;
  const color = options.color ?? "#00e5ff";
  if (positions.length > 262144) throw new RangeError("helpers.skeleton exceeds 262144 joints");
  if (parents && parents.length !== positions.length) throw new Error("helpers.skeleton parents must match the joint count");
  const s: Seg = { positions: [], colors: [] };
  for (let i = 0; i < positions.length; i += 1) {
    if (positions[i]!.length !== 3 || !positions[i]!.every(Number.isFinite)) throw new Error(`helpers.skeleton position ${i} must be a finite vec3`);
    const parent = parents ? parents[i] : i - 1;
    if (parent === undefined || !Number.isInteger(parent) || parent < -1 || parent >= positions.length) throw new Error(`helpers.skeleton parents[${i}] out of range`);
    if (parent === -1 || parent === i) continue;
    push(s, positions[parent]!, positions[i]!, color);
  }
  return build("skeleton", s, options);
}

function normalize3(a: AuraVec3): AuraVec3 | null {
  const l = Math.hypot(a[0], a[1], a[2]);
  if (!Number.isFinite(l) || l <= 0) return null;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function cross3(a: AuraVec3, b: AuraVec3): AuraVec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** `helpers.*` namespace (SC-03): every glyph is a real line-segment node. */
export const helpers = {
  axes,
  grid,
  polarGrid,
  box,
  box3,
  arrow,
  camera,
  directionalLight,
  spotLight,
  pointLight,
  skeleton,
  animationPath,
  audioOrientation,
  probe,
  probeGrid,
  octree,
  collider,
  areaLight,
  texture,
  vertexNormals,
  tangents,
  dynamic
} as const;
