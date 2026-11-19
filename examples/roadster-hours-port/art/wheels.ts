/**
 * Rolling wheels (moving-parts pass, Nov 2026). Owner report: "the tyres aren't moving to show the car actually working".
 *
 * Root cause (measured on swRoadsterBodyB + the GU47 chase rig): the hero's procedural wheels did spin (distance / radius,
 * steering from `run.wheel`), but (a) from the chase camera (7.8 m behind, 0.55 m off-centre) the Idol body's flared rear
 * fenders reach x = 1.11 m while the tyres' outer faces sat at x = 1.04 m, so only thin slivers of the rear tyres showed
 * and the fronts were hidden; (c) the tyre was a smooth torus (rotation leaves it unchanged) and the 18 crossed wire spokes
 * alias: at 60 m/s the wheel turns 146 rad/s = 2.4 rad per 60 Hz frame, a whole number of spoke pitches (0.35 rad) plus a
 * random remainder, so the rim reads frozen or flickering. Traffic Idol bodies have their wheels baked into one rigid mesh.
 *
 * Fix: treaded tyres with bold transverse lugs and sidewall ribs; the hero's track widens so the tread stands flush with the
 * fenders; the drawn spin is the true distance / radius until a frame step would alias, then it advances by a fixed
 * fraction of the feature pitch every frame (always visibly forward), and a translucent spoke-blur disc fades in above
 * BLUR_RAD_S. Every Idol traffic vehicle gets instanced spinning wheels (treaded tyre + five-spoke rim + blur disc) laid
 * over its baked wheels at hubs measured on each GLB.
 */

export type V3 = [number, number, number];

export interface WheelMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

/** Above this wheel rate (rad/s) the spoke-blur disc fades in (fully opaque by BLUR_FULL_RAD_S). */
export const BLUR_RAD_S = 25;
export const BLUR_FULL_RAD_S = 45;
/** Largest drawn step per frame as a fraction of the repeating feature's pitch (below 0.5 the eye reads it as forward). */
export const ALIAS_SAFE_FRACTION = 0.3;
/** Tread lugs around the tyre and spokes of the traffic rim. */
export const TREAD_LUGS = 20;
export const TRAFFIC_SPOKES = 5;
/** The hero's wire wheel shows a 3-ear knock-off spinner over 18 spokes: its readable pitch is the spinner's. */
export const HERO_RIM_PITCH = (Math.PI * 2) / 3;
export const TREAD_PITCH = (Math.PI * 2) / TREAD_LUGS;
/**
 * Hero track under the Idol body: tyre outer faces flush with the flared fenders (body half width 1.266 m x 0.88 fit =
 * 1.114 m; tyre half width 0.29 x 1.15 / 2 = 0.167 m), so the tread shows below the rear fenders to the chase camera.
 */
export const HERO_IDOL_TRACK_X = 0.95;

/** True roll angle increment for `distance` metres on a wheel of `radius` (rolling, no slip). */
export function rollStep(distance: number, radius: number): number {
  return radius > 0 ? distance / radius : 0;
}

/** Drawn angle increment: the true step, or a fixed forward fraction of `pitch` once the true step would alias. */
export function drawnStep(trueStep: number, pitch: number): number {
  const cap = pitch * ALIAS_SAFE_FRACTION;
  if (Math.abs(trueStep) <= cap) return trueStep;
  return Math.sign(trueStep) * cap;
}

/** Spoke-blur opacity 0..1 for a wheel rate (rad/s). */
export function blurAmount(rate: number): number {
  const r = Math.abs(rate);
  if (r <= BLUR_RAD_S) return 0;
  return Math.min(1, (r - BLUR_RAD_S) / (BLUR_FULL_RAD_S - BLUR_RAD_S));
}

