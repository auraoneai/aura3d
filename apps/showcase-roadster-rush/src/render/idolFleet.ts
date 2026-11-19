/**
 * Idol wow pass (Nov 2026): the vehicles players see most are image-to-3D GLBs (speridlabs/idol/max, tools/idol/specs/
 * apex-overdrive.json) instead of the sculpted procedural hulls in art/proceduralModels.ts. Render layer only: the simulation,
 * collision boxes, pools and camera are untouched.
 *
 * Every Idol GLB is normalised to face +Z with its wheels on y = 0; the game's vehicles face -Z, so each draw adds a half turn
 * (IDOL_YAW) and each pool scales its model per axis onto the class's collision box, so roofs you can land on stay exactly
 * where the simulation puts them.
 */
import type { AuraAssetRef, AuraModelMaterialOverride } from "@aura3d/engine";
import { assets } from "../aura-assets.route";
import { PLAYER_BOX, SKY_SPEC, VEHICLE_SPECS } from "../native/constants";
import type { VehicleType } from "./pools";
import { APEX_PALETTE } from "../art/look";
import { fitBody, type FittedBody, type MeasuredBody, type WheelSet } from "./idolWheels";

type Vec3 = [number, number, number];
type ModelRef = AuraAssetRef<"model">;

/** Idol models face +Z, the game's vehicles -Z. */
export const IDOL_YAW = Math.PI;

/** Wheel-less hero body (empty arches); its four wheels are separate spinning, steering Idol wheels (HERO_WHEELS). */
export const IDOL_HERO = assets.aoHeroBodyNW5;
export const IDOL_SKY_RIVAL = assets.aoSkyRivalT;

/**
 * Classes with an admitted Idol model; a class missing here keeps its sculpted procedural hull (main.ts falls back per class).
 * Classes are added only after their 4-view preview passed review (tools/idol/specs/apex-overdrive.json).
 */
export const IDOL_TRAFFIC: Readonly<Partial<Record<VehicleType, ModelRef>>> = {
  sedan: assets.aoSedanT,
  hatch: assets.aoHatchT,
  suv: assets.aoSuvV,
  taxi: assets.aoTaxiU,
  van: assets.aoVanT,
  pickup: assets.aoPickupT,
  boxtruck: assets.aoBoxTruckU,
  bus: assets.aoBusU,
  carrier: assets.aoCarrier
};

/**
 * Exact generated sizes `[x, y, z]` in metres (vertex bounds of the shipped GLB, measured with gltf-transform getBounds). The admitted
 * manifest `bounds` are not used: for a model normalised with a non-axis yaw (hero -11 deg, carrier -42 deg) the CLI reports
 * the rotated source box, which overstates x/z (carrier 17.7 m x 17.7 m for a 4.1 m x 16 m truck).
 */
const IDOL_DIMS: Readonly<Record<string, Vec3>> = {
  aoBoxTruckU: [2.077, 3.2, 8],
  aoBusU: [4.075, 3.845, 12],
  aoCarrier: [4.129, 5.083, 16],
  aoGantryFrame: [22.8, 19.385, 3.297],
  aoHatchT: [1.897, 1.584, 4],
  aoHeroBodyNW5: [1.952, 0.965, 4.3],
  aoBoxTruckNW3: [2.948, 3.157, 8],
  aoBusNW3: [3.858, 3.691, 12],
  aoLightPoleS: [3.3, 7.7, 1.259],
  aoPickupT: [1.93, 1.741, 5.4],
  aoSedanT: [1.656, 1.369, 4.6],
  aoSkyRivalT: [2.945, 0.918, 4.3],
  aoSuvV: [1.989, 1.773, 4.8],
  aoTaxiU: [1.749, 1.637, 4.6],
  aoVanT: [1.46, 1.855, 5.2]
};
/** Exact size of an Idol model (falls back to the manifest bounds for an unknown key). */
function dimsOf(ref: ModelRef | undefined): readonly number[] | undefined {
  return ref ? IDOL_DIMS[ref.id] ?? ref.bounds : undefined;
}

