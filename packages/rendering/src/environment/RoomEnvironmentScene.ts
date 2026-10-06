/**
 * PRD-02 §6.2 / §7.2 — the neutral-room environment scene: a TS port of
 * three r185 `examples/jsm/environments/RoomEnvironment.js` (MIT —
 * Copyright © 2010-2025 three.js authors). Emits plain descriptors —
 * box meshes, one point light, six emissive panels with the r185
 * radiances — so both the CPU prefilter (rasterize-free: the panels are
 * analytic) and the GPU `EnvironmentCaptureRequest` path can render the
 * identical room.
 *
 * Radiances carried by `emissiveIntensity`: 50, 50, 17, 43, 20, 100
 * (r185 RoomEnvironment.js:106-136).
 */

export interface RoomBox {
  readonly position: readonly [number, number, number];
  readonly rotationY: number;                    // radians
  readonly scale: readonly [number, number, number];
}
export interface RoomEmissivePanel extends RoomBox {
  /** Linear emissive radiance multiplier (the r185 createAreaLightMaterial values). */
  readonly emissiveIntensity: number;
  readonly emissiveColor: readonly [number, number, number];
}
export interface RoomPointLight {
  readonly position: readonly [number, number, number];
  readonly color: readonly [number, number, number];
  /** Luminous power in three units (r185: 900 lm, decay 2, distance 28). */
  readonly intensity: number;
  readonly distance: number;
  readonly decay: number;
}
export interface RoomEnvironmentSceneDescriptor {
  /** Scene-level offset (r185 `scene.position.y = -3.5`). */
  readonly offsetY: number;
  /** The room shell — BackSide box. */
  readonly room: RoomBox;
  /** Six furniture boxes (r185 InstancedMesh). */
  readonly boxes: readonly RoomBox[];
  /** Six emissive panels with the r185 radiances. */
  readonly panels: readonly RoomEmissivePanel[];
  readonly light: RoomPointLight;
}

export const ROOM_ENVIRONMENT_PANEL_RADIANCES: readonly [number, number, number, number, number, number] = [50, 50, 17, 43, 20, 100];

export function createRoomEnvironmentScene(): RoomEnvironmentSceneDescriptor {
  return {
    offsetY: -3.5,
    room: { position: [-0.757, 13.219, 0.717], rotationY: 0, scale: [31.713, 28.305, 28.591] },
    boxes: [
      { position: [-10.906, 2.009, 1.846], rotationY: -0.195, scale: [2.328, 7.905, 4.651] },
      { position: [-5.607, -0.754, -0.758], rotationY: 0.994, scale: [1.97, 1.534, 3.955] },
      { position: [6.167, 0.857, 7.803], rotationY: 0.561, scale: [3.927, 6.285, 3.687] },
      { position: [-2.017, 0.018, 6.124], rotationY: 0.333, scale: [2.002, 4.566, 2.064] },
      { position: [2.291, -0.756, -2.621], rotationY: -0.286, scale: [1.546, 1.552, 1.496] },
      { position: [-2.193, -0.369, -5.547], rotationY: 0.516, scale: [3.875, 3.487, 2.986] }
    ],
    panels: [
      // -x right
      { position: [-16.116, 14.37, 8.208], rotationY: 0, scale: [0.1, 2.428, 2.739], emissiveIntensity: 50, emissiveColor: [1, 1, 1] },
      // -x left
      { position: [-16.109, 18.021, -8.207], rotationY: 0, scale: [0.1, 2.425, 2.751], emissiveIntensity: 50, emissiveColor: [1, 1, 1] },
      // +x
      { position: [14.904, 12.198, -1.832], rotationY: 0, scale: [0.15, 4.265, 6.331], emissiveIntensity: 17, emissiveColor: [1, 1, 1] },
      // +z
      { position: [-0.462, 8.89, 14.52], rotationY: 0, scale: [4.38, 5.441, 0.088], emissiveIntensity: 43, emissiveColor: [1, 1, 1] },
      // -z
      { position: [3.235, 11.486, -12.541], rotationY: 0, scale: [2.5, 2.0, 0.1], emissiveIntensity: 20, emissiveColor: [1, 1, 1] },
      // +y
      { position: [0.0, 20.0, 0.0], rotationY: 0, scale: [1.0, 0.1, 1.0], emissiveIntensity: 100, emissiveColor: [1, 1, 1] }
    ],
    light: {
      position: [0.418, 16.199, 0.3],
      color: [1, 1, 1],
      intensity: 900,
      distance: 28,
      decay: 2
    }
  };
}

