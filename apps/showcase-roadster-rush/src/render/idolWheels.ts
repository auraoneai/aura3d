/**
 * Moving-parts pass (Nov 2026): Idol returns one rigid mesh, so every Apex vehicle body is a wheel-less Idol generation
 * (empty arches) and its wheels are separate instanced Idol wheel models that roll with the distance the vehicle travels.
 * Sky-lane rivals keep their Idol hull and get four spinning lift-fan rotors in its ducts. Pure math (no engine imports)
 * so tests/unit/roadster-rush-native/idol-wheels.test.ts can drive it frame by frame.
 *
 * Frames: a "vehicle-local game frame" faces -Z (the travel direction), +X is the vehicle's right, y = 0 is the road. Wheel
 * models are normalised with the axle on X and the rim face toward +X; a left-side wheel turns half a circle so its rim
 * faces out, and rolls with the opposite local angle so both sides roll forward together.
 */

export type Vec3 = [number, number, number];

export interface WheelAxle {
  /** Hub z in the vehicle-local game frame (front axle negative). */
  readonly z: number;
  /** Half track: hub x of the right wheel (the left wheel mirrors it). */
  readonly x: number;
  /** Tyre radius (the hub sits this high above the road). */
  readonly r: number;
  /** Twin rear tyres: a second wheel this far inboard of the first. */
  readonly dualInset?: number;
  /** Lateral centre of this axle's arches in the game frame (Idol bodies are not exactly symmetric; 0 when omitted). */
  readonly cx?: number;
  /** Skewed bodies: the right (+x) wheel's hub sits this much further along z than the axle z, the left one this much less. */
  readonly dz?: number;
}

export interface WheelSet {
  readonly kind: "car" | "truck" | "hero";
  /** Ride height added under the wheel-less body (its lowest point sits this high above the road). */
  readonly lift: number;
  /** Tyre width in metres. */
  readonly width: number;
  readonly axles: readonly WheelAxle[];
}

/** Normalised size of a wheel model: diameter (y/z) and tread width (x), measured on the admitted GLB. */
export interface WheelModelSize {
  readonly diameter: number;
  readonly width: number;
  /**
   * Bounds centre of the admitted GLB in its own frame. The Idol wheel GLBs keep their origin at the BOTTOM of the tyre
   * (y 0 .. diameter), so an instance placed at the hub and rolled about its origin would orbit the hub by a full radius
   * (owner QA Nov 18: wobbling wheels). Every instance is offset by -R * (S * centre) so it turns about its hub.
   */
  readonly centre: Vec3;
}

export interface WheelTransform {
  /** Hub centre (world). */
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  /** Instance translation (the model origin) that puts the GLB's bounds centre on `position` (see WheelModelSize.centre). */
  origin: Vec3;
}

/**
 * Highest DRAWN wheel spin (rad/s): above it the tread steps more than ~0.3 rad a 60 Hz frame and strobes (reads as a
 * shaking or stopped wheel). The see-through spoke-blur disc over the still-visible tyre carries the real speed.
 */
export const WHEEL_SPIN_SHOWN_MAX = 18;

/**
 * Advances a wheel's drawn rolling distance by a sim step `dz` (m along z) over `dt` seconds, capped so the drawn spin of a
 * radius-`r` wheel never exceeds WHEEL_SPIN_SHOWN_MAX. A jump of more than `resetAt` metres (a recycled traffic slot,
 * a respawn) is not rolled at all.
 */
export function shownRollDistance(prev: number, dz: number, dt: number, r: number, resetAt = 6): number {
  if (!Number.isFinite(dz) || Math.abs(dz) > resetAt) return prev;
  const cap = WHEEL_SPIN_SHOWN_MAX * Math.max(0, r) * Math.max(0, dt);
  return prev + Math.max(-cap, Math.min(cap, dz));
}

/** Instance translation for a wheel whose hub is `hub`: hub - R(rotation, engine ZYX) * (scale * centre). */
export function wheelOrigin(hub: Vec3, rotation: Vec3, scale: Vec3, centre: Vec3): Vec3 {
  const m = mat3FromEulerZYX(rotation[0], rotation[1], rotation[2]);
  const lx = scale[0] * centre[0], ly = scale[1] * centre[1], lz = scale[2] * centre[2];
  return [
    hub[0] - (m[0] * lx + m[1] * ly + m[2] * lz),
    hub[1] - (m[3] * lx + m[4] * ly + m[5] * lz),
    hub[2] - (m[6] * lx + m[7] * ly + m[8] * lz)
  ];
}

/**
 * Roll angle about the axle for a vehicle at sim z (travel is toward -z): Rx(theta) moves the top of the wheel toward +z as
 * theta grows, so rolling forward (z falling) means theta = z / r falls with it.
 */
export function wheelRoll(simZ: number, radius: number): number {
  return radius > 0 ? simZ / radius : 0;
}

/** Number of wheel instances a set draws (dual tyres count twice per side). */
export function wheelCount(set: WheelSet): number {
  let n = 0;
  for (const a of set.axles) n += a.dualInset ? 4 : 2;
  return n;
}