/** Per-axis scale that maps a model's size `[x, y, z]` onto a `w x h x l` box. */
export function fitScale(bounds: readonly number[] | undefined, w: number, h: number, l: number): Vec3 {
  const bx = Number(bounds?.[0]) || w;
  const by = Number(bounds?.[1]) || h;
  const bz = Number(bounds?.[2]) || l;
  return [w / bx, h / by, l / bz];
}

/**
 * Traffic pools scale each class's model onto its `VEHICLE_SPECS` box (roof height is gameplay: roof running); the width
 * gets 8% for the mirrors, which the generated bounds include.
 */
export const IDOL_TRAFFIC_FIT: Readonly<Record<VehicleType, Vec3>> = Object.fromEntries(
  (Object.keys(VEHICLE_SPECS) as VehicleType[]).map((t) => {
    const s = VEHICLE_SPECS[t];
    return [t, fitScale(dimsOf(IDOL_TRAFFIC[t]), s.w * 1.08, s.h, s.l)];
  })
) as Record<VehicleType, Vec3>;

/**
 * Sky-lane rivals: the hull keeps the `SKY_SPEC` length; the swept winglets may overhang the 2 m collision width by half
 * and the V-tails rise up to 1.4x the collision height, beyond which the model is pulled in (a full squeeze would crush them).
 */
export const IDOL_SKY_FIT: Vec3 = (() => {
  const [fx, fy, fz] = fitScale(dimsOf(IDOL_SKY_RIVAL), SKY_SPEC.w, SKY_SPEC.h, SKY_SPEC.l);
  return [Math.min(fz, fx * 1.5), Math.min(fz, fy * 1.4), fz];
})();

/**
 * The hero keeps its generated proportions at the collision length; only a width or height that would leave `PLAYER_BOX`
 * is pulled in (uniform length fit is baked into the GLB).
 */
export const IDOL_HERO_FIT: Vec3 = (() => {
  const hero = dimsOf(IDOL_HERO);
  const [bx, by, bz] = [Number(hero?.[0]) || PLAYER_BOX.w, Number(hero?.[1]) || PLAYER_BOX.h, Number(hero?.[2]) || PLAYER_BOX.l];
  return [Math.min(1, (PLAYER_BOX.w * 1.06) / bx), Math.min(1, (PLAYER_BOX.h * 1.06) / by), PLAYER_BOX.l / bz];
})();

/** Row-major Ry(pi): composes the Idol half turn onto the hero's body matrix. */
export const HALF_TURN_MAT3 = [-1, 0, 0, 0, 1, 0, 0, 0, -1] as const;

/** Hero: keep the baked albedo (cobalt + tangerine), add the clearcoat lobe and the warm golden-hour rim (AO-M1). */
export function idolHeroPaint(): readonly AuraModelMaterialOverride[] {
  return [{ clearcoat: 0.7, clearcoatRoughness: 0.14, envMapIntensity: 0.62, rim: { color: APEX_PALETTE.tangerine, power: 3.5, intensity: 0.45 } }];
}

/** Sky-lane rivals: the reserved rival-red rim (AO-A2) over the baked graphite. */
export function idolRivalPaint(): readonly AuraModelMaterialOverride[] {
  return [{ clearcoat: 0.5, clearcoatRoughness: 0.18, rim: { color: APEX_PALETTE.rival, power: 2.5, intensity: 0.9 } }];
}

/** Traffic: a light lacquer and a soft sunset rim; the baked maps keep tyres and glass their own roughness. */
export function idolTrafficPaint(): readonly AuraModelMaterialOverride[] {
  return [{ clearcoat: 0.45, clearcoatRoughness: 0.12, rim: { color: "#ffb272", power: 3.8, intensity: 0.28 } }];
}

