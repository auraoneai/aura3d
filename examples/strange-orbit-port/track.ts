/**
 * Strange Orbit track geometry (ported from the original `src/track.js`): the
 * analytic centreline, the per-distance frame, surface roughness and the route
 * frames used by the simulation. Pure math over `Vec3`.
 */
import { COURSE_LENGTH, courseById, routeBlend, routeOffset, type CourseDef, type Route } from "./course";
import { Vec3 } from "./vec3";

const TAU = Math.PI * 2;
let active: CourseDef = courseById("painted");

export function setActiveCourse(id: string): void {
  active = courseById(id);
}
export const activeCourse = (): CourseDef => active;

/** Centreline point at lap fraction `t` (>1 wraps around). */
export function centerline(t: number, target = new Vec3()): Vec3 {
  const n = t * TAU;
  const r = (t % 1 + 1) % 1;
  const ramp = (a: number, b: number): number => {
    const u = Math.max(0, Math.min(1, (r - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const a = ramp(0.14, 0.24) * (1 - ramp(0.37, 0.46));
  const o = active.radius + active.waves * Math.sin(n * 3) - active.dive * a + 6 * Math.sin(n * 11) * a;
  return target.set(
    Math.cos(n) * o,
    active.elevation * Math.sin(n * 2) + 5 * Math.sin(n * 3) - 5 * a + 1.2 * Math.sin(n * 12) * a,
    Math.sin(n) * o * 0.96
  );
}

export interface Frame { p: Vec3; tangent: Vec3; side: Vec3; up: Vec3 }

/** Main-route frame at distance `s` (position, tangent, side, up). */
export function mainFrame(s: number): Frame {
  const t = s / COURSE_LENGTH;
  const n = t * TAU;
  const p = centerline(t);
  const tangent = centerline(t + 5e-5).sub(centerline(t - 5e-5)).normalize();
  const a = (t % 1 + 1) % 1;
  const o = Math.max(0, Math.min(1, (a - 0.43) / 0.28));
  const roll = 0.17 * Math.sin(n * 3) + (1 - Math.cos(Math.PI * o)) * 0.5 * TAU * active.roll;
  const side = new Vec3().crossVectors(tangent, new Vec3(0, 1, 0)).normalize();
  const up = new Vec3().crossVectors(side, tangent).normalize();
  side.applyAxisAngle(tangent, roll);
  up.applyAxisAngle(tangent, roll);
  return { p, tangent, side, up };
}

/** Fine surface roughness (metres) at (`s`, track-space lane `t`). */
export function surfaceNoise(s: number, t: number): number {
  const n = s / COURSE_LENGTH * TAU;
  return 0.055 * Math.sin(n * 47 + t * 0.38) + 0.028 * Math.sin(n * 103 - t * 0.8);
}

/** Frame of `route` at distance `s`. */
export function routeFrame(s: number, route: Route = "main"): Frame {
  if (route === "main") return mainFrame(s);
  const offsetPoint = (d: number): Vec3 => {
    const f = mainFrame(d);
    const off = routeOffset(d, route);
    return f.p.addScaledVector(f.side, off.side).addScaledVector(f.up, off.height);
  };
  const base = mainFrame(s);
  const p = offsetPoint(s);
  const tangent = offsetPoint(s + 0.05).sub(offsetPoint(s - 0.05)).normalize().lerp(base.tangent, 1 - routeBlend(s, route)).normalize();
  const side = new Vec3().crossVectors(tangent, base.up).normalize();
  const up = new Vec3().crossVectors(side, tangent).normalize();
  return { p, tangent, side, up };
}

/** Ratio of main-route arc length to this route's arc length (speed compensation). */
export function routeLengthScale(s: number, route: Route = "main"): number {
  if (route === "main" || route === "islands") return 1;
  const main = mainFrame(s + 0.25).p.sub(mainFrame(s - 0.25).p).length();
  const alt = routeFrame(s + 0.25, route).p.sub(routeFrame(s - 0.25, route).p).length();
  return Math.max(0.45, Math.min(1.25, main / alt));
}

/** Centrifugal lateral push at speed `speed` (the original always evaluates it at 42). */
export function centrifugalDrift(s: number, speed: number, route: Route = "main"): number {
  if (speed < 38) return 0;
  const r = routeFrame(s, route);
  const curvature = routeFrame(s + 3, route).tangent.sub(routeFrame(s - 3, route).tangent).multiplyScalar(1 / 6).dot(r.side);
  return Math.max(-8.5, Math.min(8.5, -curvature * (speed * speed - 1444) * (route === "main" ? 0.65 : 0.4)));
}