/** Front-wheel steer: input `wheel` (-1..1) smoothed with a 16/s rate, mapped to at most 0.42 rad (left input = +yaw). */
export function steerStep(smooth: number, wheel: number, dt: number): { readonly smooth: number; readonly yaw: number } {
  const target = Math.max(-1, Math.min(1, wheel));
  const next = smooth + (target - smooth) * (1 - Math.exp(-16 * dt));
  return { smooth: next, yaw: Math.max(-0.42, Math.min(0.42, -next * 0.42)) };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Geometry (axle along X, centred at the origin, rim face toward +X)                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

class Soup {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly uv: number[] = [];
  tri(a: V3, b: V3, c: V3): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    // double-sided (the generated winding is not guaranteed outward): front face, then the back face with the flipped normal
    for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.uv.push(0.5 + q[2] * 0.5, 0.5 + q[1] * 0.5); }
    for (const q of [a, c, b]) { this.p.push(q[0], q[1], q[2]); this.n.push(-nx, -ny, -nz); this.uv.push(0.5 + q[2] * 0.5, 0.5 + q[1] * 0.5); }
  }
  quad(a: V3, b: V3, c: V3, d: V3): void { this.tri(a, b, c); this.tri(a, c, d); }
  /** Box between two corners, with outward faces. */
  box(min: V3, max: V3, rotX = 0): void {
    const cs = Math.cos(rotX), sn = Math.sin(rotX);
    const t = (x: number, y: number, z: number): V3 => [x, y * cs - z * sn, y * sn + z * cs];
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const v = [t(x0, y0, z0), t(x1, y0, z0), t(x1, y1, z0), t(x0, y1, z0), t(x0, y0, z1), t(x1, y0, z1), t(x1, y1, z1), t(x0, y1, z1)];
    const f = (a: number, b: number, c: number, d: number) => this.quad(v[a]!, v[b]!, v[c]!, v[d]!);
    f(0, 3, 2, 1); f(4, 5, 6, 7); f(0, 1, 5, 4); f(2, 3, 7, 6); f(1, 2, 6, 5); f(0, 4, 7, 3);
  }
  mesh(): WheelMesh {
    const count = this.p.length / 3;
    return { positions: Float32Array.from(this.p), normals: Float32Array.from(this.n), uvs: Float32Array.from(this.uv), indices: Uint32Array.from({ length: count }, (_v, i) => i) };
  }
}

/**
 * Treaded tyre: a rounded-shoulder section swept round the axle with `lugs` transverse grooves cut across the crown (depth
 * 9% of the section height) and two raised sidewall ribs, flat-shaded so every lug edge catches light as it turns.
 */
export function buildTreadTyreMesh(radius: number, width: number, lugs = TREAD_LUGS): WheelMesh {
  const s = new Soup();
  const rIn = radius * 0.62, hw = width / 2;
  const depth = (radius - rIn) * 0.09;
  // section profile (x, radius) from the inner bead on -x over the crown to the inner bead on +x
  const prof: [number, number, boolean][] = [
    [-hw * 0.8, rIn, false], [-hw, rIn + (radius - rIn) * 0.35, false], [-hw * 1.02, rIn + (radius - rIn) * 0.5, false], [-hw, rIn + (radius - rIn) * 0.62, false],
    [-hw * 0.92, radius * 0.95, false], [-hw * 0.7, radius, true], [0, radius, true], [hw * 0.7, radius, true],
    [hw * 0.92, radius * 0.95, false], [hw, rIn + (radius - rIn) * 0.62, false], [hw * 1.02, rIn + (radius - rIn) * 0.5, false], [hw, rIn + (radius - rIn) * 0.35, false], [hw * 0.8, rIn, false]
  ];
  const segs = lugs * 4;
  const at = (row: number, seg: number): V3 => {
    const [x, r0, crown] = prof[row]!;
    const groove = crown && seg % 4 === 0;
    const r = r0 - (groove ? depth : 0);
    const th = (seg / segs) * Math.PI * 2;
    return [x, Math.cos(th) * r, Math.sin(th) * r];
  };
  for (let row = 0; row < prof.length - 1; row++) {
    for (let seg = 0; seg < segs; seg++) s.quad(at(row, seg), at(row, seg + 1), at(row + 1, seg + 1), at(row + 1, seg));
  }
  return s.mesh();
}

/**
 * Five-spoke alloy rim for the traffic overlay: a dished barrel, a centre hub with lug nuts and bold spokes on the outer
 * (+X) face, so its rotation reads from the side and the rear three-quarter.
 */
