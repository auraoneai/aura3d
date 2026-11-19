/**
 * Idol "wow pass" (Nov 2026): the objects players see most in Lamplight Line are image-to-3D GLBs from `speridlabs/idol/max`
 * (tools/idol/specs/last-train-port.json, admitted as `assets.ll*` and served route-locally). Render layer only: every node keeps
 * the id, pivot, size and +Z-forward convention of the procedural builder it replaces, so the sim, replay, camera rigs and
 * runtime bindings are unchanged.
 *
 * - Tram: Idol body whose black window glass was cut out (alpha MASK, double-sided; apps/showcase-last-train-port/tools/
 *   idol-windows.mjs) so the procedural saloon (floor, benches, warm dome lamps) and the seated riders show through, plus the
 *   procedural diamond pantograph that must meet the catenary at y = 6.68.
 * - Motorman, the four rider temperaments and six townsfolk variants: static Idol figures (riders are modelled seated).
 * - Coastal houses (plus snow-roofed variants for the snow town), clock towers, keeps, watchtowers, lighthouses, crates.
 *   House windows carry an emissive window mask lit with the band's window glow at dusk.
 */
import { geometry, group, instances, material, model, primitives, type AuraAssetRef, type AuraMaterialSpec, type AuraModelMaterialOverride, type AuraNodeBuilder, type AuraSceneNode, type AuraTransformSpec } from "@aura3d/engine";
import { IDOL_ASSETS } from "../../apps/showcase-last-train-port/src/idol-assets";
import { bevelBoxMesh, latheMesh, mergeRawMeshes, transformMesh, tubeSweepMesh, type RawMesh, type V3 } from "../../apps/showcase-port-shared/proceduralKernel";
import { STREETCAR_FLOOR_Y, lightBeamWithWgsl, unnamed, type RiderKind } from "./art/proceduralModels";
import { applyMat3, axisRotation, matrixToEulerZYX, multiplyMat3, type Mat3 } from "./orient";

type AuraGroupNode = Extract<AuraSceneNode, { readonly kind: "group" }>;

/** Set to `false` to fall back to the procedural art kit (art/proceduralModels.ts) for every replaced object. */
export const IDOL_ART = true;

export type IdolKey =
  | "llTram" | "llMotorman" | "llPaxEasy" | "llPaxSightseer" | "llPaxRushed" | "llPaxSleeper"
  | "llFolk0" | "llFolk1" | "llFolk2" | "llFolk3" | "llFolk4" | "llFolk5"
  | "llHouse0" | "llHouse1" | "llHouse2" | "llHouseSnow0" | "llHouseSnow1" | "llHouseSnow2"
  | "llClockTower" | "llClockTowerSnow" | "llLighthouse" | "llKeep" | "llWatchtower" | "llCrates";
type ModelRef = AuraAssetRef<"model">;
/** Route-local typed assets (apps/showcase-last-train-port/src/idol-assets.ts -> aura-assets.route.ts, GLBs in its public/aura-assets/). */
const IDOL = IDOL_ASSETS as unknown as Readonly<Record<string, ModelRef | undefined>>;

/** True when Idol art is on and every key is admitted (each object falls back to its procedural builder otherwise). */
export function idolReady(...keys: readonly IdolKey[]): boolean {
  return IDOL_ART && keys.every((k) => IDOL[k] !== undefined);
}
function idol(key: IdolKey): ModelRef {
  const ref = IDOL[key];
  if (!ref) throw new Error(`last-train-port: Idol asset ${key} is not admitted (check idolReady first)`);
  return ref;
}

/* ------------------------------------------------------------------ measured from the admitted GLBs (assets inspect) */

/** Idol tram body in tram-local metres (x side, y up, z forward; wheels on y = TRAM_WHEEL_Y like the procedural streetcar). */
/**
 * GPU QA: the Idol body's skirt (0.58 m in the file) hid the bogies, so the body rides `IDOL_TRAM_LIFT` higher on its
 * procedural bogies; every tram-frame height below already includes the lift.
 */