/**
 * Overhead sign gantry steel (two lattice towers + top box truss) as one Idol model per gantry, replacing the three steel
 * boxes. The sign boards, trims and labels stay procedural and keep filling exactly the collidable SIGN_BAND; the towers
 * stand in the barrier line (inner faces at |x| ~ 9.6, beyond CRASH_X_LIMIT = 9; outer faces on the 24 m deck edge) and the
 * truss sits inside the top of the band behind the boards, so everything drawn here is either crashable or out of reach. The generated model's concrete footings and a duplicated
 * back frame were cropped off before admission (provenance in the .idol.json). Fit: outer tower faces at
 * +-GANTRY_HALF_SPAN, the truss's top on SIGN_BAND.maxY, depth 60% of the width scale.
 */
export const IDOL_GANTRY = assets.aoGantryFrame;
/** Fraction of the model's height taken by the top truss (measured on the generated model). */
export const GANTRY_TRUSS_FRACTION = 0.19;
export const GANTRY_HALF_SPAN = 11.4;
export function gantryFit(signBandMaxY: number): Vec3 {
  const gantry = dimsOf(IDOL_GANTRY);
  const [bx, by] = [Number(gantry?.[0]) || 1, Number(gantry?.[1]) || 1];
  const sx = (GANTRY_HALF_SPAN * 2) / bx;
  // Pass-through QA (Nov 18): the truss used to sit ON the band (top at maxY / 0.81 = 13.7 m), in the sky lane, where a car
  // flew through it untouched (the sim only crashes inside the band and is pinned by the reference replay). The whole frame now
  // fits under the band top, so the truss is the boards' backing inside the collidable band and nothing drawn is ghost steel.
  const sy = signBandMaxY / by;
  return [sx, sy, sx * 0.6];
}

/**
 * Highway light standard (Idol), drawn at its generated size (7.7 m). Measured on the admitted GLB (+X arm, footprint-centred
 * origin): the shaft axis sits at `shaftX`, the cobra head's centre `reach` metres out along +X with its underside at `headY`.
 * The pool shifts the model so the shaft stands at x = +-12.1, and the lamp lens pool and the sodium spots move under the
 * generated head (render layer only; the procedural pole reached 1.55 m).
 */
export const IDOL_POLE = assets.aoLightPoleS;
const POLE_GEOM = { shaftX: -1.009, reach: 2.36, headY: 7.295 };
export const POLE_FIT: Vec3 = [1, 1, 1];
/** World x offset (times the row side) from the shaft to the model origin. */
export const POLE_SHAFT_SHIFT = POLE_GEOM.shaftX * POLE_FIT[0];
/** Lamp lens pool: metres from the shaft toward the road, and height (just under the head). */
export const IDOL_LAMP_REACH = POLE_GEOM.reach * POLE_FIT[0];
export const IDOL_LAMP_Y = POLE_GEOM.headY * POLE_FIT[1] - 0.04;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Moving parts: spinning wheels and lift fans (render/idolWheels.ts)                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Near-pool (<= SHADOW_NEAR) bodies: every class except the carrier uses a wheel-less Idol body (empty arches) over separate
 * spinning Idol wheels seated at the measured arch centres. The carrier keeps its baked-wheel body and only its tractor
 * axles get spinning wheels drawn over the baked tyres (approved exception). The far pools (> 90 m, a wheel spans a few
 * pixels) keep the baked-wheel models of IDOL_TRAFFIC, rigid.
 */
export const IDOL_TRAFFIC_NEAR: Readonly<Partial<Record<VehicleType, ModelRef>>> = {
  sedan: assets.aoSedanNW,
  hatch: assets.aoHatchNW,
  suv: assets.aoSuvNW,
  taxi: assets.aoTaxiNW,
  van: assets.aoVanNW,
  pickup: assets.aoPickupNW,
  boxtruck: assets.aoBoxTruckNW3,
  bus: assets.aoBusNW3,
  carrier: assets.aoCarrier
};

export const IDOL_WHEEL_MODELS = { car: assets.aoWheelCar, truck: assets.aoWheelTruck, hero: assets.aoWheelHero } as const;