/**
 * Sample the neutral room analytically: radiance arriving at the origin
 * from direction `dir`. The room is a closed box; the panels are its only
 * emitters (the point light illuminates surfaces inside — approximated by
 * the panels on the CPU path, matching how three's PMREM treats the
 * emissive-only panels). Returns HDR radiance. Used by the worker
 * prefilter so `neutral(tier)` needs no GL round-trip.
 */
export function sampleRoomEnvironment(dir: readonly [number, number, number]): [number, number, number] {
  const scene = ROOM_SCENE;
  const hit = intersectRoom(dir, scene.room);
  if (!hit) return [0, 0, 0];
  // Ray through the room box: the first surface hit decides the emission.
  for (const panel of scene.panels) {
    if (intersectPanel(dir, panel, hit.t)) {
      return [panel.emissiveIntensity, panel.emissiveIntensity, panel.emissiveIntensity];
    }
  }
  // Non-emitter wall: lit by the panel array + point light — modeled as a
  // dim albedo response so the room isn't black (r185 PMREM shows ~0.8).
  const px = hit.point[0] - scene.room.position[0];
  const py = hit.point[1] - scene.room.position[1];
  const pz = hit.point[2] - scene.room.position[2];
  const light = scene.light;
  const dx = light.position[0] - (hit.point[0]);
  const dy = light.position[1] - (hit.point[1]);
  const dz = light.position[2] - (hit.point[2]);
  const dist = Math.hypot(dx, dy, dz);
  const windowTerm = light.distance > 0 ? Math.max(0, 1 - (dist / light.distance) ** 4) ** 2 : 1;
  const attenuation = light.intensity / Math.max(dist * dist, 0.01) * windowTerm;
  const albedo = 0.32;
  const n: [number, number, number] = [
    Math.abs(px) / (scene.room.scale[0] / 2) > Math.abs(py) / (scene.room.scale[1] / 2)
      ? Math.abs(px) / (scene.room.scale[0] / 2) > Math.abs(pz) / (scene.room.scale[2] / 2)
        ? -Math.sign(px) : 0
      : Math.abs(py) / (scene.room.scale[1] / 2) > Math.abs(pz) / (scene.room.scale[2] / 2)
        ? -Math.sign(py) : 0
      : 0,
    0, 0
  ];
  void n;
  const ndl = Math.max(0, -(dx * dir[0] + dy * dir[1] + dz * dir[2]) / Math.max(dist, 1e-6));
  const diffuse = albedo * attenuation * Math.max(ndl, 0.05) / Math.PI;
  return [diffuse, diffuse, diffuse];
}

const ROOM_SCENE = createRoomEnvironmentScene();

function intersectRoom(dir: readonly [number, number, number], room: RoomBox): { t: number; point: [number, number, number] } | null {
  // Room is axis-aligned; ray from origin.
  let tMin = Infinity;
  const half = [room.scale[0] / 2, room.scale[1] / 2, room.scale[2] / 2];
  let point: [number, number, number] = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(dir[axis]!) < 1e-9) continue;
    for (const side of [-1, 1]) {
      const plane = room.position[axis]! + side * half[axis]!;
      const t = plane / dir[axis]!;
      if (t <= 0 || t >= tMin) continue;
      const p: [number, number, number] = [dir[0]! * t, dir[1]! * t, dir[2]! * t];
      const a = (axis + 1) % 3;
      const b = (axis + 2) % 3;
      if (Math.abs(p[a]! - room.position[a]!) <= half[a]! + 1e-4 && Math.abs(p[b]! - room.position[b]!) <= half[b]! + 1e-4) {
        tMin = t;
        point = p;
      }
    }
  }
  return tMin === Infinity ? null : { t: tMin, point };
}

function intersectPanel(dir: readonly [number, number, number], panel: RoomEmissivePanel, maxT: number): boolean {
  // Panel is an axis-aligned thin box; check the ray crosses its slab.
  const half = [panel.scale[0] / 2, panel.scale[1] / 2, panel.scale[2] / 2];
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(dir[axis]!) < 1e-9) continue;
    for (const side of [-1, 1]) {
      const plane = panel.position[axis]! + side * half[axis]!;
      const t = plane / dir[axis]!;
      if (t <= 0 || t >= maxT) continue;
      const a = (axis + 1) % 3;
      const b = (axis + 2) % 3;
      const pa = dir[a]! * t - panel.position[a]!;
      const pb = dir[b]! * t - panel.position[b]!;
      if (Math.abs(pa) <= half[a]! + 1e-4 && Math.abs(pb) <= half[b]! + 1e-4) return true;
    }
  }
  return false;
}