/**
 * Wheel instance transforms for one vehicle on the ground: `at` is the vehicle origin (road level, render space), `yaw` its
 * heading (the game's, 0 = travelling -Z), `simZ` its drawn rolling distance (shownRollDistance) for the roll angle. Wheels do not follow the body's
 * honk hop or wobble (they stay planted, the body rides on its suspension) unless `hop` is passed.
 */
export function vehicleWheelTransforms(set: WheelSet, model: WheelModelSize, at: Vec3, yaw: number, simZ: number, hop = 0, out: WheelTransform[] = []): WheelTransform[] {
  out.length = 0;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const axle of set.axles) {
    const roll = wheelRoll(simZ, axle.r);
    const k = (2 * axle.r) / model.diameter;
    const kw = set.width / model.width;
    const offsets = axle.dualInset ? [axle.x, axle.x - axle.dualInset] : [axle.x];
    for (const ox of offsets) {
      for (const side of [1, -1] as const) {
        const lx = (axle.cx ?? 0) + side * ox, lz = axle.z + side * (axle.dz ?? 0);
        // Ry(yaw) applied to the local offset (x, z)
        const wx = at[0] + c * lx + s * lz;
        const wz = at[2] - s * lx + c * lz;
        const position: Vec3 = [wx, at[1] + hop + axle.r, wz];
        const rotation: Vec3 = side > 0 ? [roll, yaw, 0] : [-roll, yaw + Math.PI, 0];
        const scale: Vec3 = [kw, k, k];
        out.push({ position, rotation, scale, origin: wheelOrigin(position, rotation, scale, model.centre) });
      }
    }
  }
  return out;
}

/** Hub offsets (vehicle-local game frame) with the side, for wheels that must follow a full body attitude (the hero). */
export function wheelHubs(set: WheelSet): { readonly hub: Vec3; readonly side: 1 | -1; readonly r: number }[] {
  const hubs: { hub: Vec3; side: 1 | -1; r: number }[] = [];
  for (const axle of set.axles) {
    const offsets = axle.dualInset ? [axle.x, axle.x - axle.dualInset] : [axle.x];
    for (const ox of offsets) for (const side of [1, -1] as const) hubs.push({ hub: [(axle.cx ?? 0) + side * ox, axle.r, axle.z + side * (axle.dz ?? 0)], side, r: axle.r });
  }
  return hubs;
}

/** Row-major local orientation of a hero wheel: roll about the axle, then a half turn for the left side. */
export function wheelLocalMat3(side: 1 | -1, roll: number): readonly [number, number, number, number, number, number, number, number, number] {
  const c = Math.cos(roll), s = Math.sin(roll);
  // Rx(roll) = [1 0 0; 0 c -s; 0 s c]; left: Ry(pi) * Rx(-roll) = [-1 0 0; 0 c s; 0 s -c] (with roll -> -roll: -s -> s)
  return side > 0 ? [1, 0, 0, 0, c, -s, 0, s, c] : [-1, 0, 0, 0, c, s, 0, s, -c];
}

/** Lift-fan rotor spin (rad) at sim time t: a steady fast idle. */
export function fanSpin(t: number, phase = 0): number {
  return t * 31 + phase;
}

/** Row-major rotation matrix of engine "ZYX" Euler angles: R = Rz(rz) * Ry(ry) * Rx(rx). */
export function mat3FromEulerZYX(rx: number, ry: number, rz: number): [number, number, number, number, number, number, number, number, number] {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx
  ];
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Measured layouts (side-view grids of the admitted GLBs, GLB frame: +Z front, y = 0 road; see the moving-parts notes)  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** One axle measured on a GLB: hub z (GLB +Z front) and the radius of the arch opening / baked tyre. */
export interface MeasuredAxle {
  readonly glbZ: number;
  readonly r: number;
  readonly dual?: boolean;
  /**
   * Measured body side faces at this axle (GLB x of the left and right skin over the arch, y 0.1 .. archTop + 0.3). Idol
   * bodies are skewed by a few degrees and are not centred on x = 0 (sedan rear arches sit +0.15 m off centre), and their
   * overall width includes the mirrors, so the wheels are seated against these faces instead (GPU QA Nov 18: sedan / van
   * tyres poked 0.2 m out of the rear arches).
   */
  readonly sides?: readonly [number, number];
  /**
   * Overlay bodies whose baked tyres are skewed: the GLB -x side's hubs sit this much further forward (GLB +z) than glbZ and
   * the +x side's this much further back (GPU QA Nov 18: the carrier's spinning tyres hung half a wheel ahead of its baked
   * tyres on one side). Measured from the road-contact patches of the front tyres.
   */
  readonly glbZSkew?: number;
}

