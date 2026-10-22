/**
 * PRD-02 §7.1 — the neutral-room environment scene, ported verbatim from
 * three.js r185 examples/jsm/environments/RoomEnvironment.js (MIT).
 * Geometry/emissive values match the r185 file (node_modules/three, pinned
 * 0.185.1) so the CPU prefilter and the GPU path render the same neutral
 * studio, including the scene's y = -3.5 offset and the point-lit walls.
 */
export interface RoomBox {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotationY: number;
  /** Lambertian reflectance: r185 uses default (white) `MeshStandardMaterial`s → 1. */
  readonly albedo: readonly [number, number, number];
}
export interface RoomEmissivePanel {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotationY: number;
  readonly emissive: readonly [number, number, number]; // color × emissiveIntensity
}
export interface RoomPointLight {
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly distance: number;
  readonly decay: number;
  readonly position: readonly [number, number, number];
}
export interface RoomEnvironmentSceneDescriptor {
  readonly room: RoomBox;
  readonly boxes: readonly RoomBox[];
  readonly panels: readonly RoomEmissivePanel[];
  readonly light: RoomPointLight;
}

/** r185 `RoomEnvironment` sets `this.position.y = -3.5`: the whole room sits 3.5 below the capture point. */
export const ROOM_ENVIRONMENT_SCENE_OFFSET_Y = -3.5;

/** Panel emissive intensities, r185 verbatim. */
export const ROOM_ENVIRONMENT_PANEL_RADIANCES: readonly number[] = [50, 50, 17, 43, 20, 100];

export function createRoomEnvironmentScene(): RoomEnvironmentSceneDescriptor {
  const room: RoomBox = {
    position: [-0.757, 13.219, 0.717],
    scale: [31.713, 28.305, 28.591],
    rotationY: 0,
    albedo: [1, 1, 1]
  };
  const boxes: RoomBox[] = [
    { position: [-10.906, 2.009, 1.846], scale: [2.328, 7.905, 4.651], rotationY: -0.195, albedo: [1, 1, 1] },
    { position: [-5.607, -0.754, -0.758], scale: [1.970, 1.534, 3.955], rotationY: 0.994, albedo: [1, 1, 1] },
    { position: [6.167, 0.857, 7.803], scale: [3.927, 6.285, 3.687], rotationY: 0.561, albedo: [1, 1, 1] },
    { position: [-2.017, 0.018, 6.124], scale: [2.002, 4.566, 2.064], rotationY: 0.333, albedo: [1, 1, 1] },
    { position: [2.291, -0.756, -2.621], scale: [1.546, 1.552, 1.496], rotationY: -0.286, albedo: [1, 1, 1] },
    { position: [-2.193, -0.369, -5.547], scale: [3.875, 3.487, 2.986], rotationY: 0.516, albedo: [1, 1, 1] }
  ];
  const panels: RoomEmissivePanel[] = [
    { position: [-16.116, 14.37, 8.208], scale: [0.1, 2.428, 2.739], rotationY: 0, emissive: [50, 50, 50] },   // -x right
    { position: [-16.109, 18.021, -8.207], scale: [0.1, 2.425, 2.751], rotationY: 0, emissive: [50, 50, 50] }, // -x left
    { position: [14.904, 12.198, -1.832], scale: [0.15, 4.265, 6.331], rotationY: 0, emissive: [17, 17, 17] }, // +x
    { position: [-0.462, 8.89, 14.520], scale: [4.38, 5.441, 0.088], rotationY: 0, emissive: [43, 43, 43] },  // +z
    { position: [3.235, 11.486, -12.541], scale: [2.5, 2.0, 0.1], rotationY: 0, emissive: [20, 20, 20] },      // -z
    { position: [0.0, 20.0, 0.0], scale: [1.0, 0.1, 1.0], rotationY: 0, emissive: [100, 100, 100] }            // +y
  ];
  const light: RoomPointLight = {
    color: [1, 1, 1],
    intensity: 900,
    distance: 28,
    decay: 2,
    position: [0.418, 16.199, 0.300]
  };
  return { room, boxes, panels, light };
}

/* ---------------- analytic sampling (CPU prefilter input) ---------------- */

type Vec3Tuple = [number, number, number];
const sub = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3Tuple, s: number): Vec3Tuple => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3Tuple, b: Vec3Tuple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * World → box-local for a box with three's `rotation.y = angle`. three's
 * `makeRotationY(a)` maps local → world as x' = c·x + s·z, z' = −s·x + c·z,
 * so the inverse is x = c·x' − s·z', z = s·x' + c·z'.
 */
function rotateYInv(p: Vec3Tuple, angle: number): Vec3Tuple {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c];
}

/** Slab test vs an axis-aligned box (in the box's local frame). Returns hit t or -1. */
function slabHit(origin: Vec3Tuple, dir: Vec3Tuple, half: Vec3Tuple): number {
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const o = origin[i]!;
    const d = dir[i]!;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(o) > half[i]!) return -1;
      continue;
    }
    const t1 = (-half[i]! - o) / d;
    const t2 = (half[i]! - o) / d;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  // Inside the box (tMin < 0 < tMax) the exit face is at tMax; outside it is tMin.
  if (tMax < tMin || tMax <= 0) return -1;
  return tMin > 0 ? tMin : tMax;
}