export const IDOL_TRAM_LIFT = 0.33;
export const IDOL_TRAM = {
  /** Height of the Idol body's file origin in the tram frame (its baked wheels once touched the rails at 0.035). */
  wheelY: 0.035 + IDOL_TRAM_LIFT,
  /** Saloon floor of the Idol body (window band 1.80-2.81 m after the lift). */
  floorY: 0.62 + IDOL_TRAM_LIFT,
  /** Inner half-width of the saloon at window height (cut glass reaches |x| = 1.41). */
  innerHalfWidth: 1.3,
  /** Clerestory crown at the pantograph (z = -1.25), where the pantograph base sits. */
  roofY: 3.68 + IDOL_TRAM_LIFT,
  /** Saloon ceiling under the eaves. */
  ceilingY: 2.72 + IDOL_TRAM_LIFT,
  /** Saloon length the interior spans (benches and floor). */
  saloonHalfLength: 3.7,
  /** Cab volume at each end (|z| range) where the motorman (front) and the guard (rear) stand. */
  cabZ: [3.85, 4.45] as const,
  /** Motorman / guard standing spot (|z|), clear of the end wall so the arms stay inside the body. */
  crewZ: 4.05
} as const;

/** Riders and the motorman sit this much lower in the Idol tram than on the procedural floor (render offset only). */
export const IDOL_TRAM_RIDER_DROP = STREETCAR_FLOOR_Y - IDOL_TRAM.floorY; // negative: they ride higher on the lifted body

/* ------------------------------------------------------------------ running gear (moving parts) */

/**
 * The Idol tram body ships with its baked bogies stripped (examples/last-train-port/scripts/idol-strip-running-gear.mjs, every
 * triangle below 0.6 m inside z -4.6..4.15), so two procedural bogies sit where the generated ones were (measured centres)
 * and eight spoked wheels roll on the rails: spin = distance travelled / wheel radius, about the tram's local X axis.
 */
export const TRAM_RUNNING_GEAR = {
  /** Bogie centres along the tram (rear, front), measured from the generated body's baked bogies. */
  bogieZ: [-2.95, 2.4] as const,
  /** Half the axle spacing within a bogie. */
  axleHalfSpacing: 0.62,
  /** Wheel centres sit on the rail gauge (track rails at x = +/-0.72). */
  gaugeHalf: 0.72,
  axleY: 0.43,
  /** Tyre (tread) radius: the wheel's lowest point is 0.035 m above the tram origin, like the procedural streetcar. */
  radius: 0.395,
  /** Underside of the Idol body skirt between the bogies (after the lift): the wheel tops stay below it. */
  skirtY: 0.58 + IDOL_TRAM_LIFT
} as const;

export const TRAM_WHEEL_IDS = ["tram-wheels-iron", "tram-wheels-steel"] as const;

/** Hub centres of the eight wheels in tram-local metres (x side, y up, z forward). */
export function tramWheelHubs(): V3[] {
  const g = TRAM_RUNNING_GEAR;
  const hubs: V3[] = [];
  for (const bz of g.bogieZ) for (const dz of [-g.axleHalfSpacing, g.axleHalfSpacing]) for (const sx of [-1, 1]) hubs.push([sx * g.gaugeHalf, g.axleY, bz + dz]);
  return hubs;
}

/** Advances the rolling angle by the distance covered this frame (`speed` m/s for `dt` s), wrapped to [0, 2pi). */
export function advanceWheelSpin(spin: number, speed: number, dt: number): number {
  const next = spin + (speed * Math.max(0, dt)) / TRAM_RUNNING_GEAR.radius;
  const tau = Math.PI * 2;
  return ((next % tau) + tau) % tau;
}

/** World transforms of the eight wheels for the tram pose (`rot` from tramRotation, `origin` the tram node position). */
export function tramWheelTransforms(rot: Mat3, origin: V3, spin: number): AuraTransformSpec[] {
  const euler = matrixToEulerZYX(multiplyMat3(rot, axisRotation("x", spin)));
  return tramWheelHubs().map((hub) => {
    const p = applyMat3(rot, hub);
    return { position: [origin[0] + p[0], origin[1] + p[1], origin[2] + p[2]], rotation: [euler[0], euler[1], euler[2]] };
  });
}

