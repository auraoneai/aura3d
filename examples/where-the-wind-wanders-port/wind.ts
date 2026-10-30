/**
 * The valley's wind (GU47 WP-33, WW47-S2 signature): one prevailing direction from the west-southwest, gust bands that
 * roll across the meadow, and cloud shadows advected with it. The GLSL below is the same model the shaders run (grass
 * sway and sheen, the cloud-shadow term on the sun, the sky's cloud drift), mirrored here so the kite, the particles and
 * the windmill sails read the same gust at the same place and time.
 *
 * Presentation only: nothing here feeds the sim.
 */

/** Unit xz vector the wind blows toward (from the west-southwest toward the east-northeast, out over the sea). */
export const WIND_DIR: readonly [number, number] = (() => {
  const x = 0.92, z = -0.38;
  const l = Math.hypot(x, z);
  return [x / l, z / l] as const;
})();

/** Gust band wavenumber along the wind (rad per metre), band speed (rad per second) and the slow wander. */
export const GUST_WAVENUMBER = 0.09;
export const GUST_SPEED = 0.55;
export const GUST_WANDER = 0.6;
/** Gust strength range: calm 1.0 to a full gust 2.5 (WW47-S2 acceptance). */
export const GUST_MIN = 1;
export const GUST_MAX = 2.5;
/** Cloud shadows drift with the wind at this speed (m/s); `CLOUD_SCALE` is 1 / blob size in metres. */
export const CLOUD_SPEED = 3.2;
export const CLOUD_SCALE = 0.022;

/** 0..1 gust band at world (x, z) and time t. */
export function gustBand(x: number, z: number, t: number): number {
  const along = x * WIND_DIR[0] + z * WIND_DIR[1];
  const s = 0.5 + 0.5 * Math.sin(along * GUST_WAVENUMBER - t * GUST_SPEED + GUST_WANDER * Math.sin(t * 0.13));
  return s * s * s;
}

/** Gust strength at (x, z, t), GUST_MIN..GUST_MAX. */
export function gustAt(x: number, z: number, t: number): number {
  return GUST_MIN + (GUST_MAX - GUST_MIN) * gustBand(x, z, t);
}

/** World-space wind vector (x, z) at a point: the direction scaled by the gust. */
export function windAt(x: number, z: number, t: number): [number, number] {
  const g = gustAt(x, z, t);
  return [WIND_DIR[0] * g, WIND_DIR[1] * g];
}

/** Yaw (radians about +y, 0 = facing +z) that points a body downwind, for the kite and particle emitters. */
export function downwindYaw(): number {
  return Math.atan2(WIND_DIR[0], WIND_DIR[1]);
}

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);

/**
 * GLSL mirror (no uniforms; the caller passes `windTime`). `windGust` returns GUST_MIN..GUST_MAX; `cloudCover` returns
 * 0..1 cloud cover over a ground point and needs `fbm` from the shaders' COMMON block.
 */
export const WIND_GLSL = /* glsl */ `
const vec2 WIND_DIR = vec2(${f(WIND_DIR[0])}, ${f(WIND_DIR[1])});
float windGustBand(vec2 p, float t) {
  float along = dot(p, WIND_DIR);
  float s = 0.5 + 0.5 * sin(along * ${f(GUST_WAVENUMBER)} - t * ${f(GUST_SPEED)} + ${f(GUST_WANDER)} * sin(t * 0.13));
  return s * s * s;
}
float windGust(vec2 p, float t) { return ${f(GUST_MIN)} + ${f(GUST_MAX - GUST_MIN)} * windGustBand(p, t); }
`;

export const CLOUD_GLSL = /* glsl */ `
float cloudCover(vec2 p, float t) {
  vec2 q = (p - WIND_DIR * t * ${f(CLOUD_SPEED)}) * ${f(CLOUD_SCALE)};
  return smoothstep(0.5, 0.72, fbm(q + vec2(3.7, 1.9)));
}
`;