export interface MeasuredBody {
  /** GLB size [x, y, z] in metres. */
  readonly dims: Vec3;
  /**
   * "arches": a wheel-less body (empty arches, measured arch top height `archTop`); "overlay": a body with baked rigid
   * wheels, the spinning wheels are drawn slightly larger right over them.
   */
  readonly mode: "arches" | "overlay";
  readonly archTop?: number;
  readonly axles: readonly MeasuredAxle[];
  readonly wheel: "car" | "truck" | "hero";
  readonly tyreRadius: number;
  readonly tyreWidth: number;
  /** Extra inboard shift of the tyre centre from the body's side (metres, after the width fit). */
  readonly inset: number;
  /** Overlay mode: outer face x of the baked tyres (GLB, from their road contact points); the overlay sits 2 cm beyond it. */
  readonly bakedOuterX?: number;
}

/** Wheel model sizes (diameter, tread width) of aoWheelCar / aoWheelTruck / aoWheelHero (x = axle). */
export const WHEEL_MODELS: Readonly<Record<WheelSet["kind"], WheelModelSize>> = {
  // centre = circle fitted to each GLB's tread (within 2 mm of its bounds centre; the Idol treads are slightly lumpy)
  car: { diameter: 0.66, width: 0.149, centre: [0, 0.329, -0.0008] },
  truck: { diameter: 1.0, width: 0.453, centre: [0, 0.4984, 0.0002] },
  hero: { diameter: 0.7, width: 0.209, centre: [0, 0.3512, 0.0006] }
};

/** Gap between the tyre top and the arch top of a wheel-less body. */
export const ARCH_GAP = 0.03;
/** Gap between a tyre's outer face and the measured body side at its arch. */
export const ARCH_SIDE_GAP = 0.03;

/** Body placement for one class: the GLB is lifted by `lift` and scaled per axis by `fit` onto the class's collision box. */
export interface FittedBody {
  readonly lift: number;
  readonly fit: Vec3;
  readonly wheels: WheelSet;
}

/**
 * Fit a measured body onto a `w x h x l` collision box. Wheel-less bodies are raised so the tyre (radius `tyreRadius`) clears
 * the scaled arch top by ARCH_GAP while the roof stays at `h`: lift + archTop * (h - lift) / H = 2r + gap.
 */
export function fitBody(m: MeasuredBody, w: number, h: number, l: number, widthPad = 1.08): FittedBody {
  const [bx, by, bz] = m.dims;
  const r = m.tyreRadius;
  let lift = 0;
  if (m.mode === "arches") {
    const top = m.archTop ?? by * 0.4;
    lift = Math.max(0, (2 * r + ARCH_GAP - (top * h) / by) / (1 - top / by));
  }
  const fit: Vec3 = [(w * widthPad) / bx, (h - lift) / by, l / bz];
  const halfW = (bx * fit[0]) / 2;
  const x = m.mode === "overlay" && m.bakedOuterX !== undefined ? m.bakedOuterX * fit[0] + 0.02 - m.tyreWidth / 2 : halfW - m.tyreWidth / 2 - m.inset;
  // Overlay wheels cover the baked tyre, which the per-axis fit turned into an ellipse: take its larger semi-axis + 4%
  const axleR = (a: MeasuredAxle): number => (m.mode === "arches" ? r : a.r * Math.max(fit[1], fit[2]) * 1.04);
  const axles: WheelAxle[] = m.axles.map((a) => {
    // Seated between the measured arch faces (centred on them): the tyre's outer face sits ARCH_SIDE_GAP inside the skin
    const seated = m.mode === "arches" && a.sides !== undefined;
    const half = seated ? ((a.sides![1] - a.sides![0]) / 2) * fit[0] : 0;
    const ax = seated ? Math.min(x, half - m.tyreWidth / 2 - ARCH_SIDE_GAP) : x;
    // game frame = GLB turned by pi about y: GLB +x is game -x
    // overlay: centred between the baked tyres' measured outer faces (`sides`), 2 cm beyond them
    const overlaySides = m.mode === "overlay" && a.sides !== undefined;
    const cx = seated || overlaySides ? -((a.sides![0] + a.sides![1]) / 2) * fit[0] : 0;
    const ox = overlaySides ? ((a.sides![1] - a.sides![0]) / 2) * fit[0] + 0.02 - m.tyreWidth / 2 : ax;
    // game frame: game +x is GLB -x, game z = -GLB z, so the GLB -x side's forward skew is a negative dz on the +x side
    const dz = a.glbZSkew ? -a.glbZSkew * fit[2] : 0;
    return { z: -a.glbZ * fit[2], x: ox, r: axleR(a), ...(cx !== 0 ? { cx } : {}), ...(dz !== 0 ? { dz } : {}), ...(a.dual ? { dualInset: m.tyreWidth * 1.05 } : {}) };
  });
  return { lift, fit, wheels: { kind: m.wheel, lift, width: m.tyreWidth, axles } };
}

/** Hero front-wheel steer target (rad, + = left) for a lateral speed (m/s, + = moving right): a lane change at 9 m/s ~ 0.4. */
export function heroSteerTarget(lateralSpeed: number): number {
  return Math.max(-0.42, Math.min(0.42, -lateralSpeed * 0.045));
}

/** Eases the steer angle toward its target (critically fast, ~80 ms). */
export function easeSteer(current: number, target: number, dt: number): number {
  return current + (target - current) * Math.min(1, Math.max(0, dt) * 12);
}