/** One spoked wheel (axis along X): cast-iron hub and eight spokes, plus a steel tyre with a flange and two balance weights. */
function wheelMeshes(): { iron: RawMesh; steel: RawMesh } {
  const r = TRAM_RUNNING_GEAR.radius;
  const axisX = (m: RawMesh): RawMesh => transformMesh(m, { rot: [0, 0, Math.PI * 0.5] });
  const iron: RawMesh[] = [axisX(latheMesh([[0, -0.07], [0.13, -0.07], [0.13, 0.07], [0, 0.07]], 18))];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const mid = (0.12 + r - 0.07) / 2, len = r - 0.07 - 0.12;
    iron.push(transformMesh(bevelBoxMesh(0.05, len, 0.055, 0.008), { pos: [0, Math.cos(a) * mid, Math.sin(a) * mid], rot: [a, 0, 0] }));
  }
  const steel: RawMesh[] = [axisX(latheMesh([[r - 0.085, -0.06], [r, -0.06], [r, 0.045], [r + 0.04, 0.06], [r + 0.04, 0.075], [r - 0.085, 0.075], [r - 0.085, -0.06]], 32))];
  for (const a of [0.3, 0.3 + Math.PI]) steel.push(transformMesh(bevelBoxMesh(0.07, 0.11, 0.16, 0.01), { pos: [0.01, Math.cos(a) * (r - 0.15), Math.sin(a) * (r - 0.15)], rot: [a, 0, 0] }));
  const join = (list: RawMesh[]): RawMesh => {
    const spec = mergeRawMeshes(list);
    return { positions: Array.from(spec.positions as Float32Array), normals: Array.from((spec.normals ?? new Float32Array(spec.positions.length)) as Float32Array), uvs: Array.from((spec.uvs ?? new Float32Array((spec.positions.length / 3) * 2)) as Float32Array), indices: Array.from(spec.indices as Uint16Array | Uint32Array) };
  };
  return { iron: join(iron), steel: join(steel) };
}

/** Static bogie frames (bolster, side frames, leaf springs, journal boxes, axles, brake hangers) in tram-local metres. */
function bogieFrameMesh(): RawMesh {
  const g = TRAM_RUNNING_GEAR;
  const parts: RawMesh[] = [];
  const box = (w: number, h: number, d: number, pos: V3, r = 0.015): RawMesh => transformMesh(bevelBoxMesh(w, h, d, r), { pos });
  for (const bz of g.bogieZ) {
    parts.push(box(1.94, 0.2, 0.44, [0, 0.6, bz]));
    for (const side of [-1, 1] as const) {
      parts.push(box(0.11, 0.2, 2.02, [side * 0.9, 0.52, bz]));
      parts.push(tubeSweepMesh([[side * 0.9, 0.36, bz - 0.78, 0.034], [side * 0.9, 0.29, bz, 0.038], [side * 0.9, 0.36, bz + 0.78, 0.034]], 6));
      for (const dz of [-g.axleHalfSpacing, g.axleHalfSpacing]) {
        parts.push(box(0.15, 0.26, 0.26, [side * 0.9, g.axleY + 0.02, bz + dz]));
        parts.push(box(0.1, 0.24, 0.07, [side * 0.72, g.axleY + 0.02, bz + dz + (dz > 0 ? 0.43 : -0.43)]));
      }
    }
    for (const dz of [-g.axleHalfSpacing, g.axleHalfSpacing]) parts.push(tubeSweepMesh([[-0.92, g.axleY, bz + dz, 0.06], [0.92, g.axleY, bz + dz, 0.06]], 8));
  }
  const spec = mergeRawMeshes(parts);
  return { positions: Array.from(spec.positions as Float32Array), normals: Array.from((spec.normals ?? new Float32Array(spec.positions.length)) as Float32Array), uvs: Array.from((spec.uvs ?? new Float32Array((spec.positions.length / 3) * 2)) as Float32Array), indices: Array.from(spec.indices as Uint16Array | Uint32Array) };
}

/**
 * Front cowcatcher at rail height (the Idol body's own one was cut out with the baked bogies: once the body rode 0.33 m higher
 * it floated). Slatted wrought-iron V-prow from the procedural streetcar, hung from the body's front sill by two brackets.
 */
