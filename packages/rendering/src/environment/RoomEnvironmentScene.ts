/**
 * Aura3D's neutral studio, used when baking the optional procedural room.
 * Dimensions are in metres; panel emissive values are linear radiance and the
 * point source intensity is expressed in candela. The capture is at the
 * origin. The intentionally simple room is independently authored so its
 * geometry and light values can be changed and reproduced by Aura3D.
 */
export interface RoomBox {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotationY: number;
  readonly albedo: readonly [number, number, number];
}
export interface RoomEmissivePanel {
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotationY: number;
  readonly emissive: readonly [number, number, number];
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

export const ROOM_ENVIRONMENT_SCENE_OFFSET_Y = 0;
export const ROOM_ENVIRONMENT_PANEL_RADIANCES: readonly number[] = [64, 32, 24, 16, 48];

export function createRoomEnvironmentScene(): RoomEnvironmentSceneDescriptor {
  return {
    room: { position: [0, 1, 0], scale: [24, 20, 24], rotationY: 0, albedo: [0.8, 0.8, 0.8] },
    boxes: [
      { position: [-6, -5.5, 5], scale: [3, 7, 3], rotationY: 0.35, albedo: [0.65, 0.65, 0.65] },
      { position: [7, -6.5, -4], scale: [4, 5, 3], rotationY: -0.4, albedo: [0.72, 0.72, 0.72] }
    ],
    panels: [
      { position: [0, 10.8, 0], scale: [8, 0.1, 5], rotationY: 0, emissive: [64, 64, 64] },
      { position: [-11.8, 3, 0], scale: [0.1, 5, 6], rotationY: 0, emissive: [32, 32, 32] },
      { position: [11.8, 5, -3], scale: [0.1, 4, 5], rotationY: 0, emissive: [24, 24, 24] },
      { position: [0, 2, -11.8], scale: [6, 4, 0.1], rotationY: 0, emissive: [16, 16, 16] },
      { position: [4, 5, 11.8], scale: [3, 3, 0.1], rotationY: 0, emissive: [48, 48, 48] }
    ],
    light: { color: [1, 1, 1], intensity: 240, distance: 40, decay: 2, position: [0, 7, 0] }
  };
}

type Vec3 = [number, number, number];
type BoxShape = Pick<RoomBox, "position" | "scale" | "rotationY">;
interface Hit { readonly distance: number; readonly normal: Vec3 }

/** Intersect a ray with the three independent box intervals in local space. */
function intersectBox(direction: Vec3, box: BoxShape): Hit | null {
  const c = Math.cos(box.rotationY), s = Math.sin(box.rotationY);
  const center = box.position;
  const origin: Vec3 = [-center[0] * c + center[2] * s, -center[1], -center[0] * s - center[2] * c];
  const ray: Vec3 = [direction[0] * c - direction[2] * s, direction[1], direction[0] * s + direction[2] * c];
  let enter = -Infinity, exit = Infinity, enterAxis = -1, exitAxis = -1;
  let enterSign = 0, exitSign = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const half = box.scale[axis]! / 2;
    const o = origin[axis]!, d = ray[axis]!;
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(o) > half) return null;
      continue;
    }
    const first = (-half - o) / d, second = (half - o) / d;
    const near = Math.min(first, second), far = Math.max(first, second);
    if (near > enter) { enter = near; enterAxis = axis; enterSign = d > 0 ? -1 : 1; }
    if (far < exit) { exit = far; exitAxis = axis; exitSign = d > 0 ? 1 : -1; }
    if (enter > exit) return null;
  }
  const outside = enter > 1e-7;
  const distance = outside ? enter : exit;
  const axis = outside ? enterAxis : exitAxis;
  if (axis < 0 || distance <= 1e-7 || !Number.isFinite(distance)) return null;
  const local: Vec3 = [0, 0, 0];
  // Room walls are viewed from inside, so their normal faces the camera.
  local[axis] = outside ? enterSign : -exitSign;
  return { distance, normal: [local[0] * c + local[2] * s, local[1], -local[0] * s + local[2] * c] };
}

const scene = createRoomEnvironmentScene();

/**
 * Trace the capture ray against the room and luminous panels. Diffuse surfaces
 * use Lambertian reflectance L = albedo / pi * I * cos(theta) / r^decay,
 * with a smooth finite range. Results are linear, nonnegative HDR radiance.
 */
export function sampleRoomEnvironment(dir: readonly [number, number, number]): Vec3 {
  const length = Math.hypot(...dir);
  if (!Number.isFinite(length) || length < 1e-12) return [0, 0, 0];
  const ray: Vec3 = [dir[0] / length, dir[1] / length, dir[2] / length];
  let nearest = Infinity;
  let result: Vec3 = [0, 0, 0];
  for (const panel of scene.panels) {
    const hit = intersectBox(ray, panel);
    if (hit && hit.distance < nearest) {
      nearest = hit.distance;
      result = [...panel.emissive];
    }
  }
  for (const box of [scene.room, ...scene.boxes]) {
    const hit = intersectBox(ray, box);
    if (!hit || hit.distance >= nearest) continue;
    nearest = hit.distance;
    const point: Vec3 = [ray[0] * nearest, ray[1] * nearest, ray[2] * nearest];
    const toLight: Vec3 = [scene.light.position[0] - point[0], scene.light.position[1] - point[1], scene.light.position[2] - point[2]];
    const distance = Math.hypot(...toLight);
    const cosine = distance > 0 ? Math.max(0, (hit.normal[0] * toLight[0] + hit.normal[1] * toLight[1] + hit.normal[2] * toLight[2]) / distance) : 0;
    const range = Math.max(0, 1 - distance / scene.light.distance);
    const irradiance = scene.light.intensity * cosine * range * range / Math.max(0.01, distance ** scene.light.decay);
    result = [0, 1, 2].map((i) => box.albedo[i]! * scene.light.color[i]! * irradiance / Math.PI) as Vec3;
  }
  return result;
}
