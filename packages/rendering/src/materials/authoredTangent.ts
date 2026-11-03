/**
 * Authored-tangent shading frame shared by the generated GLSL and WGSL
 * programs (WP-04 / S5-WP04-01).
 *
 * When geometry carries a glTF `TANGENT` (xyz direction, w handedness), the
 * tangent-space frame used by the base normal map, the clearcoat normal map
 * and anisotropy is the authored one, never a screen-space derivative frame:
 *
 *   N_front = faceDirection * orientedNormal          (unflip back faces)
 *   T       = normalize(t - N_front * dot(N_front, t))  (Gram-Schmidt)
 *   B       = sign(w) * cross(N_front, T)             (w < 0 => -1, else +1)
 *   frame   = (faceDirection * T, faceDirection * B, orientedNormal)
 *
 * `orientedNormal` is the interpolated normal already flipped toward the
 * viewer for back faces of double-sided materials; `faceDirection` is +1 for
 * front faces and -1 for back faces. A back face therefore shades with the
 * exact negation of the front-face frame, so a mapped normal on the back of a
 * thin double-sided surface is the mirror of the front one. A degenerate
 * tangent (zero length after projection) falls back to a fixed orthogonal
 * axis; callers keep the derivative frame when no tangent was authored.
 *
 * The mapped normal is `normalize(T * x * s + B * y * s + N * z)` for a
 * tangent-space texel (x, y, z) in [-1, 1] and normal scale `s`.
 */

export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];

export interface AuthoredTangentFrame {
  readonly tangent: Vec3;
  readonly bitangent: Vec3;
  readonly normal: Vec3;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function safeNormalize(value: Vec3, fallback: Vec3): Vec3 {
  const lengthSquared = dot(value, value);
  return lengthSquared > 1e-12 ? scale(value, 1 / Math.sqrt(lengthSquared)) : fallback;
}
function orthogonal(n: Vec3): Vec3 {
  const axis: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  return safeNormalize(cross(axis, n), [1, 0, 0]);
}

/** CPU reference of the shader frame construction (see module comment). */
export function authoredTangentFrame(orientedNormal: Vec3, tangent: Vec4, faceDirection: 1 | -1 = 1): AuthoredTangentFrame {
  const n = safeNormalize(orientedNormal, [0, 0, 1]);
  const front = scale(n, faceDirection);
  const t = safeNormalize(sub([tangent[0], tangent[1], tangent[2]], scale(front, dot(front, [tangent[0], tangent[1], tangent[2]]))), orthogonal(front));
  const b = scale(cross(front, t), tangent[3] < 0 ? -1 : 1);
  return { tangent: scale(t, faceDirection), bitangent: scale(b, faceDirection), normal: n };
}

/** CPU reference of the shader tangent-space map application. */
export function authoredMappedNormal(frame: AuthoredTangentFrame, texel: Vec3, normalScale: number): Vec3 {
  const mapped: Vec3 = [0, 1, 2].map((i) =>
    frame.tangent[i]! * texel[0] * normalScale + frame.bitangent[i]! * texel[1] * normalScale + frame.normal[i]! * texel[2]) as unknown as Vec3;
  return safeNormalize(mapped, frame.normal);
}

/** GLSL: `a3dAuthoredTangentFrame`, `a3dAuthoredMapNormal`, `a3dPrd04FaceDirection`. Fragment stage only. */
export const AUTHORED_TANGENT_GLSL = /* glsl */ `
float a3dPrd04FaceDirection() {
#ifdef DOUBLE_SIDED
  return gl_FrontFacing ? 1.0 : -1.0;
#else
  return 1.0;
#endif
}
vec3 a3dAuthoredSafeNormalize(vec3 value, vec3 fallback) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 1e-12 ? value * inversesqrt(lengthSquared) : fallback;
}
mat3 a3dAuthoredTangentFrame(vec3 orientedNormal, vec4 tangent, float faceDirection) {
  vec3 n = a3dAuthoredSafeNormalize(orientedNormal, vec3(0.0, 0.0, 1.0));
  vec3 front = n * faceDirection;
  vec3 axis = abs(front.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 fallback = a3dAuthoredSafeNormalize(cross(axis, front), vec3(1.0, 0.0, 0.0));
  vec3 t = a3dAuthoredSafeNormalize(tangent.xyz - front * dot(front, tangent.xyz), fallback);
  vec3 b = cross(front, t) * (tangent.w < 0.0 ? -1.0 : 1.0);
  return mat3(t * faceDirection, b * faceDirection, n);
}
vec3 a3dAuthoredMapNormal(mat3 frame, vec3 texel, float normalScale) {
  vec3 mapped = frame[0] * (texel.x * normalScale) + frame[1] * (texel.y * normalScale) + frame[2] * texel.z;
  return a3dAuthoredSafeNormalize(mapped, frame[2]);
}
`;

/** WGSL companion with identical arithmetic. */
export const AUTHORED_TANGENT_WGSL = /* wgsl */ `
fn a3dAuthoredSafeNormalize(value: vec3f, fallback: vec3f) -> vec3f {
  let lengthSquared = dot(value, value);
  if (lengthSquared > 0.000000000001) { return value * inverseSqrt(lengthSquared); }
  return fallback;
}
fn a3dAuthoredTangentFrame(orientedNormal: vec3f, tangent: vec4f, faceDirection: f32) -> mat3x3f {
  let n = a3dAuthoredSafeNormalize(orientedNormal, vec3f(0.0, 0.0, 1.0));
  let front = n * faceDirection;
  let axis = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(front.z) < 0.9);
  let fallback = a3dAuthoredSafeNormalize(cross(axis, front), vec3f(1.0, 0.0, 0.0));
  let t = a3dAuthoredSafeNormalize(tangent.xyz - front * dot(front, tangent.xyz), fallback);
  let b = cross(front, t) * select(1.0, -1.0, tangent.w < 0.0);
  return mat3x3f(t * faceDirection, b * faceDirection, n);
}
fn a3dAuthoredMapNormal(frame: mat3x3f, texel: vec3f, normalScale: f32) -> vec3f {
  let mapped = frame[0] * (texel.x * normalScale) + frame[1] * (texel.y * normalScale) + frame[2] * texel.z;
  return a3dAuthoredSafeNormalize(mapped, frame[2]);
}
`;