export const COWCATCHER = { railTopY: 0.035, lowestY: 0.11, z0: 4.62, sillY: IDOL_TRAM.floorY - 0.02 } as const;
export function cowcatcherMesh(): RawMesh {
  const parts: RawMesh[] = [];
  const dz = COWCATCHER.z0 - 4.86;
  const z = (v: number) => v + dz;
  parts.push(tubeSweepMesh([[-1.16, 0.15, z(4.86), 0.036], [-0.58, 0.13, z(5.1), 0.038], [0, 0.15, z(5.28), 0.04], [0.58, 0.13, z(5.1), 0.038], [1.16, 0.15, z(4.86), 0.036]], 6));
  parts.push(tubeSweepMesh([[-1.08, 0.58, z(4.84), 0.028], [0, 0.56, z(5.1), 0.032], [1.08, 0.58, z(4.84), 0.028]], 6));
  for (let k = -3; k <= 3; k += 1) {
    const x = k * 0.32;
    parts.push(tubeSweepMesh([[x * 0.94, 0.57, z(5.08 - Math.abs(k) * 0.065), 0.02], [x, 0.13, z(5.26 - Math.abs(k) * 0.11), 0.02]], 5));
  }
  for (const bx of [-0.62, 0.62]) parts.push(transformMesh(bevelBoxMesh(0.08, COWCATCHER.sillY - 0.5, 0.08, 0.01), { pos: [bx, (COWCATCHER.sillY + 0.5) / 2, z(4.9)] }));
  const spec = mergeRawMeshes(parts);
  return { positions: Array.from(spec.positions as Float32Array), normals: Array.from((spec.normals ?? new Float32Array(spec.positions.length)) as Float32Array), uvs: Array.from((spec.uvs ?? new Float32Array((spec.positions.length / 3) * 2)) as Float32Array), indices: Array.from(spec.indices as Uint16Array | Uint32Array) };
}

let cachedWheels: ReturnType<typeof wheelMeshes> | null = null;

/** The two instanced wheel nodes (8 instances each), placed and spun every frame by the runtime with `tramWheelTransforms`. */
export function buildTramWheelNodes(castShadow: boolean): AuraNodeBuilder<AuraSceneNode>[] {
  cachedWheels ??= wheelMeshes();
  const parked = tramWheelHubs().map((): AuraTransformSpec => ({ position: [0, -400, 0] }));
  return [
    instances.custom(rawGeom(cachedWheels.iron), { name: TRAM_WHEEL_IDS[0], transforms: parked, material: unnamed(material.studioMetal({ color: "#2a2f37", roughness: 0.46, metallic: 0.82 })), castShadow, receiveShadow: true, frustumCulled: false }).runtime({ id: TRAM_WHEEL_IDS[0] }) as unknown as AuraNodeBuilder<AuraSceneNode>,
    instances.custom(rawGeom(cachedWheels.steel), { name: TRAM_WHEEL_IDS[1], transforms: parked, material: unnamed(material.studioMetal({ color: "#b9c0c8", roughness: 0.28, metallic: 0.95 })), castShadow, receiveShadow: true, frustumCulled: false }).runtime({ id: TRAM_WHEEL_IDS[1] }) as unknown as AuraNodeBuilder<AuraSceneNode>
  ];
}

/** Lighthouse lantern height (beam origin) of the Idol lighthouse. */
export const IDOL_LIGHTHOUSE_LANTERN_Y = 22.5;

/* ------------------------------------------------------------------ tram */

const PANTOGRAPH_Z = -1.25;
const PANTOGRAPH_TOP_Y = 6.68;