function boxHit(origin: Vec3Tuple, dir: Vec3Tuple, box: { position: readonly number[]; scale: readonly number[]; rotationY: number }): number {
  const o = rotateYInv(sub(origin, box.position as Vec3Tuple), box.rotationY);
  const d = rotateYInv(dir, box.rotationY);
  return slabHit(o, d, [box.scale[0]! / 2, box.scale[1]! / 2, box.scale[2]! / 2]);
}

/** Physical point-light distance falloff, three r185 `getDistanceAttenuation`. */
function distanceAttenuation(d: number, cutoff: number, decay: number): number {
  let falloff = 1 / Math.max(d ** decay, 0.01);
  if (cutoff > 0) {
    const x = Math.min(Math.max(1 - (d / cutoff) ** 4, 0), 1);
    falloff *= x * x;
  }
  return falloff;
}

interface SurfaceHit {
  readonly t: number;
  readonly normal: Vec3Tuple;
}

/** Ray vs a Y-rotated box: hit distance and the world-space normal facing the ray. */
function boxSurfaceHit(origin: Vec3Tuple, dir: Vec3Tuple, box: { position: readonly number[]; scale: readonly number[]; rotationY: number }): SurfaceHit | null {
  const o = rotateYInv(sub(origin, box.position as Vec3Tuple), box.rotationY);
  const d = rotateYInv(dir, box.rotationY);
  const half: Vec3Tuple = [box.scale[0]! / 2, box.scale[1]! / 2, box.scale[2]! / 2];
  const t = slabHit(o, d, half);
  if (t <= 0) return null;
  // The hit face is the slab whose plane the local hit point lies on.
  const p = add(o, scale(d, t));
  let axis = 0;
  let best = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const gap = Math.abs(Math.abs(p[i]!) - half[i]!);
    if (gap < best) { best = gap; axis = i; }
  }
  // Facing the ray: outside faces (props) and the room's inner faces (BackSide) alike.
  const local: Vec3Tuple = [0, 0, 0];
  local[axis] = d[axis]! > 0 ? -1 : 1;
  const c = Math.cos(box.rotationY);
  const s = Math.sin(box.rotationY);
  return { t, normal: [local[0] * c + local[2] * s, local[1], -local[0] * s + local[2] * c] };
}

let cachedScene: RoomEnvironmentSceneDescriptor | null = null;

/**
 * Analytic radiance of the r185 room along `dir`, seen from the PMREM capture
 * point. three's `RoomEnvironment` shifts the whole scene by y = -3.5
 * (`this.position.y`), so the capture point sits at y = +3.5 in scene space.
 *
 *  - emissive panels (`MeshLambertMaterial`, black colour, white emissive ×
 *    intensity) → their emissive radiance;
 *  - room walls (BackSide) and prop boxes are default `MeshStandardMaterial`s
 *    (white, roughness 1, metalness 0): Lambertian albedo 1 lit only by the
 *    `PointLight(0xffffff, 900, 28, 2)`, i.e. `(1/π) · 900 · max(0, n·l) ·
 *    attenuation(d)`. No shadows: PMREM capture renders without shadow maps.
 *
 * Deterministic. Used by `environments bake` for the neutral preset, by the
 * neutral floor constants, and by tests against the pinned three file.
 */
export function sampleRoomEnvironment(dir: readonly [number, number, number]): Vec3Tuple {
  const scene = (cachedScene ??= createRoomEnvironmentScene());
  const origin: Vec3Tuple = [0, -ROOM_ENVIRONMENT_SCENE_OFFSET_Y, 0];
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const ray: Vec3Tuple = [dir[0] / len, dir[1] / len, dir[2] / len];
  let bestT = Infinity;
  let radiance: Vec3Tuple = [0, 0, 0];
  for (const panel of scene.panels) {
    const t = boxHit(origin, ray, panel);
    if (t > 0 && t < bestT) {
      bestT = t;
      radiance = [panel.emissive[0], panel.emissive[1], panel.emissive[2]];
    }
  }
  let surface: { hit: SurfaceHit; albedo: readonly [number, number, number] } | null = null;
  for (const box of [scene.room, ...scene.boxes]) {
    const hit = boxSurfaceHit(origin, ray, box);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      surface = { hit, albedo: box.albedo };
    }
  }
  if (surface) {
    const p = add(origin, scale(ray, surface.hit.t));
    const toLight = sub(scene.light.position as Vec3Tuple, p);
    const d = Math.hypot(toLight[0], toLight[1], toLight[2]);
    const nDotL = Math.max(0, dot(surface.hit.normal, scale(toLight, 1 / d)));
    const e = scene.light.intensity * nDotL * distanceAttenuation(d, scene.light.distance, scene.light.decay);
    radiance = [
      (surface.albedo[0] / Math.PI) * e * scene.light.color[0],
      (surface.albedo[1] / Math.PI) * e * scene.light.color[1],
      (surface.albedo[2] / Math.PI) * e * scene.light.color[2]
    ];
  }
  return radiance;
}
