/** Court units: the simulation works in normalised units; metres per unit differ per axis. Source: physics.js header. */
export const METRES_PER_UNIT = Object.freeze({ x: 5.018, y: 11.885, z: 2.177 } as const);
/** Visual scale used by the renderer and the pose solver (the sim and the scene deliberately use different scales). */
export const RENDER_UNITS = Object.freeze({ x: 5.5, y: 8 } as const);

export const GRAVITY = 9.81 / METRES_PER_UNIT.z;
export const BALL_RADIUS = 0.0335 / METRES_PER_UNIT.z;
export const NET_HEIGHT = 0.914 / METRES_PER_UNIT.z;
export const NET_POST_HEIGHT = 1.07 / METRES_PER_UNIT.z;
export const NET_HALF_WIDTH = 1.08;
export const AIR_DRAG = 0.09;
/** Fixed simulation step used by `step(dt)`; the browser loop clamps and accumulates real time into this. */
export const FIXED_DT = 1 / 60;

export type Vec3 = readonly [number, number, number];

export const toMetres = (x: number, y: number, z = 0): Vec3 => [x * METRES_PER_UNIT.x, y * METRES_PER_UNIT.y, z * METRES_PER_UNIT.z];
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