export function buildAlloyRimMesh(radius: number, width: number, spokes = TRAFFIC_SPOKES): WheelMesh {
  const s = new Soup();
  const rRim = radius * 0.62, hw = width / 2, segs = 30;
  const ring = (x: number, r: number, th: number): V3 => [x, Math.cos(th) * r, Math.sin(th) * r];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2, b = ((i + 1) / segs) * Math.PI * 2;
    // barrel (inside the tyre bead) and the outer lip
    s.quad(ring(-hw * 0.8, rRim, a), ring(hw * 0.75, rRim, a), ring(hw * 0.75, rRim, b), ring(-hw * 0.8, rRim, b));
    s.quad(ring(hw * 0.75, rRim, a), ring(hw * 0.75, rRim * 0.92, a), ring(hw * 0.75, rRim * 0.92, b), ring(hw * 0.75, rRim, b));
    // recessed dark-ish dish behind the spokes (closes the face)
    s.tri([hw * 0.1, 0, 0], ring(hw * 0.1, rRim * 0.92, b), ring(hw * 0.1, rRim * 0.92, a));
    // hub cap
    s.tri([hw * 0.62, 0, 0], ring(hw * 0.5, radius * 0.13, a), ring(hw * 0.5, radius * 0.13, b));
  }
  const spokeW = radius * 0.11;
  for (let k = 0; k < spokes; k++) {
    const th = (k / spokes) * Math.PI * 2;
    s.box([hw * 0.15, -spokeW / 2, radius * 0.1], [hw * 0.58, spokeW / 2, rRim * 0.95], th);
  }
  for (let k = 0; k < 5; k++) {
    const th = ((k + 0.5) / 5) * Math.PI * 2;
    const nut = radius * 0.035;
    s.box([hw * 0.5, -nut, radius * 0.17 - nut], [hw * 0.66, nut, radius * 0.17 + nut], th);
  }
  return s.mesh();
}

/** Spoke-blur disc: a flat disc of `radius` on the YZ plane (axle X), drawn translucent just outside the rim face. */
export function buildBlurDiscMesh(radius: number, segs = 28, x = 0): WheelMesh {
  const s = new Soup();
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2, b = ((i + 1) / segs) * Math.PI * 2;
    s.tri([x, 0, 0], [x, Math.cos(a) * radius, Math.sin(a) * radius], [x, Math.cos(b) * radius, Math.sin(b) * radius]);
  }
  return s.mesh();
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Traffic overlay hubs (GLB frame: grounded, +Z front, metres, before the per-axis fit onto the sim box)            */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface WheelHub {
  /** Hub z (GLB frame). */
  readonly z: number;
  /** Tyre radius (the hub sits this high). */
  readonly r: number;
  /** Tyre width. */
  readonly w: number;
  /** Outer face |x| of the baked tyre on the right (+x) and left (-x) side. */
  readonly xr: number;
  readonly xl: number;
}

/**
 * Measured on each admitted GLB (vertex extents below the hub height within 0.6 r of the hub, cross-checked on side-view
 * overlay previews); outliers where the reconstruction dented a tyre were replaced by the other side of the axle.
 * swSemiRedNW is a wheel-less generation (empty arches, its perspective-tapered trailer straightened before admission):
 * its tyres are the only wheels it has, dual on the tractor drive axles and the three trailer axles (an inner tyre per hub
 * 0.34 m inboard), measured from the arch openings on an orthographic side view.
 */
