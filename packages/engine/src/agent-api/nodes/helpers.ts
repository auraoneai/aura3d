// threejs-parity lane L6 (§5.6, SC-03 — P2): `helpers.*` debug glyphs composed
// entirely over `lines.*` — every helper returns an `AuraLineNode` builder
// (segment pairs, optionally vertex-coloured) drawn by the L6 line compiler.
// three.js counterparts: AxesHelper, GridHelper, PolarGridHelper, Box3Helper,
// ArrowHelper, CameraHelper, DirectionalLightHelper, SpotLightHelper,
// PointLightHelper, SkeletonHelper.

import { AuraNodeBuilder } from "./builder.js";
import { segments } from "./lines.js";
import type { AuraColor, AuraLineNode, AuraVec3 } from "./types.js";

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
  if (s.positions.length === 0) throw new Error(`helpers.${id} produced no segments`);
  const b = segments({ positions: s.positions, colors: s.colors, name: options.name, visible: options.visible, position: options.position, rotation: options.rotation, scale: options.scale });
  return b;
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
  const divisions = Math.max(1, Math.floor(options.divisions ?? 10));
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
  const sectors = Math.max(1, Math.floor(options.sectors ?? 16));
  const rings = Math.max(1, Math.floor(options.rings ?? 5));
  const division = Math.max(8, Math.floor(options.division ?? 64));
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
  if (!(far > near) || !(near > 0)) throw new Error("helpers.camera requires 0 < near < far");
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
  const target = options.target ?? [0, 0, 0];
  const s: Seg = { positions: [], colors: [] };
  const h = size / 2;
  const quad = [v(-h, h, 0), v(h, h, 0), v(h, -h, 0), v(-h, -h, 0)];
  for (let i = 0; i < 4; i += 1) push(s, quad[i]!, quad[(i + 1) % 4]!, color);
  // Rays toward the target (helper convention: glyph sits at position, −Z faces target).
  for (const off of [v(-h, h, 0), v(h, h, 0), v(0, 0, 0), v(-h, -h, 0), v(h, -h, 0)] as const) {
    push(s, off, [off[0], off[1], off[2] - size], color);
  }
  void target; // aim comes from the node rotation (lookAt the target on the builder)
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
  if (positions.length < 2) throw new Error("helpers.skeleton requires at least two joints");
  const s: Seg = { positions: [], colors: [] };
  for (let i = 0; i < positions.length; i += 1) {
    const parent = parents ? parents[i] : i - 1;
    if (parent === undefined || parent < 0 || parent === i) continue;
    if (parent >= positions.length) throw new Error(`helpers.skeleton parents[${i}] out of range`);
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
  skeleton
} as const;
