/**
 * Pass-through pass (owner addendum 2026-11-18): the solid things a player can walk into, and the box the sim stops him at.
 *
 * - Sim props (`b` barrel, `c` crate, `o` column) used to block their whole 3 m grid cell for movement while the Idol drum
 *   is 0.87 m wide and the crate 1.6 m: an invisible wall 1.4 m short of the visual. Movement and rockets now stop at
 *   the prop's own footprint (`PROP_FOOTPRINT`, the Idol GLB bounds from `art/idol-assets.ts`); BFS paths and sight
 *   still treat the cell as blocked.
 * - The per-floor command console and cryo canister (`dressingPlacements`) stood on walkable floor next to a wall with no
 *   collider, so the player walked through them. They are now static obstacles in the sim with the model's footprint.
 *   The patrol drone hangs under the ceiling above head height and stays presentation only.
 *
 * Pure data + grid logic (no engine imports): `sim.ts`, `main.ts` and the unit tests share it.
 */
import { CELL, KILL_HOUSE, WALL_H, isSolid, type FloorDef } from "./maps";
import { lookOfSlot, underHatch } from "./art/look";

/** Footprint half-extents on x / z and height, metres (axis-aligned at yaw 0). */
export interface Footprint { readonly hx: number; readonly hz: number; readonly h: number }

/** Square pilaster column side (the procedural `buildPilasterColumnInstances` box). */
export const BZ_COLUMN_SIDE = 1.2;

/**
 * Collision footprint of each sim prop, centred on its cell. Barrel = bzDrum bounds 0.871 x 1.27 x 0.861, crate = bzCrate
 * bounds 1.603 x 1.17 x 1.16 (both placed unrotated at the cell centre), column = the 1.2 m pilaster, full wall height.
 */
export const PROP_FOOTPRINT: Readonly<Record<"barrel" | "crate" | "column", Footprint>> = {
  barrel: { hx: 0.44, hz: 0.44, h: 1.27 },
  crate: { hx: 0.8, hz: 0.58, h: 1.17 },
  column: { hx: BZ_COLUMN_SIDE / 2, hz: BZ_COLUMN_SIDE / 2, h: WALL_H }
};

/** Idol model size [x, y, z] (bzConsole / bzCryo bounds) and the gap from the wall face to the model's origin. */
export const DRESSING_MODEL = {
  console: { size: [1.32, 0.74, 1.123] as const, wallGap: 0.34 },
  cryo: { size: [0.716, 1.38, 0.836] as const, wallGap: 0.36 }
} as const;

/** Height rockets fly at (main.ts draws them at `r.y ?? 1.18`): dressing lower than this is overflown. */
export const ROCKET_Y = 1.18;

/** The first wall neighbour of a floor cell (S, N, E, W order), as a unit grid step. */
export function wallFace(rows: readonly string[], x: number, z: number): [number, number] {
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) if (isSolid(rows[z + dz]?.[x + dx] ?? "#")) return [dx, dz];
  return [0, 1];
}

export interface DressingPlacement {
  readonly kind: "console" | "cryo" | "drone";
  readonly cx: number;
  readonly cz: number;
  /** Floor-local model origin (main.ts adds the slot's FLOOR_SPAN on x). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** Axis-aligned world footprint (console / cryo); the ceiling drone has none. */
  readonly footprint?: Footprint;
}

/** Floor slot of a definition: FLOORS ids 0..5 are their slots, the Kill House is slot 6. */
export const slotOfFloor = (def: FloorDef) => (def.id === KILL_HOUSE.id ? 6 : def.id);

/**
 * Where the console, cryo canister and patrol drone stand on a floor (the scan main.ts has always used). Console and cryo
 * back onto a solid wall (never a push-wall: it slides away and would leave them standing in front of nothing).
 */
export function dressingPlacements(def: FloorDef, wallH: number): DressingPlacement[] {
  const rows = def.rows;
  const h = rows.length, w = rows[0]!.length;
  const refCell = lookOfSlot(slotOfFloor(def)).reference.cell;
  const fixed = (ch: string) => ch === "#" || ch === "%" || ch === " ";
  const touchesFixedWall = (cx: number, cz: number) =>
    fixed(rows[cz + 1]?.[cx] ?? "#") || fixed(rows[cz - 1]?.[cx] ?? "#") || fixed(rows[cz]?.[cx + 1] ?? "#") || fixed(rows[cz]?.[cx - 1] ?? "#");
  const fixedFace = (cx: number, cz: number): [number, number] => {
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) if (fixed(rows[cz + dz]?.[cx + dx] ?? "#")) return [dx, dz];
    return [0, 1];
  };
  const out: DressingPlacement[] = [];
  let placedConsole = false, placedCryo = false, placedDrone = false;
  for (let z = 1; z < h - 1; z++) {
    for (let x = 1; x < w - 1; x++) {
      if (placedConsole && placedCryo && placedDrone) break;
      const ch = rows[z]![x]!;
      if (Math.abs(x - refCell[0]) <= 1 && Math.abs(z - refCell[1]) <= 1) continue;
      if (underHatch(def, x, z)) continue;
      const wx = (x + 0.5) * CELL, wz = (z + 0.5) * CELL;
      if (!placedDrone && (ch === "g" || ch === "d" || ch === ".")) {
        out.push({ kind: "drone", cx: x, cz: z, x: wx, y: wallH - 0.54, z: wz, yaw: 0 });
        placedDrone = true;
        continue;
      }
      if (ch === "." && touchesFixedWall(x, z) && (!placedConsole || !placedCryo)) {
        const kind = !placedConsole ? "console" : "cryo";
        const wf = fixedFace(x, z);
        const { size, wallGap } = DRESSING_MODEL[kind];
        const off = CELL / 2 - wallGap;
        // yaw is a multiple of 90 deg: the model's x span lies along the wall, its z span across it
        const alongX = wf[1] !== 0;
        const footprint = { hx: (alongX ? size[0] : size[2]) / 2, hz: (alongX ? size[2] : size[0]) / 2, h: size[1] };
        out.push({ kind, cx: x, cz: z, x: wx + wf[0] * off, y: 0, z: wz + wf[1] * off, yaw: Math.atan2(-wf[0], -wf[1]), footprint });
        if (kind === "console") placedConsole = true; else placedCryo = true;
      }
    }
  }
  return out;
}

/** The sim's static obstacles of a floor (console + cryo footprints, floor-local centre). */
export function staticObstacles(def: FloorDef, wallH: number): { readonly x: number; readonly z: number; readonly f: Footprint }[] {
  return dressingPlacements(def, wallH).flatMap((d) => (d.footprint ? [{ x: d.x, z: d.z, f: d.footprint }] : []));
}
