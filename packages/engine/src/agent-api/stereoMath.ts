/**
 * threejs-parity L7/SC-01: three's `StereoCamera.update(camera)` as pure math.
 *
 * Off-axis stereo after paulbourke.net/stereographics/stereorender (the
 * reference three's source cites): both eyes keep the camera's frustum
 * height and shift the frustum horizontally by `eyeSeparation / 2 * near /
 * focus`; the eye cameras sit `±eyeSeparation / 2` along the camera's own
 * x axis. Matrices are column-major (WebGL/three layout).
 */

export interface StereoEyeOptions {
  /** The camera's view matrix (world → camera), column-major. */
  readonly viewMatrix: ArrayLike<number>;
  /** The camera's projection matrix; only elements 0 and 8 are rewritten per eye, exactly as three does. */
  readonly projectionMatrix: ArrayLike<number>;
  /** World-space camera position. */
  readonly cameraPosition: readonly [number, number, number];
  /** Vertical field of view in degrees. */
  readonly fov: number;
  /** The camera's aspect ratio (width / height of the full target). */
  readonly aspect: number;
  readonly near: number;
  /** Convergence distance; three's default is 10. */
  readonly focus?: number;
  readonly zoom?: number;
  /** Interocular distance in world units; three's default is 0.064. */
  readonly eyeSeparation?: number;
  /** three's `StereoCamera.aspect` multiplier (`StereoEffect` uses 0.5 for side-by-side). */
  readonly aspectScale?: number;
}

export interface StereoEyeFrame {
  readonly viewMatrix: Float32Array;
  readonly projectionMatrix: Float32Array;
  readonly viewProjectionMatrix: Float32Array;
  readonly cameraPosition: readonly [number, number, number];
}

export interface StereoEyes {
  readonly left: StereoEyeFrame;
  readonly right: StereoEyeFrame;
  readonly eyeSeparation: number;
  readonly focus: number;
}

export const STEREO_DEFAULT_EYE_SEPARATION = 0.064;
export const STEREO_DEFAULT_FOCUS = 10;

const DEG2RAD = Math.PI / 180;

export function computeStereoEyes(options: StereoEyeOptions): StereoEyes {
  const eyeSeparation = options.eyeSeparation ?? STEREO_DEFAULT_EYE_SEPARATION;
  const focus = options.focus ?? STEREO_DEFAULT_FOCUS;
  const zoom = options.zoom ?? 1;
  const aspect = options.aspect * (options.aspectScale ?? 1);
  const { near, fov } = options;
  assertPositiveFinite("eyeSeparation", eyeSeparation);
  assertPositiveFinite("focus", focus);
  assertPositiveFinite("zoom", zoom);
  assertPositiveFinite("aspect", aspect);
  assertPositiveFinite("near", near);
  if (!Number.isFinite(fov) || fov <= 0 || fov >= 180) throw new RangeError("Stereo fov must be finite and in (0, 180) degrees.");
  if (options.viewMatrix.length !== 16 || options.projectionMatrix.length !== 16) {
    throw new RangeError("Stereo viewMatrix and projectionMatrix must have 16 elements.");
  }

  const half = eyeSeparation / 2;
  const eyeSepOnProjection = (half * near) / focus;
  const ymax = (near * Math.tan(DEG2RAD * fov * 0.5)) / zoom;

  return {
    left: eyeFrame(options, aspect, ymax, near, eyeSepOnProjection, -half),
    right: eyeFrame(options, aspect, ymax, near, -eyeSepOnProjection, half),
    eyeSeparation,
    focus
  };
}

function eyeFrame(
  options: StereoEyeOptions,
  aspect: number,
  ymax: number,
  near: number,
  frustumShift: number,
  eyeOffsetX: number
): StereoEyeFrame {
  const xmin = -ymax * aspect + frustumShift;
  const xmax = ymax * aspect + frustumShift;
  const projection = Float32Array.from(options.projectionMatrix);
  projection[0] = (2 * near) / (xmax - xmin);
  projection[8] = (xmax + xmin) / (xmax - xmin);

  // World matrix of the eye is `cameraWorld * translate(eyeOffsetX, 0, 0)`, so
  // its view matrix is `translate(-eyeOffsetX, 0, 0) * view`: row 0 gains
  // `-eyeOffsetX * row 3` (row 3 is [0, 0, 0, 1] for a rigid view).
  const view = Float32Array.from(options.viewMatrix);
  for (let column = 0; column < 4; column += 1) {
    view[column * 4] = (view[column * 4] ?? 0) - eyeOffsetX * (options.viewMatrix[column * 4 + 3] ?? 0);
  }

  // Camera x axis in world space = first row of the view rotation.
  const right: readonly [number, number, number] = [options.viewMatrix[0] ?? 0, options.viewMatrix[4] ?? 0, options.viewMatrix[8] ?? 0];
  const [px, py, pz] = options.cameraPosition;
  return {
    viewMatrix: view,
    projectionMatrix: projection,
    viewProjectionMatrix: multiplyColumnMajor(projection, view),
    cameraPosition: [px + right[0] * eyeOffsetX, py + right[1] * eyeOffsetX, pz + right[2] * eyeOffsetX]
  };
}

function multiplyColumnMajor(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Stereo ${name} must be a positive finite number.`);
}