function pantographMeshes(baseY: number): { iron: RawMesh; brass: RawMesh; ceramic: RawMesh } {
  const iron: RawMesh[] = [], brass: RawMesh[] = [], ceramic: RawMesh[] = [];
  const panZ = PANTOGRAPH_Z;
  const frameY = baseY + 0.18;
  for (const [ix, iz] of [[-0.44, panZ - 0.36], [0.44, panZ - 0.36], [-0.44, panZ + 0.36], [0.44, panZ + 0.36]] as const) {
    ceramic.push(transformMesh(latheMesh([[0, 0], [0.068, 0], [0.052, 0.06], [0.072, 0.11], [0.045, 0.17], [0, 0.18]], 10), { pos: [ix, baseY, iz] }));
  }
  iron.push(transformMesh(bevelBoxMesh(1.04, 0.055, 0.86, 0.012), { pos: [0, frameY, panZ] }));
  for (const sx of [-0.24, 0.24]) {
    brass.push(transformMesh(latheMesh([[0, -0.28], [0.045, -0.28], [0.045, 0.28], [0, 0.28]], 10), { pos: [sx, frameY + 0.06, panZ], rot: [Math.PI * 0.5, 0, 0] }));
  }
  const armBaseY = frameY + 0.04;
  const apexY = PANTOGRAPH_TOP_Y - 0.06;
  const elbowY = (armBaseY + apexY) * 0.5;
  for (const sx of [-0.38, 0.38]) {
    for (const dirZ of [-1, 1] as const) {
      const elbowX = sx * 0.96, elbowZ = panZ + dirZ * 0.88;
      const apexX = sx * 0.86, apexZ = panZ + dirZ * 0.08;
      iron.push(tubeSweepMesh([[sx, armBaseY, panZ + dirZ * 0.16, 0.024], [elbowX, elbowY, elbowZ, 0.022]], 6));
      iron.push(tubeSweepMesh([[elbowX, elbowY, elbowZ, 0.02], [apexX, apexY, apexZ, 0.018]], 6));
    }
  }
  for (const dirZ of [-1, 1] as const) {
    const elbowZ = panZ + dirZ * 0.88;
    iron.push(tubeSweepMesh([[-0.36, elbowY, elbowZ, 0.018], [0.36, elbowY, elbowZ, 0.018]], 6));
    iron.push(tubeSweepMesh([[-0.38, armBaseY, panZ + dirZ * 0.16, 0.013], [0.36, elbowY, elbowZ, 0.013]], 5));
  }
  for (const panOff of [-0.1, 0.1]) {
    brass.push(tubeSweepMesh([
      [-0.96, PANTOGRAPH_TOP_Y - 0.1, panZ + panOff, 0.016],
      [-0.7, PANTOGRAPH_TOP_Y, panZ + panOff, 0.024],
      [0.7, PANTOGRAPH_TOP_Y, panZ + panOff, 0.024],
      [0.96, PANTOGRAPH_TOP_Y - 0.1, panZ + panOff, 0.016]
    ], 7));
  }
  const join = (list: RawMesh[]): RawMesh => {
    const spec = mergeRawMeshes(list);
    return { positions: Array.from(spec.positions as Float32Array), normals: Array.from((spec.normals ?? new Float32Array(spec.positions.length)) as Float32Array), uvs: Array.from((spec.uvs ?? new Float32Array((spec.positions.length / 3) * 2)) as Float32Array), indices: Array.from(spec.indices as Uint16Array | Uint32Array) };
  };
  return { iron: join(iron), brass: join(brass), ceramic: join(ceramic) };
}

/** Saloon interior fitted inside the Idol shell: floor, two longitudinal benches with backs, ceiling, dome lamps and a sill glow. */
function saloonMeshes(): { wood: RawMesh; ceiling: RawMesh; brass: RawMesh; glow: RawMesh } {
  const t = IDOL_TRAM;
  const hw = t.innerHalfWidth, hl = t.saloonHalfLength;
  const box = (w: number, h: number, d: number, pos: V3, r = 0.012): RawMesh => transformMesh(bevelBoxMesh(w, h, d, r), { pos });
  const fy = t.floorY;
  const wood = [box(hw * 2, 0.08, hl * 2 + 0.6, [0, fy, 0])];
  const benchX = Math.min(1.0, hw - 0.33);
  const brass: RawMesh[] = [];
  for (const side of [-1, 1] as const) {
    wood.push(box(0.62, 0.11, hl * 1.6, [side * benchX, fy + 0.5, 0], 0.022));
    wood.push(box(0.09, 0.56, hl * 1.6, [side * (hw - 0.04), fy + 0.82, 0], 0.02));
    brass.push(tubeSweepMesh([[side * 0.56, t.ceilingY - 0.18, -hl * 0.78, 0.016], [side * 0.56, t.ceilingY - 0.18, hl * 0.78, 0.016]], 5));
    for (const z of [-hl * 0.6, 0, hl * 0.6]) brass.push(tubeSweepMesh([[side * 0.56, fy + 0.04, z, 0.02], [side * 0.56, t.ceilingY - 0.18, z, 0.02]], 6));
  }
  const ceiling = [box(hw * 2 - 0.04, 0.06, hl * 2 + 0.4, [0, t.ceilingY, 0])];
  const glow: RawMesh[] = [];
  for (const lz of [-hl * 0.62, 0, hl * 0.62]) glow.push(transformMesh(latheMesh([[0, 0], [0.14, 0.04], [0.17, 0.12], [0.1, 0.2], [0, 0.22]], 12), { pos: [0, t.ceilingY - 0.22, lz] }));
  const join = (list: RawMesh[]): RawMesh => {
    const spec = mergeRawMeshes(list);
    return { positions: Array.from(spec.positions as Float32Array), normals: Array.from((spec.normals ?? new Float32Array(spec.positions.length)) as Float32Array), uvs: Array.from((spec.uvs ?? new Float32Array((spec.positions.length / 3) * 2)) as Float32Array), indices: Array.from(spec.indices as Uint16Array | Uint32Array) };
  };
  return { wood: join(wood), ceiling: join(ceiling), brass: join(brass), glow: join(glow) };
}