/** Side-view measurements of each near body (arch centres / baked hubs, GLB frame, +Z front). */
export const MEASURED_BODIES: Readonly<Record<VehicleType, MeasuredBody>> = {
  sedan: { dims: [2.05, 1.309, 4.6], mode: "arches", archTop: 0.47, axles: [{ glbZ: 1.36, r: 0.39, sides: [-0.926, 0.833] }, { glbZ: -1.22, r: 0.36, sides: [-0.709, 1.01] }], wheel: "car", tyreRadius: 0.31, tyreWidth: 0.23, inset: 0.1 },
  hatch: { dims: [1.923, 1.345, 4], mode: "arches", archTop: 0.47, axles: [{ glbZ: 1.2, r: 0.35, sides: [-0.814, 0.819] }, { glbZ: -1.24, r: 0.35, sides: [-0.823, 0.821] }], wheel: "car", tyreRadius: 0.31, tyreWidth: 0.22, inset: 0.1 },
  suv: { dims: [2.379, 1.624, 4.8], mode: "arches", archTop: 0.6, axles: [{ glbZ: 1.26, r: 0.51, sides: [-1.085, 1.106] }, { glbZ: -1.42, r: 0.49, sides: [-1.181, 0.993] }], wheel: "car", tyreRadius: 0.37, tyreWidth: 0.27, inset: 0.12 },
  taxi: { dims: [2.008, 1.674, 4.6], mode: "arches", archTop: 0.52, axles: [{ glbZ: 1.33, r: 0.38, sides: [-0.908, 0.844] }, { glbZ: -1.41, r: 0.36, sides: [-0.817, 1.002] }], wheel: "car", tyreRadius: 0.31, tyreWidth: 0.23, inset: 0.1 },
  van: { dims: [2.293, 2.265, 5.2], mode: "arches", archTop: 0.52, axles: [{ glbZ: 1.59, r: 0.42, sides: [-0.998, 0.965] }, { glbZ: -1.59, r: 0.41, sides: [-0.778, 1.137] }], wheel: "car", tyreRadius: 0.35, tyreWidth: 0.24, inset: 0.12 },
  pickup: { dims: [2.179, 1.601, 5.4], mode: "arches", archTop: 0.56, axles: [{ glbZ: 1.72, r: 0.43, sides: [-1.022, 0.935] }, { glbZ: -1.56, r: 0.41, sides: [-0.808, 0.982] }], wheel: "car", tyreRadius: 0.39, tyreWidth: 0.27, inset: 0.12 },
  boxtruck: { dims: [2.948, 3.157, 8], mode: "arches", archTop: 0.6, axles: [{ glbZ: 2.62, r: 0.59, sides: [-1.234, 1.451] }, { glbZ: -1.61, r: 0.63, dual: true, sides: [-1.263, 1.466] }], wheel: "truck", tyreRadius: 0.44, tyreWidth: 0.27, inset: 0.12 },
  bus: { dims: [3.858, 3.691, 12], mode: "arches", archTop: 1.0, axles: [{ glbZ: 4.08, r: 0.59, sides: [-1.779, 1.785] }, { glbZ: 1.87, r: 0.59, sides: [-1.764, 1.767] }, { glbZ: -1.72, r: 0.59, sides: [-1.746, 1.758] }, { glbZ: -4.07, r: 0.59, sides: [-1.725, 1.74] }], wheel: "truck", tyreRadius: 0.52, tyreWidth: 0.28, inset: 0.1 },
  // Tractor axles only (contact points z 6.1 / drive axles 4.0, 3.1); the trailer's baked wheels stay rigid
  // GPU QA Nov 18: the baked tyres are skewed (front contact patches z 6.0-6.8 on GLB -x, 5.3-6.0 on GLB +x) and off centre
  // (contact outer faces x -1.79 / +1.33), so each side's spinning tyre follows its own baked tyre
  carrier: { dims: [4.129, 5.083, 16], mode: "overlay", axles: [{ glbZ: 6.1, r: 0.45, glbZSkew: 0.375, sides: [-1.79, 1.33] }, { glbZ: 4.0, r: 0.45, dual: true, glbZSkew: 0.375, sides: [-1.79, 1.33] }, { glbZ: 3.1, r: 0.45, dual: true, glbZSkew: 0.375, sides: [-1.79, 1.33] }], wheel: "truck", tyreRadius: 0.45, tyreWidth: 0.28, inset: 0, bakedOuterX: 1.53 }
};

