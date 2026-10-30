/**
 * Gridlock Courier (GU47 WP-28 GC-C1): the 6 s intro after Start and the blue-hour results orbit. Camera only: the
 * sim does not step during the intro (the shift clock starts when it ends or is skipped), so jobs, score and replays
 * are untouched (PRD D8). Pure pose math; `main.ts` applies the poses with `camera.setPose`.
 *
 * Intro shots: 0-2 s over the harbour water looking back at the town, 2-4.5 s a rail down the courier's own avenue
 * toward the car (the street is clear of buildings along the heading), 4.5-6 s an ease into the chase eye. Reduced
 * motion skips the intro and holds the results camera still.
 */
export const INTRO = { seconds: 6, harbour: 2, rail: 4.5 } as const;
export const ORBIT = { radius: 15, height: 6.5, speed: 0.16, fov: 50 } as const;

type V3 = [number, number, number];
export interface CamPose { position: V3; target: V3; fov: number }
export interface CarPose { x: number; z: number; heading: number }

const ease = (t: number): number => t * t * (3 - 2 * t);
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Harbour water line (the quay), metres: the first shot hangs over the water beyond it. */
const HARBOUR_Z = 600;

/** Intro pose at `t` seconds; `chase` is the chase rig's eye and look target for the hand-off. */
export function introPose(t: number, car: CarPose, chase: CamPose): CamPose {
  const s = Math.sin(car.heading), c = Math.cos(car.heading);
  const focus: V3 = [car.x, 1.4, car.z];
  if (t < INTRO.harbour) {
    const k = ease(Math.max(0, t) / INTRO.harbour);
    const from: V3 = [car.x - 120, 70, HARBOUR_Z];
    const to: V3 = [car.x - 40, 55, HARBOUR_Z - 30];
    return { position: mix(from, to, k), target: [car.x, 6, car.z], fov: 48 };
  }
  if (t < INTRO.rail) {
    const k = ease((t - INTRO.harbour) / (INTRO.rail - INTRO.harbour));
    const from: V3 = [car.x + s * 90, 16, car.z + c * 90];
    const to: V3 = [car.x + s * 18, 4.5, car.z + c * 18];
    return { position: mix(from, to, k), target: focus, fov: 54 };
  }
  const k = ease(Math.min(1, (t - INTRO.rail) / (INTRO.seconds - INTRO.rail)));
  const from: V3 = [car.x + s * 18, 4.5, car.z + c * 18];
  return { position: mix(from, chase.position, k), target: mix(focus, chase.target, k), fov: 54 + (chase.fov - 54) * k };
}

/** True when the intro should play: shift look, a player start (not manual or autostart QA), motion allowed. */
export const introWanted = (shiftLook: boolean, manual: boolean, autostart: boolean, reducedMotion: boolean): boolean => shiftLook && !manual && !autostart && !reducedMotion;

/**
 * Results orbit around the parked courier at `t` seconds (still under reduced motion). The radius shrinks (15, 10,
 * 6 m) while `blocked` says the eye would sit inside a building.
 */
export function orbitPose(t: number, car: CarPose, reducedMotion: boolean, blocked: (x: number, y: number, z: number) => boolean = () => false): CamPose {
  const a = car.heading + Math.PI * 0.75 + (reducedMotion ? 0 : t * ORBIT.speed);
  let position: V3 = [car.x, ORBIT.height, car.z];
  for (const r of [ORBIT.radius, 10, 6]) {
    position = [car.x + Math.sin(a) * r, ORBIT.height, car.z + Math.cos(a) * r];
    if (!blocked(...position)) break;
  }
  return { position, target: [car.x, 1.1, car.z], fov: ORBIT.fov };
}
