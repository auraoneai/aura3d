/**
 * GU47 WP-21 look table (PRD §3.2 item 2): "Cold-War bunker lit by its own fixtures".
 *
 * One row per floor variant, the `?floor=` targets of `tests/browser/game-luma-targets.ts` (BUNKER_FLOORS): a buried
 * civil-defence bunker lit only by its own fixtures, one lamp colour per floor (F1 tungsten, F2 green-teal wet cellar,
 * F3 forge orange from the grates, F4 brass and wood, F5 cold fluorescent, F6 red alarm under a moonlit hatch, Kill
 * House white floods). Board-formed concrete, olive steel and rust; hazard yellow is the only saturated accent.
 *
 * No ambient, no hemisphere, no directional fill and no look preset (BZ-01): the scene's light is the per-floor rig in
 * `lightRig.ts` (one shadowed key spot, one fill spot, the player's carried lamp at 1.2 and a pool of fixture points),
 * the hangar_interior IBL at 0.35 (BZ-05), fog at 30% of the lamp value (BZ-02) and the gunfire transient lights of the
 * VFX pack (`vfx.ts`, BZ-03). Every value here is presentation only: nothing feeds the simulation (PRD D8).
 */
import { CELL, FLOORS, KILL_HOUSE, SILO_H, WALL_H, type FloorDef } from "../maps";

/** The capture variants (`bunker-zero--<variant>`), in BUNKER_FLOORS order. */
export const BZ_VARIANTS = ["floor1", "floor2", "floor3", "floor4", "floor5", "floor6", "killhouse"] as const;
export type BunkerVariant = (typeof BZ_VARIANTS)[number];
/** `?floor=` values, same order (BZ-20). */
export const BZ_FLOOR_PARAMS = ["1", "2", "3", "4", "5", "6", "kh"] as const;
export type BunkerFloorParam = (typeof BZ_FLOOR_PARAMS)[number];

/** Identity palette (PRD WP-21 identity): concrete grey, olive steel, rust; hazard yellow-black the one saturated accent. */
export const BZ_PALETTE = {
  concrete: "#77756e",
  olive: "#4f5531",
  rust: "#7a3f22",
  hazard: "#e8b400",
  hazardBlack: "#16150f",
  /** The key and the elevator: the objective colour (brass key glint). */
  objective: "#ffb648"
} as const;

/** BZ-05: the one IBL, catalogue id of `public/hdri/<id>_1k.hdr` (E-A), never drawn as the background. */
export const BZ_HDRI = "hangar_interior" as const;
export const BZ_HDRI_URL = `/hdri/${BZ_HDRI}_1k.hdr` as const;
export const BZ_ENV_INTENSITY = 0.35;

/** BZ-08 post: AO 0.65/0.9, bloom threshold 0.82 / intensity 0.45, grade contrast 1.14 / saturation 0.82, vignette 0.34, grain 0.04, ACES. */
export const BZ_POST = {
  ao: { intensity: 0.65, radius: 0.9 },
  bloom: { threshold: 0.82, intensity: 0.45 },
  grade: { contrast: 1.14, saturation: 0.82 },
  vignette: 0.34,
  grain: 0.04,
  toneMapping: "aces"
} as const;

/** BZ-01: the carried lamp drops from 5.6 to 1.2 (it only keeps the player's hands readable between pools). */
export const BZ_PLAYER_LIGHT = { color: "#fff1d6", intensity: 1.2, distance: 32, decay: 1.15 } as const;

/**
 * Fixture points the rig keeps live per tier: the fixtures nearest the camera (weighted toward what it faces) get a
 * point each; the rest read as glowing bulbs in the dust (`lightRig.ts` rankFixtures). Four on Medium and up keeps the
 * art direction at six practicals (fill spot + player lamp + 4); Low tier has 4 lights per pixel (PRD §6.4), so 2.
 */