/** Near-pool body placement per class: lift, per-axis fit onto VEHICLE_SPECS, and the wheel set. */
export const NEAR_BODY_FIT: Readonly<Record<VehicleType, FittedBody>> = Object.fromEntries(
  (Object.keys(VEHICLE_SPECS) as VehicleType[]).map((t) => {
    const s = VEHICLE_SPECS[t];
    return [t, fitBody(MEASURED_BODIES[t], s.w, s.h, s.l)];
  })
) as Record<VehicleType, FittedBody>;

/**
 * Hero: aoHeroBodyNW5 is wheel-less; its arches were measured on a side-view grid (GLB frame, +Z front): front arch centre
 * z +1.09 (half-length 0.34, top 0.58), rear z -1.24 (half 0.33, top 0.55). The body rides HERO_LIFT above the root so a
 * 0.30 m tyre clears the lower arch top by ARCH_GAP; the wheels sit at the arch centres (game frame, -Z front).
 */
export const HERO_WHEELS: WheelSet = (() => {
  const [fx, , fz] = IDOL_HERO_FIT;
  // GPU QA: a 0.30 m tyre flush with the 0.95 m fender skin poked through the fender tops (the skin curves down outboard).
  // Fender half-width over both arches is 0.95 m at y 0.4-0.8 and the arch opening narrows to 0.58 below y 0.4, so the tyre
  // stays inboard (outer face 0.84 m) and 0.11 m under the lifted arch top.
  const width = 0.25;
  const r = 0.27;
  const lift = 0.1;
  const x = 0.84 * fx - width / 2;
  return { kind: "hero", lift, width, axles: [{ z: -1.09 * fz, x, r }, { z: 1.24 * fz, x, r }] };
})();
/** Hero arch tops (GLB, measured) for the clearance test. */
export const HERO_ARCH_TOP = 0.55;
/** Hero fender half-width over the arches (GLB, y 0.4-0.8). */
export const HERO_FENDER_HALF_WIDTH = 0.95;

/**
 * Clean smoked-glass canopy over the hero's generated cockpit (GPU QA: the baked canopy rendered as a lumpy bronze blob under
 * the clearcoat + sunset IBL). An ellipsoid shell in the GLB frame that encloses the baked canopy (top 0.965 m, |x| <= 0.4,
 * z -0.9 .. +1.3): centre and radii below, drawn with the procedural canopy glass, following the body's attitude.
 */
export const HERO_CANOPY = { center: [0, 0.69, 0.2] as Vec3, radii: [0.47, 0.3, 1.18] as Vec3 };

/** Index of the steering axle in HERO_WHEELS.axles. */
export const HERO_FRONT_AXLE = 0;

/**
 * Sky rival lift fans: four ducts (top view of aoSkyRivalT, GLB frame, metres): rear pair x +-0.89 z -0.65 r 0.27 at the
 * duct face y 0.36; front pair x +-0.71 z +1.35 r 0.24 at y 0.31. Game frame (front -Z) after IDOL_SKY_FIT.
 */
export const SKY_FANS: readonly { readonly at: Vec3; readonly r: number; readonly phase: number }[] = (() => {
  const [fx, fy, fz] = IDOL_SKY_FIT;
  const ducts: readonly [number, number, number, number][] = [[0.89, 0.36, -0.65, 0.27], [-0.89, 0.36, -0.65, 0.27], [0.71, 0.31, 1.35, 0.24], [-0.71, 0.31, 1.35, 0.24]];
  return ducts.map(([x, y, z, r], i) => ({ at: [-x * fx, y * fy, -z * fz] as Vec3, r: r * Math.min(fx, fz), phase: i * 0.7 }));
})();
