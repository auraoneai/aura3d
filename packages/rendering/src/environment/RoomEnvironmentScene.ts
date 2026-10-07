/**
 * PRD-02 §7.1 — the neutral-room environment scene, ported verbatim from
 * three.js r185 examples/jsm/environments/RoomEnvironment.js (MIT).
 * Geometry/emissive values match the r185 file so the CPU prefilter and the
 * GPU path render the same neutral studio.
 */
export interface RoomBox {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotationY: number;
  /** Non-emissive reflectance (walls use ≈0.32 white lambertian). */
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

/** Panel emissive intensities, r185 verbatim. */
export const ROOM_ENVIRONMENT_PANEL_RADIANCES: readonly number[] = [50, 50, 17, 43, 20, 100];

export function createRoomEnvironmentScene(): RoomEnvironmentSceneDescriptor {
  const room: RoomBox = {
    position: [-0.757, 13.219, 0.717],
    scale: [31.713, 28.305, 28.591],
    rotationY: 0,
    albedo: [0.32, 0.32, 0.32]
  };
  const boxes: RoomBox[] = [
    { position: [-10.906, 2.009, 1.846], scale: [2.328, 7.905, 4.651], rotationY: -0.195, albedo: [0.3, 0.3, 0.3] },
    { position: [-5.607, -0.754, -0.758], scale: [1.970, 1.534, 3.955], rotationY: 0.994, albedo: [0.3, 0.3, 0.3] },
    { position: [6.167, 0.857, 7.803], scale: [3.927, 6.285, 3.687], rotationY: 0.561, albedo: [0.3, 0.3, 0.3] },
    { position: [-2.017, 0.018, 6.124], scale: [2.002, 4.566, 2.064], rotationY: 0.333, albedo: [0.3, 0.3, 0.3] },
    { position: [2.291, -0.756, -2.621], scale: [1.546, 1.552, 1.496], rotationY: -0.286, albedo: [0.3, 0.3, 0.3] },
    { position: [-2.193, -0.369, -5.547], scale: [3.875, 3.487, 2.986], rotationY: 0.516, albedo: [0.3, 0.3, 0.3] }
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

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function rotateYInv(p: V3, angle: number): V3 {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  return [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c];
}

/** Slab test vs an axis-aligned box (in the box's local frame). Returns hit t or -1. */
function slabHit(origin: V3, dir: V3, half: V3): number {
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

function boxHit(origin: V3, dir: V3, box: { position: readonly number[]; scale: readonly number[]; rotationY: number }): number {
  const o = rotateYInv(sub(origin, box.position as V3), box.rotationY);
  const d = rotateYInv(dir, box.rotationY);
  return slabHit(o, d, [box.scale[0]! / 2, box.scale[1]! / 2, box.scale[2]! / 2]);
}

/**
 * Analytic radiance of the room scene along `dir` from the origin:
 * nearest of (emissive panels → their emissive) and (room interior walls,
 * boxes → lambertian bounce ≈ albedo/π attenuated by distance, floor a bit
 * darker). Deterministic — used by `environments bake` for the neutral
 * preset and by tests comparing against the r185 source.
 */
export function sampleRoomEnvironment(dir: readonly [number, number, number]): V3 {
  const scene = createRoomEnvironmentScene();
  const origin: V3 = [0, 0, 0];
  let bestT = Infinity;
  let radiance: V3 = [0, 0, 0];
  for (const panel of scene.panels) {
    const t = boxHit(origin, dir as V3, panel);
    if (t > 0 && t < bestT) {
      bestT = t;
      radiance = [panel.emissive[0], panel.emissive[1], panel.emissive[2]];
    }
  }
  const wallT = boxHit(origin, dir as V3, scene.room);
  for (const box of scene.boxes) {
    const t = boxHit(origin, dir as V3, box);
    if (t > 0 && t < bestT && t < wallT) {
      bestT = t;
      const hit = add(origin, scale(dir as V3, t));
      const darkening = hit[1] < scene.room.position[1] ? 0.6 : 1.0; // lower boxes shade
      const l = 0.32 * darkening / Math.PI;
      radiance = [l, l, l];
    }
  }
  if (bestT === Infinity && wallT > 0) {
    const hit = add(origin, scale(dir as V3, wallT));
    const floorish = dir[1] < -0.2 ? 0.05 : 0.0;
    const l = 0.32 / Math.PI + floorish;
    radiance = [l, l, l];
  }
  return radiance;
}