export const BZ_FIXTURE_LIGHTS = { low: 2, medium: 4, high: 4, ultra: 4 } as const;
/** Non-key lights live on any floor: the fill spot (or F5's tube, or F6's key spot turned beacon), the player lamp and the fixture pool. */
export const BZ_PRACTICALS = 2 + BZ_FIXTURE_LIGHTS.high;

export type FixtureKind = "caged-tungsten" | "mercury-vapour" | "forge-grate" | "brass-sconce" | "fluorescent-tube" | "alarm-beacon" | "flood";

export interface BunkerSpotRow {
  /** Grid cell the lamp hangs over and the cell it points at (cell centres, the floor's own grid). */
  readonly cell: readonly [number, number];
  readonly target: readonly [number, number];
  /** Metres below the ceiling. */
  readonly drop: number;
  readonly intensity: number;
  readonly distance: number;
  readonly angleDeg: number;
  readonly penumbra: number;
}

export interface BunkerLookRow {
  readonly variant: BunkerVariant;
  readonly floorParam: BunkerFloorParam;
  /** Floor slot in main.ts (0..5 descent floors, 6 the Kill House). */
  readonly slot: number;
  readonly fixture: FixtureKind;
  /** One lamp colour per floor (BZ-02); the HUD accent follows it (BZ-17). */
  readonly lamp: { readonly color: string; readonly temperatureK: number };
  /** The floor's one shadowed key (PCSS 1024) and its unshadowed fill spot (BZ-01). */
  readonly key: BunkerSpotRow;
  readonly fill: BunkerSpotRow;
  /** Fixture points (distance 8, BZ-01); `height` "grate" puts F3's lights at grate height, lit from below (BZ-02). */
  readonly fixtures: { readonly intensity: number; readonly distance: number; readonly height: "ceiling" | "grate"; readonly flicker: number };
  /** BZ-02: fog colour at 30% of the lamp value; density of the dust haze between the pools. */
  readonly fog: { readonly color: string; readonly density: number };
  readonly environmentIntensity: number;
  /** Linear output exposure and the grade's white balance per floor (E-C temperature / tint, [-1, 1]). */
  readonly exposure: number;
  readonly grade: { readonly temperature: number; readonly tint: number };
  /** BZ-20: the fixed reference viewpoint `?floor=` boots at (cell centre, yaw in degrees; yaw 90 looks down +x). */
  readonly reference: { readonly cell: readonly [number, number]; readonly yawDeg: number; readonly pitchDeg: number };
  /** Signature (BZ-03): the muzzle transient light of this floor's gunfire. */
  readonly muzzle: { readonly color: string; readonly intensity: number; readonly range: number; readonly duration: number };
}