let cachedTramParts: { readonly panto: ReturnType<typeof pantographMeshes>; readonly saloon: ReturnType<typeof saloonMeshes>; readonly bogies: RawMesh; readonly cowcatcher: RawMesh } | null = null;

const rawGeom = (m: RawMesh) => mergeRawMeshes([m]);

/** `tram-body`: the Idol streetcar + saloon interior + pantograph + lamp lenses, in the procedural streetcar's frame. */
export function buildIdolTramNode(name: string, bulbIntensity: number, castShadow: boolean): AuraNodeBuilder<AuraGroupNode> {
  if (!cachedTramParts) cachedTramParts = { panto: pantographMeshes(IDOL_TRAM.roofY), saloon: saloonMeshes(), bogies: bogieFrameMesh(), cowcatcher: cowcatcherMesh() };
  const { panto, saloon, bogies, cowcatcher } = cachedTramParts;
  const glowGain = Math.min(1.5, Math.max(0.5, bulbIntensity * 0.64));
  const custom = (id: string, mesh: RawMesh, mat: AuraMaterialSpec, cast = false) =>
    geometry.custom(rawGeom(mesh), { name: `${name} ${id}`, material: mat, castShadow: castShadow && cast, receiveShadow: true });
  return group(name, [
    model(idol("llTram"), { scaleMode: "world", name: `${name} idol`, position: [0, IDOL_TRAM.wheelY, 0], castShadow, receiveShadow: true }),
    custom("saloon wood", saloon.wood, unnamed(material.pbr({ color: "#684128", roughness: 0.58, clearcoat: 0.18, clearcoatRoughness: 0.28 }))),
    custom("saloon ceiling", saloon.ceiling, unnamed(material.lacquer({ color: "#f5ebd6", roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.1 }))),
    custom("saloon brass", saloon.brass, unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.21, metallic: 0.93, envMapIntensity: 1.05 }))),
    custom("saloon lamps", saloon.glow, unnamed(material.emissive({ color: "#ffe5b6", emissive: "#ffc26e", emissiveIntensity: glowGain, practical: true }))),
    custom("pantograph iron", panto.iron, unnamed(material.studioMetal({ color: "#232932", roughness: 0.42, metallic: 0.86, envMapIntensity: 0.85 })), true),
    custom("pantograph brass", panto.brass, unnamed(material.studioMetal({ color: "#dbb056", roughness: 0.21, metallic: 0.93, envMapIntensity: 1.05 }))),
    custom("pantograph insulators", panto.ceramic, unnamed(material.ceramic({ color: "#f2ede2", roughness: 0.24 }))),
    custom("cowcatcher", cowcatcher, unnamed(material.studioMetal({ color: "#232932", roughness: 0.42, metallic: 0.86, envMapIntensity: 0.85 })), true),
    custom("bogies", bogies, unnamed(material.studioMetal({ color: "#232932", roughness: 0.42, metallic: 0.86, envMapIntensity: 0.85 })), true)
  ]).runtime({ id: name });
}

/* ------------------------------------------------------------------ figures */

export function buildIdolMotormanNode(name: string, castShadow: boolean): AuraNodeBuilder<AuraGroupNode> {
  return group(name, [model(idol("llMotorman"), { scaleMode: "world", name: `${name} idol`, castShadow, receiveShadow: false })]).runtime({ id: name });
}

export const RIDER_KEYS = { easy: "llPaxEasy", sightseer: "llPaxSightseer", rushed: "llPaxRushed", sleeper: "llPaxSleeper" } as const satisfies Record<RiderKind, IdolKey>;
/** The procedural rider's origin sits 1.24 m above its feet (riderMotion.ts seatedRiderPose yOffset). */
export const RIDER_ORIGIN_ABOVE_FEET = 1.24;

export function buildIdolPassengerNode(kind: RiderKind, name: string, castShadow: boolean): AuraNodeBuilder<AuraGroupNode> {
  return group(name, [model(idol(RIDER_KEYS[kind]), { scaleMode: "world", name: `${name} idol`, position: [0, -RIDER_ORIGIN_ABOVE_FEET, 0], castShadow, receiveShadow: false })]).runtime({ id: name });
}

export const FOLK_KEYS = ["llFolk0", "llFolk1", "llFolk2", "llFolk3", "llFolk4", "llFolk5"] as const satisfies readonly IdolKey[];
/** Admitted townsfolk variants (a variant still generating is replaced by the next admitted one). */
const folkAssets = (): ModelRef[] => FOLK_KEYS.filter((k) => idolReady(k)).map(idol);