export const IDOL_TRAFFIC_HUBS: Readonly<Record<string, readonly WheelHub[]>> = {
  swSedanBlueP: [{ z: -1.25, r: 0.36, w: 0.24, xr: 0.82, xl: 1.0 }, { z: 1.55, r: 0.36, w: 0.24, xr: 0.93, xl: 0.87 }],
  swSedanSandP: [{ z: -1.26, r: 0.36, w: 0.24, xr: 0.81, xl: 1.04 }, { z: 1.71, r: 0.36, w: 0.24, xr: 0.96, xl: 0.89 }],
  swSedanClayP: [{ z: -1.34, r: 0.36, w: 0.24, xr: 0.82, xl: 1.04 }, { z: 1.485, r: 0.36, w: 0.24, xr: 0.97, xl: 0.87 }],
  swHatchMustardP: [{ z: -1.33, r: 0.33, w: 0.22, xr: 0.9, xl: 0.9 }, { z: 1.29, r: 0.33, w: 0.22, xr: 0.8, xl: 0.8 }],
  swHatchSeaGlassP: [{ z: -1.52, r: 0.33, w: 0.22, xr: 1.05, xl: 1.05 }, { z: 1.25, r: 0.33, w: 0.22, xr: 1.05, xl: 1.05 }],
  swSuvSlateP: [{ z: -1.38, r: 0.39, w: 0.26, xr: 1.12, xl: 0.94 }, { z: 1.55, r: 0.39, w: 0.26, xr: 0.98, xl: 1.05 }],
  swPickupRustP: [{ z: -1.64, r: 0.4, w: 0.27, xr: 1.08, xl: 1.04 }, { z: 2.03, r: 0.4, w: 0.27, xr: 1.03, xl: 1.12 }],
  swBusShuttleP: [{ z: -3.26, r: 0.5, w: 0.32, xr: 2.85, xl: 2.79 }, { z: 3.26, r: 0.5, w: 0.32, xr: 2.84, xl: 2.79 }],
  swSemiRedNW: [
    { z: -8.3, r: 0.7, w: 0.3, xr: 1.48, xl: 1.48 },
    { z: -8.3, r: 0.7, w: 0.3, xr: 1.14, xl: 1.14 },
    { z: -6.82, r: 0.7, w: 0.3, xr: 1.48, xl: 1.48 },
    { z: -6.82, r: 0.7, w: 0.3, xr: 1.14, xl: 1.14 },
    { z: -5.41, r: 0.7, w: 0.3, xr: 1.48, xl: 1.48 },
    { z: -5.41, r: 0.7, w: 0.3, xr: 1.14, xl: 1.14 },
    { z: 0.74, r: 0.68, w: 0.3, xr: 1.36, xl: 1.36 },
    { z: 0.74, r: 0.68, w: 0.3, xr: 1.02, xl: 1.02 },
    { z: 2.34, r: 0.68, w: 0.3, xr: 1.36, xl: 1.36 },
    { z: 2.34, r: 0.68, w: 0.3, xr: 1.02, xl: 1.02 },
    { z: 8.87, r: 0.7, w: 0.32, xr: 1.42, xl: 1.42 }
  ],
  swTractorTealP: [
    { z: -3.15, r: 0.58, w: 0.32, xr: 1.56, xl: 1.58 },
    { z: -1.61, r: 0.58, w: 0.32, xr: 1.56, xl: 1.57 },
    { z: 2.26, r: 0.58, w: 0.32, xr: 1.54, xl: 1.55 }
  ]
};

/** The overlay tyre is this much larger than the baked one so it covers it from every side. */
export const OVERLAY_GROW = 1.04;
/** Gap between the baked tyre's outer face and the overlay's. */
export const OVERLAY_OUTSET = 0.012;

export interface WheelInstance {
  position: V3;
  rotation: V3;
  scale: V3;
}

/**
 * Overlay wheel transforms for one Idol vehicle instance (`base`, `yaw`, per-axis `scale` exactly as its GLB instance is
 * placed; the GLB faces +Z). Wheel meshes are built at unit radius and unit width. `angle` is the drawn roll angle.
 * Right-side wheels face +X; left-side wheels turn half a circle (rim out) and roll with the opposite local angle.
 */
export function overlayWheelTransforms(hubs: readonly WheelHub[], base: V3, yaw: number, scale: V3, angle: number, out: WheelInstance[] = []): WheelInstance[] {
  out.length = 0;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const h of hubs) {
    const rr = h.r * OVERLAY_GROW * (scale[1] + scale[2]) / 2;
    const ww = h.w * scale[0];
    for (const side of [1, -1] as const) {
      const outer = (side > 0 ? h.xr : h.xl) + OVERLAY_OUTSET;
      const lx = side * (outer - h.w / 2) * scale[0];
      const lz = h.z * scale[2];
      out.push({
        position: [base[0] + c * lx + s * lz, base[1] + h.r * scale[1], base[2] - s * lx + c * lz],
        rotation: side > 0 ? [angle, yaw, 0] : [-angle, yaw + Math.PI, 0],
        scale: [ww, rr, rr]
      });
    }
  }
  return out;
}