/** sRGB hex scaled by `k` per channel (0..1), rounded. */
export function scaleColor(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, "0")}`;
}

/** BZ-02: the fog colour of a floor is its lamp colour at 30% value. */
export const FOG_LAMP_FRACTION = 0.3;
export const fogFromLamp = (lamp: string): string => scaleColor(lamp, FOG_LAMP_FRACTION);

/** HSV hue of an sRGB hex in degrees [0, 360). */
export function hueDeg(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Smallest angle between two hues, degrees. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const MUZZLE = { color: "#ffd59a", intensity: 14, range: 9, duration: 0.09 } as const;

function row(r: Omit<BunkerLookRow, "fog" | "muzzle"> & { readonly fogDensity: number; readonly muzzle?: BunkerLookRow["muzzle"] }): BunkerLookRow {
  const { fogDensity, muzzle, ...rest } = r;
  return { ...rest, fog: { color: fogFromLamp(r.lamp.color), density: fogDensity }, muzzle: muzzle ?? MUZZLE };
}

/** The table: one row per variant, BZ_VARIANTS order. */
export const BZ_LOOK: readonly BunkerLookRow[] = [
  row({
    variant: "floor1", floorParam: "1", slot: 0, fixture: "caged-tungsten",
    lamp: { color: "#ffad5c", temperatureK: 2700 },
    key: { cell: [3, 2], target: [4, 3], drop: 0.25, intensity: 70, distance: 14, angleDeg: 38, penumbra: 0.55 },
    fill: { cell: [18, 14], target: [19, 14], drop: 0.25, intensity: 34, distance: 11, angleDeg: 42, penumbra: 0.6 },
    fixtures: { intensity: 9, distance: 8, height: "ceiling", flicker: 0 },
    fogDensity: 0.04, environmentIntensity: 0.35, exposure: 1.0, grade: { temperature: 0.12, tint: 0 },
    reference: { cell: [1, 1], yawDeg: 90, pitchDeg: -2 }
  }),
  row({
    variant: "floor2", floorParam: "2", slot: 1, fixture: "mercury-vapour",
    lamp: { color: "#6fe3c0", temperatureK: 5200 },
    key: { cell: [12, 2], target: [13, 2], drop: 0.25, intensity: 64, distance: 14, angleDeg: 40, penumbra: 0.5 },
    fill: { cell: [18, 14], target: [19, 14], drop: 0.25, intensity: 30, distance: 11, angleDeg: 42, penumbra: 0.6 },
    fixtures: { intensity: 8, distance: 8, height: "ceiling", flicker: 0 },
    fogDensity: 0.05, environmentIntensity: 0.4, exposure: 1.0, grade: { temperature: -0.08, tint: -0.04 },
    reference: { cell: [8, 2], yawDeg: 90, pitchDeg: -6 }
  }),
  row({
    variant: "floor3", floorParam: "3", slot: 2, fixture: "forge-grate",
    lamp: { color: "#ff6a24", temperatureK: 1900 },
    key: { cell: [3, 2], target: [4, 2], drop: 0.25, intensity: 66, distance: 14, angleDeg: 40, penumbra: 0.5 },
    fill: { cell: [17, 14], target: [17, 13], drop: 0.25, intensity: 30, distance: 11, angleDeg: 42, penumbra: 0.6 },
    fixtures: { intensity: 10, distance: 8, height: "grate", flicker: 0.12 },
    fogDensity: 0.045, environmentIntensity: 0.3, exposure: 1.0, grade: { temperature: 0.18, tint: 0.02 },
    reference: { cell: [1, 1], yawDeg: 90, pitchDeg: -4 }
  }),
  row({
    variant: "floor4", floorParam: "4", slot: 3, fixture: "brass-sconce",
    lamp: { color: "#e9cf62", temperatureK: 3200 },
    key: { cell: [3, 1], target: [4, 2], drop: 0.25, intensity: 62, distance: 13, angleDeg: 38, penumbra: 0.55 },
    fill: { cell: [17, 14], target: [18, 14], drop: 0.25, intensity: 30, distance: 11, angleDeg: 42, penumbra: 0.6 },
    fixtures: { intensity: 8, distance: 8, height: "ceiling", flicker: 0 },
    fogDensity: 0.035, environmentIntensity: 0.32, exposure: 1.0, grade: { temperature: 0.1, tint: 0.03 },
    reference: { cell: [1, 1], yawDeg: 90, pitchDeg: -2 }
  }),
  row({
    variant: "floor5", floorParam: "5", slot: 4, fixture: "fluorescent-tube",
    lamp: { color: "#cfe8ff", temperatureK: 6500 },
    key: { cell: [3, 2], target: [4, 2], drop: 0.25, intensity: 58, distance: 13, angleDeg: 40, penumbra: 0.5 },
    fill: { cell: [17, 14], target: [17, 13], drop: 0.1, intensity: 26, distance: 10, angleDeg: 42, penumbra: 0.6 },
    fixtures: { intensity: 8, distance: 8, height: "ceiling", flicker: 0.35 },
    fogDensity: 0.04, environmentIntensity: 0.45, exposure: 1.0, grade: { temperature: -0.16, tint: 0 },
    reference: { cell: [1, 1], yawDeg: 90, pitchDeg: -2 }
  }),
  row({
    variant: "floor6", floorParam: "6", slot: 5, fixture: "alarm-beacon",
    lamp: { color: "#ff2a1f", temperatureK: 1800 },
    // F6's key is the moon through the hatch (lightRig.ts BZ_MOON); its spot becomes a sweeping alarm beacon.
    key: { cell: [4, 3], target: [4, 4], drop: 0.3, intensity: 40, distance: 12, angleDeg: 34, penumbra: 0.45 },
    fill: { cell: [20, 14], target: [20, 13], drop: 0.3, intensity: 26, distance: 11, angleDeg: 42, penumbra: 0.6 },
    fixtures: { intensity: 7, distance: 8, height: "ceiling", flicker: 0 },
    fogDensity: 0.05, environmentIntensity: 0.25, exposure: 1.0, grade: { temperature: 0.06, tint: 0.05 },
    reference: { cell: [12, 13], yawDeg: 0, pitchDeg: 8 }
  }),
  row({
    variant: "killhouse", floorParam: "kh", slot: 6, fixture: "flood",
    lamp: { color: "#f2f5ff", temperatureK: 5600 },
    key: { cell: [11, 7], target: [11, 8], drop: 0.2, intensity: 72, distance: 15, angleDeg: 46, penumbra: 0.45 },
    fill: { cell: [2, 5], target: [2, 6], drop: 0.2, intensity: 34, distance: 12, angleDeg: 44, penumbra: 0.5 },
    fixtures: { intensity: 9, distance: 8, height: "ceiling", flicker: 0 },
    fogDensity: 0.03, environmentIntensity: 0.4, exposure: 1.0, grade: { temperature: -0.04, tint: 0 },
    reference: { cell: [1, 1], yawDeg: 90, pitchDeg: -2 }
  })
];

/** Floor definition of a slot (0..5 FLOORS, 6 the Kill House). */
export const floorDefOfSlot = (slot: number): FloorDef => (slot === 6 ? KILL_HOUSE : FLOORS[slot]!);
/** Wall height of a slot (floor 6 is the tall silo). */
export const wallHeightOfSlot = (slot: number): number => (slot === 5 ? SILO_H : WALL_H);
/** The look row of a slot. */
export const lookOfSlot = (slot: number): BunkerLookRow => BZ_LOOK[Math.max(0, Math.min(BZ_LOOK.length - 1, slot))]!;

/** World position of a cell centre at height `y` (all floors share the origin). */
export const cellWorld = (cell: readonly [number, number], y: number): [number, number, number] => [(cell[0] + 0.5) * CELL, y, (cell[1] + 0.5) * CELL];

/** BZ-20: `?floor=1..6|kh` → the slot it boots (and the sim mode), or null when absent or unknown. */
export function parseFloorParam(search: string | URLSearchParams): { readonly slot: number; readonly mode: "descent" | "killhouse"; readonly floorIdx: number } | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const raw = params.get("floor");
  if (raw === null) return null;
  const value = raw.trim().toLowerCase();
  const slot = (BZ_FLOOR_PARAMS as readonly string[]).indexOf(value);
  if (slot < 0) return null;
  return slot === 6 ? { slot, mode: "killhouse", floorIdx: 0 } : { slot, mode: "descent", floorIdx: slot };
}

/** Grid cells that carry a ceiling fixture (the work-light rule the scene has always used: every ninth open cell). */
export function fixtureCells(def: FloorDef): readonly (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  def.rows.forEach((r, z) => {
    for (let x = 0; x < r.length; x++) {
      const ch = r[x]!;
      if (ch !== "#" && ch !== "%" && ch !== " " && ch !== "P" && (x * 7 + z * 13) % 9 === 0) out.push([x, z] as const);
    }
  });
  return out;
}
