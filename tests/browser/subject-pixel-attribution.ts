/**
 * S5-WP11-03: pure (DOM-free) helpers that attribute changed pixels between two
 * captured frames to the deforming subject. The browser harness projects the
 * subject's posed (skinned) world bounds through the live camera each frame,
 * unions the two screen rectangles into a subject region, and counts changed
 * pixels inside vs outside it. Camera stability is measured from the live
 * camera pose at each capture rather than asserted.
 *
 * Pixel coordinates follow `gl.readPixels`: row 0 is the bottom of the canvas,
 * so NDC y maps directly onto rows without a flip.
 */

export type Vec3 = readonly [number, number, number];

export interface SubjectBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface CameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up?: Vec3;
  /** Vertical field of view in degrees. */
  readonly fov: number;
}

/** Inclusive-exclusive pixel rectangle: x in [x0, x1), y in [y0, y1). */
export interface PixelRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface ProjectedRegion {
  readonly rect: PixelRect | null;
  /** A bounds corner was at or behind the camera plane; the rect is not trustworthy. */
  readonly clipped: boolean;
}

export interface SubjectPixelAttribution {
  readonly changedPixels: number;
  readonly changedSubjectPixels: number;
  readonly changedOutsideSubjectPixels: number;
  /** changedSubjectPixels / changedPixels (0 when nothing changed). */
  readonly subjectAttribution: number;
  readonly subjectRegionPixels: number;
  readonly meanDelta: number;
  readonly maxDelta: number;
}

const EPSILON_W = 1e-6;

function subtract(a: Vec3, b: Vec3): [number, number, number] { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function normalize(a: Vec3): [number, number, number] {
  const length = Math.hypot(a[0], a[1], a[2]);
  if (!(length > 0)) throw new RangeError("Cannot normalize a zero-length vector");
  return [a[0] / length, a[1] / length, a[2] / length];
}

/** Column-major right-handed view-projection (camera looks down -Z, OpenGL clip space). */
export function perspectiveViewProjection(pose: CameraPose, aspect: number, near = 0.05, far = 1000): Float64Array {
  if (!(aspect > 0) || !(pose.fov > 0 && pose.fov < 180)) throw new RangeError("Invalid camera aspect or field of view");
  const forward = normalize(subtract(pose.target, pose.position));
  const side = normalize(cross(forward, pose.up ?? [0, 1, 0]));
  const up = cross(side, forward);
  const eye = pose.position;
  // View matrix rows: side, up, -forward.
  const view = [
    side[0], up[0], -forward[0], 0,
    side[1], up[1], -forward[1], 0,
    side[2], up[2], -forward[2], 0,
    -dot(side, eye), -dot(up, eye), dot(forward, eye), 1
  ];
  const f = 1 / Math.tan((pose.fov * Math.PI) / 360);
  const projection = [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0
  ];
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += projection[k * 4 + row]! * view[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** Project the eight corners of a world AABB to a padded, frame-clamped pixel rectangle. */
export function projectBoundsToPixelRect(
  bounds: SubjectBounds,
  viewProjection: ArrayLike<number>,
  width: number,
  height: number,
  paddingPx = 4
): ProjectedRegion {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let corner = 0; corner < 8; corner += 1) {
    const x = corner & 1 ? bounds.max[0] : bounds.min[0];
    const y = corner & 2 ? bounds.max[1] : bounds.min[1];
    const z = corner & 4 ? bounds.max[2] : bounds.min[2];
    const m = viewProjection;
    const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
    const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
    const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    if (!(cw > EPSILON_W) || !Number.isFinite(cx) || !Number.isFinite(cy)) return { rect: null, clipped: true };
    const px = (cx / cw * 0.5 + 0.5) * width;
    const py = (cy / cw * 0.5 + 0.5) * height;
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  const rect = clampRect({
    x0: Math.floor(minX - paddingPx),
    y0: Math.floor(minY - paddingPx),
    x1: Math.ceil(maxX + paddingPx),
    y1: Math.ceil(maxY + paddingPx)
  }, width, height);
  return { rect, clipped: false };
}

function clampRect(rect: PixelRect, width: number, height: number): PixelRect | null {
  const clamped = {
    x0: Math.max(0, Math.min(width, rect.x0)),
    y0: Math.max(0, Math.min(height, rect.y0)),
    x1: Math.max(0, Math.min(width, rect.x1)),
    y1: Math.max(0, Math.min(height, rect.y1))
  };
  return clamped.x1 > clamped.x0 && clamped.y1 > clamped.y0 ? clamped : null;
}

/** Union of the subject's rectangles across both frames (the subject may move between captures). */
export function unionRects(...rects: readonly (PixelRect | null | undefined)[]): PixelRect | null {
  const present = rects.filter((rect): rect is PixelRect => Boolean(rect));
  if (present.length === 0) return null;
  return {
    x0: Math.min(...present.map((rect) => rect.x0)),
    y0: Math.min(...present.map((rect) => rect.y0)),
    x1: Math.max(...present.map((rect) => rect.x1)),
    y1: Math.max(...present.map((rect) => rect.y1))
  };
}

/** True only when both poses are known and match within `epsilon` on every component. */
export function cameraPosesEqual(a: CameraPose | undefined, b: CameraPose | undefined, epsilon = 1e-6): boolean {
  if (!a || !b) return false;
  const values = (pose: CameraPose) => [...pose.position, ...pose.target, ...(pose.up ?? [0, 1, 0]), pose.fov];
  const left = values(a);
  const right = values(b);
  return left.every((value, index) => Number.isFinite(value) && Math.abs(value - right[index]!) <= epsilon);
}

/**
 * Count changed pixels (mean RGB delta above `threshold`) inside and outside the
 * subject region. Without a region nothing is attributed to the subject.
 */
export function attributeChangedPixels(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  width: number,
  height: number,
  region: PixelRect | null,
  threshold = 10
): SubjectPixelAttribution {
  const pixelCount = Math.min(a.length, b.length, width * height * 4) / 4;
  let changedPixels = 0;
  let changedSubjectPixels = 0;
  let totalDelta = 0;
  let maxDelta = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    const delta = (Math.abs((a[index] ?? 0) - (b[index] ?? 0)) +
      Math.abs((a[index + 1] ?? 0) - (b[index + 1] ?? 0)) +
      Math.abs((a[index + 2] ?? 0) - (b[index + 2] ?? 0))) / 3;
    totalDelta += delta;
    if (delta > maxDelta) maxDelta = delta;
    if (delta <= threshold) continue;
    changedPixels += 1;
    if (region) {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x >= region.x0 && x < region.x1 && y >= region.y0 && y < region.y1) changedSubjectPixels += 1;
    }
  }
  return {
    changedPixels,
    changedSubjectPixels,
    changedOutsideSubjectPixels: changedPixels - changedSubjectPixels,
    subjectAttribution: changedPixels > 0 ? changedSubjectPixels / changedPixels : 0,
    subjectRegionPixels: region ? (region.x1 - region.x0) * (region.y1 - region.y0) : 0,
    meanDelta: pixelCount > 0 ? totalDelta / pixelCount : 0,
    maxDelta
  };
}
