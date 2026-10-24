/**
 * Swept club-head vs ball contact (pure, no engine).
 *
 * The strike is decided by geometry: the segment the club head travelled this
 * frame against a ball-sized sphere, so a slow frame cannot tunnel through the
 * ball and a miss never fires a shot.
 */
import type { Vec3 } from "./types";

export interface ClubContact {
  /** fraction of the frame segment at first contact, 0..1 */
  readonly u: number;
  /** club-head centre at contact (world) */
  readonly point: Vec3;
  /** unit direction the head was travelling at contact */
  readonly pathDir: Vec3;
  /** head speed over the frame (m/s) */
  readonly speed: number;
  /** horizontal angle between the head path and the target line (deg, + = right of line) */
  readonly pathYawDeg: number;
  /** centre offset from the ball centre across the path, 0 = dead centre (m) */
  readonly offsetM: number;
}

/** first intersection of segment p0→p1 with a sphere, or null */
export function sweptSphereHit(p0: Vec3, p1: Vec3, centre: Vec3, radius: number): number | null {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const fx = p0[0] - centre[0], fy = p0[1] - centre[1], fz = p0[2] - centre[2];
  const a = dx * dx + dy * dy + dz * dz;
  const c = fx * fx + fy * fy + fz * fz - radius * radius;
  if (c <= 0) return 0; // already inside
  if (a < 1e-12) return null;
  const b = fx * dx + fy * dy + fz * dz;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const u = (-b - Math.sqrt(disc)) / a;
  return u >= 0 && u <= 1 ? u : null;
}

/** swept contact of a club-head path against the ball; `targetYaw` is the world yaw of the shot line */
export function sweptClubContact(
  prev: Vec3,
  cur: Vec3,
  ball: Vec3,
  radius: number,
  dt: number,
  targetYaw: number
): ClubContact | null {
  const u = sweptSphereHit(prev, cur, ball, radius);
  if (u === null) return null;
  const dx = cur[0] - prev[0], dy = cur[1] - prev[1], dz = cur[2] - prev[2];
  const len = Math.hypot(dx, dy, dz);
  const dir: Vec3 = len > 1e-9 ? [dx / len, dy / len, dz / len] : [0, 0, 1];
  const point: Vec3 = [prev[0] + dx * u, prev[1] + dy * u, prev[2] + dz * u];
  const rx = ball[0] - point[0], ry = ball[1] - point[1], rz = ball[2] - point[2];
  const along = rx * dir[0] + ry * dir[1] + rz * dir[2];
  const offsetM = Math.sqrt(Math.max(0, rx * rx + ry * ry + rz * rz - along * along));
  const pathYaw = Math.atan2(dir[0], dir[2]);
  let d = pathYaw - targetYaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return { u, point, pathDir: dir, speed: dt > 0 ? len / dt : 0, pathYawDeg: (d * 180) / Math.PI, offsetM };
}