/** Collects townsfolk placements per variant; `nodes()` returns one `instances.model` node per used variant. */
export function createFolkInstancer(): { add(variant: number, position: V3, yaw: number, scale: number): void; nodes(): AuraNodeBuilder<AuraSceneNode>[] } {
  const refs = folkAssets();
  const n = refs.length;
  const buckets = refs.map(() => [] as AuraTransformSpec[]);
  return {
    add(variant, position, yaw, scale) {
      if (n === 0) return;
      buckets[((variant % n) + n) % n]!.push({ position: [...position], rotation: [0, yaw, 0], scale });
    },
    nodes() {
      return buckets.flatMap((transforms, v) => transforms.length === 0 ? [] : [
        instances.model(refs[v]!, { scaleMode: "world", name: `folk-idol-${v}`, transforms, castShadow: false, receiveShadow: false }) as unknown as AuraNodeBuilder<AuraSceneNode>
      ]);
    }
  };
}

/* ------------------------------------------------------------------ town buildings */

export const HOUSE_KEYS = ["llHouse0", "llHouse1", "llHouse2"] as const satisfies readonly IdolKey[];
/** Street-face (+Z) extent of the three procedural coastal house variants (art/proceduralModels.ts buildCoastalHouseNode). */
const PROCEDURAL_HOUSE_FRONT_Z = [4.44, 5.24, 4.84] as const;
const SNOW_HOUSE_KEYS = ["llHouseSnow0", "llHouseSnow1", "llHouseSnow2"] as const satisfies readonly IdolKey[];

/** Warm window glow on the Idol window mask (dusk bands); empty by day. */
export function windowGlowOverrides(windowGlow: number): readonly AuraModelMaterialOverride[] {
  return windowGlow > 0.05 ? [{ emissive: "#ffc972", emissiveIntensity: windowGlow }] : [];
}

/** Collects coastal house placements per (variant, snow); `nodes()` returns one `instances.model` per used kind. */
/** Base height for a footprint (`halfX`, `halfZ` metres, turned by `yaw`) at (x, z): see grounding.ts `groundedBase`. */
export type GroundFn = (x: number, z: number, halfX: number, halfZ: number, yaw: number) => number;

/** Half footprint (x, z) of an admitted Idol model from its manifest bounds, times an optional horizontal scale. */
export function idolHalfFootprint(key: IdolKey, scale = 1): [number, number] {
  const b = (IDOL[key] as { readonly bounds?: readonly number[] } | undefined)?.bounds;
  return b ? [(b[0]! / 2) * scale, (b[2]! / 2) * scale] : [0.5, 0.5];
}

export function createHouseInstancer(ground?: GroundFn): { add(variant: number, snow: boolean, position: V3, yaw: number): void; nodes(windowGlow: number, castShadow: boolean): AuraNodeBuilder<AuraSceneNode>[] } {
  const buckets = new Map<string, { asset: ModelRef; transforms: AuraTransformSpec[] }>();
  return {
    add(variant, snow, position, yaw) {
      const v = ((variant % 3) + 3) % 3;
      const useSnow = snow && idolReady(SNOW_HOUSE_KEYS[v]!);
      const key = `${useSnow ? "snow" : "house"}-${v}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { asset: idol((useSnow ? SNOW_HOUSE_KEYS : HOUSE_KEYS)[v]!), transforms: [] }));
      // Keep the street face where the procedural house had it: Idol houses are deeper, so push them back along -forward.
      const depth = (b.asset as { readonly bounds?: readonly number[] }).bounds?.[2] ?? PROCEDURAL_HOUSE_FRONT_Z[v]! * 2;
      const back = Math.max(0, depth / 2 - PROCEDURAL_HOUSE_FRONT_Z[v]!);
      const x = position[0] - Math.sin(yaw) * back, z = position[2] - Math.cos(yaw) * back;
      const half = idolHalfFootprint((useSnow ? SNOW_HOUSE_KEYS : HOUSE_KEYS)[v]!);
      b.transforms.push({ position: [x, ground ? ground(x, z, half[0], half[1], yaw) : position[1], z], rotation: [0, yaw, 0] });
    },
    nodes(windowGlow, castShadow) {
      const overrides = windowGlowOverrides(windowGlow);
      return [...buckets.entries()].map(([key, b]) =>
        instances.model(b.asset, { scaleMode: "world", name: `houses-idol-${key}`, transforms: b.transforms, castShadow, receiveShadow: true, ...(overrides.length ? { materialOverrides: overrides } : {}) }) as unknown as AuraNodeBuilder<AuraSceneNode>
      );
    }
  };
}

export function buildIdolClockTowerNode(name: string, position: V3, yaw: number, windowGlow: number, snowCap: boolean, castShadow: boolean): AuraNodeBuilder<AuraSceneNode> {
  const overrides = windowGlowOverrides(windowGlow);
  return model(idol(snowCap && idolReady("llClockTowerSnow") ? "llClockTowerSnow" : "llClockTower"), { scaleMode: "world", name, position, rotation: [0, yaw, 0], castShadow, receiveShadow: true, ...(overrides.length ? { materialOverrides: overrides } : {}) });
}

/** Horizontal slimming applied to the Idol keep / watchtower (see buildIdolLandmarkNode). */
export function landmarkSlim(variant: "keep" | "tower"): number {
  const [hx, hz] = idolHalfFootprint(variant === "keep" ? "llKeep" : "llWatchtower");
  const footprint = 2 * Math.max(hx, hz);
  return footprint > 0 ? Math.min(1, (1.35 * (variant === "keep" ? 12.2 : 10.8)) / footprint) : 1;
}

export function buildIdolLandmarkNode(variant: "keep" | "tower", name: string, position: V3, yaw: number, castShadow: boolean): AuraNodeBuilder<AuraSceneNode> {
  // Idol reads the keep / watchtower stockier than the procedural ones (12.2 / 10.8 m wide): slim the footprint to at most
  // 1.35x the procedural width so they keep clear of the trees and rocks placed around them.
  const ref = idol(variant === "keep" ? "llKeep" : "llWatchtower");
  const b = (ref as { readonly bounds?: readonly number[] }).bounds;
  const footprint = b ? Math.max(b[0]!, b[2]!) : 0;
  const s = footprint > 0 ? Math.min(1, (1.35 * (variant === "keep" ? 12.2 : 10.8)) / footprint) : 1;
  return model(ref, { scaleMode: "world", name, position, rotation: [0, yaw, 0], scale: [s, 1, s], castShadow, receiveShadow: true });
}

export function buildIdolCratesNode(name: string, position: V3, yaw: number, castShadow: boolean): AuraNodeBuilder<AuraSceneNode> {
  return model(idol("llCrates"), { scaleMode: "world", name, position, rotation: [0, yaw, 0], castShadow, receiveShadow: true });
}

/** Lighthouse: the Idol tower + the procedural twin light-beam cones and a glowing optic at the lantern. */
export function buildIdolLighthouseNode(name: string, position: V3, yaw: number, beamIntensity: number, castShadow: boolean): AuraNodeBuilder<AuraGroupNode> {
  const beamLen = 26, y = IDOL_LIGHTHOUSE_LANTERN_Y;
  const beamMat = lightBeamWithWgsl({ color: "#ffe7ad", intensity: Math.max(0.08, beamIntensity), length: beamLen, falloff: 1.35, edgeSoftness: 1.5, noise: 0.28, noiseScale: 3.4, noiseSpeed: 0.22 });
  const cone = (id: string, dir: 1 | -1) => primitives.cone({
    name: `${name}-${id}`,
    position: [0, y, dir * beamLen * 0.5],
    rotation: [-dir * Math.PI * 0.5, 0, 0],
    params: { radius: 3.8, height: beamLen, radialSegments: 32, heightSegments: 8, openEnded: true },
    material: beamMat,
    castShadow: false,
    receiveShadow: false
  });
  return group(name, [
    model(idol("llLighthouse"), { scaleMode: "world", name: `${name}-tower`, castShadow, receiveShadow: true }),
    geometry.custom(rawGeom(transformMesh(latheMesh([[0, -0.55], [0.5, -0.4], [0.62, 0], [0.5, 0.4], [0, 0.55]], 16), { pos: [0, y, 0] })), {
      name: `${name}-optic`, material: unnamed(material.emissive({ color: "#fff0c4", emissive: "#ffd27d", emissiveIntensity: Math.max(0.65, beamIntensity * 3.4), practical: true })), castShadow: false, receiveShadow: false
    }),
    cone("beam-a", 1),
    cone("beam-b", -1)
  ], { position, rotation: [0, yaw, 0] }).runtime({ id: name });
}
