import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CELL, FLOORS, KILL_HOUSE, SILO_H, WALL_H, isSolid, type FloorDef } from "../../../apps/showcase-bunker-zero/src/maps";
import { cellCenter, createSim, defaultLoadout, type Sim } from "../../../apps/showcase-bunker-zero/src/sim";
import { BZ_COLUMN_SIDE, DRESSING_MODEL, PROP_FOOTPRINT, ROCKET_Y, dressingPlacements } from "../../../apps/showcase-bunker-zero/src/obstacles";
import { idolAssets } from "../../../apps/showcase-bunker-zero/src/art/idol-assets";

// Pass-through pass (owner addendum 2026-11-18): the player stops at what he sees, and what he sees stops him.
const PLAYER_R = 0.34;
const STEP = 5.2 / 60; // one tick of full-speed movement
const NO = { moveX: 0, moveZ: 0, turn: 0, pitchDelta: 0, fire: false, firePressed: false, reload: false, use: false };
const ALL: FloorDef[] = [...FLOORS, KILL_HOUSE];
const wallHOf = (def: FloorDef) => (def.id === 5 ? SILO_H : WALL_H);
const MAIN = readFileSync(path.resolve("apps/showcase-bunker-zero/src/main.ts"), "utf8");

function calmSim(def: FloorDef): Sim {
  const sim = createSim(def, { ox: 0, mode: def.id === KILL_HOUSE.id ? "killhouse" : "descent", seed: 7, loadout: defaultLoadout() });
  for (const e of sim.state.enemies) { e.state = "dead"; e.hp = 0; }
  sim.state.player.hp = 1e6;
  return sim;
}
/** Walk the player from (x, z) along world direction (dx, dz) for `seconds`; returns where he stopped. */
function walk(sim: Sim, x: number, z: number, dx: number, dz: number, seconds = 2) {
  const p = sim.state.player;
  p.x = x; p.z = z;
  p.yaw = Math.atan2(dx, -dz); // forward = (sin yaw, -cos yaw)
  for (let i = 0; i < seconds * 60; i++) sim.tick(1 / 60, { ...NO, moveZ: 1 });
  return { x: p.x, z: p.z };
}
const bounds = (key: string) => (idolAssets as unknown as Record<string, { bounds: readonly number[] }>)[key]!.bounds;

describe("bunker zero pass-through: visuals vs colliders", () => {
  it("prop footprints match the Idol drum / crate bounds and the pilaster column", () => {
    const drum = bounds("bzDrum"), crate = bounds("bzCrate");
    expect(PROP_FOOTPRINT.barrel.hx * 2).toBeCloseTo(drum[0]!, 1);
    expect(PROP_FOOTPRINT.barrel.hz * 2).toBeCloseTo(drum[2]!, 1);
    expect(PROP_FOOTPRINT.barrel.h).toBeCloseTo(drum[1]!, 1);
    expect(PROP_FOOTPRINT.crate.hx * 2).toBeCloseTo(crate[0]!, 1);
    expect(PROP_FOOTPRINT.crate.hz * 2).toBeCloseTo(crate[2]!, 1);
    expect(PROP_FOOTPRINT.crate.h).toBeCloseTo(crate[1]!, 1);
    expect(PROP_FOOTPRINT.column.hx * 2).toBe(BZ_COLUMN_SIDE);
    // main.ts draws the column from the same constant, drums / crates unrotated at the cell centre
    expect(MAIN).toContain("const BZ_COLUMN = { side: BZ_COLUMN_SIDE }");
    expect(MAIN).toMatch(/barrelInst\.push\(\{ position: \[wx, 0, wz\], scale: \[1, 1, 1\] \}\)/);
    expect(MAIN).toMatch(/crateInst\.push\(\{ position: \[wx, 0, wz\], scale: \[1, 1, 1\] \}\)/);
  });

  it("console and cryo collider sizes are the Idol model bounds; main.ts places the models from the same placements", () => {
    for (const kind of ["console", "cryo"] as const) {
      const b = bounds(kind === "console" ? "bzConsole" : "bzCryo");
      DRESSING_MODEL[kind].size.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 2));
    }
    expect(MAIN).toMatch(/for \(const d of dressingPlacements\(def, wallH\)\)/);
    for (const def of ALL) {
      const placed = dressingPlacements(def, wallHOf(def));
      for (const d of placed.filter((pp) => pp.kind !== "drone")) {
        const size = DRESSING_MODEL[d.kind as "console" | "cryo"].size;
        const f = d.footprint!;
        // the footprint is the model's x/z span turned by its (90 deg multiple) yaw
        expect([f.hx * 2, f.hz * 2].sort()).toEqual([size[0], size[2]].sort());
        // it stays inside its own floor cell, only reaching back into the wall behind it: never into a neighbouring walkable cell
        const x0 = d.cx * CELL, z0 = d.cz * CELL;
        const sides: [number, number, number, number][] = [
          [d.x - f.hx, x0, -1, 0], [d.x + f.hx, x0 + CELL, 1, 0], [d.z - f.hz, z0, 0, -1], [d.z + f.hz, z0 + CELL, 0, 1]
        ];
        for (const [edge, limit, sx, sz] of sides) {
          const beyond = sx + sz < 0 ? edge < limit - 1e-6 : edge > limit + 1e-6;
          if (beyond) expect(isSolid(def.rows[d.cz + sz]![d.cx + sx]!)).toBe(true);
        }
      }
    }
  });

  it("the patrol drone is the only collider-free dressing and hangs above the player's head", () => {
    const drone = bounds("bzDrone");
    for (const def of ALL) {
      for (const d of dressingPlacements(def, wallHOf(def))) {
        if (d.kind !== "drone") { expect(d.footprint).toBeDefined(); continue; }
        expect(d.footprint).toBeUndefined();
        // the Idol body hangs 0.17 m below its node; its underside clears a 1.9 m player with room
        expect(d.y - 0.17).toBeGreaterThan(1.9);
        expect(d.y - 0.17 + drone[1]!).toBeLessThan(wallHOf(def));
      }
    }
  });

  it("walking into the console or the cryo canister stops at its footprint (wall-on and along the wall)", () => {
    for (const def of ALL) {
      for (const d of dressingPlacements(def, wallHOf(def)).filter((pp) => pp.footprint)) {
        const f = d.footprint!;
        // the wall the model backs onto
        const wx = Math.sign(Math.round(d.x - cellCenter(d.cx))), wz = Math.sign(Math.round(d.z - cellCenter(d.cz)));
        // head-on: from the cell centre toward the wall
        const sim = calmSim(def);
        const stop = walk(sim, cellCenter(d.cx), cellCenter(d.cz), wx, wz);
        const gap = wx !== 0 ? Math.abs(stop.x - d.x) - f.hx : Math.abs(stop.z - d.z) - f.hz;
        expect(gap, `${def.name} ${d.kind} head-on`).toBeGreaterThanOrEqual(PLAYER_R - 1e-6);
        expect(gap, `${def.name} ${d.kind} head-on`).toBeLessThan(PLAYER_R + STEP + 1e-6);
        // hugging the wall: from the open neighbour cell along the wall into the model's side
        const across = wx + wz; // +1 when the wall is on the +x / +z side
        const hugAcross = (wx !== 0 ? cellCenter(d.cx) : cellCenter(d.cz)) + across * (CELL / 2 - PLAYER_R - 0.05);
        for (const s of [-1, 1]) {
          const ax = wz !== 0 ? s : 0, az = wx !== 0 ? s : 0; // along-wall walking direction
          const ncx = d.cx - ax, ncz = d.cz - az;
          const nch = def.rows[ncz]![ncx]!;
          if (isSolid(nch) || "obcD".includes(nch)) continue;
          if (dressingPlacements(def, wallHOf(def)).some((o) => o.footprint && o.cx === ncx && o.cz === ncz)) continue; // the other model
          const sim2 = calmSim(def);
          const hug = walk(sim2, wx !== 0 ? hugAcross : cellCenter(ncx), wz !== 0 ? hugAcross : cellCenter(ncz), ax, az);
          const sideGap = ax !== 0 ? Math.abs(hug.x - d.x) - f.hx : Math.abs(hug.z - d.z) - f.hz;
          expect(sideGap, `${def.name} ${d.kind} along the wall`).toBeGreaterThanOrEqual(PLAYER_R - 1e-6);
          expect(sideGap, `${def.name} ${d.kind} along the wall`).toBeLessThan(PLAYER_R + STEP + 1e-6);
        }
      }
    }
  });

  it("walking into a barrel, crate or column stops at its footprint, not at an invisible cell wall", () => {
    let checked = 0;
    for (const def of ALL) {
      const probe = calmSim(def);
      for (const pr of probe.state.props) {
        const f = PROP_FOOTPRINT[pr.kind];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          // approach from an open neighbour cell straight at the prop centre
          const ncx = pr.cx - dx, ncz = pr.cz - dz;
          const nch = def.rows[ncz]?.[ncx] ?? "#";
          if (isSolid(nch) || "obcD".includes(nch)) continue;
          const sim = calmSim(def);
          const stop = walk(sim, cellCenter(ncx), cellCenter(ncz), dx, dz);
          const gap = dx !== 0 ? Math.abs(stop.x - cellCenter(pr.cx)) - f.hx : Math.abs(stop.z - cellCenter(pr.cz)) - f.hz;
          expect(gap, `${def.name} ${pr.kind} (${pr.cx},${pr.cz}) from ${dx},${dz}`).toBeGreaterThanOrEqual(PLAYER_R - 1e-6);
          expect(gap, `${def.name} ${pr.kind} (${pr.cx},${pr.cz}) from ${dx},${dz}`).toBeLessThan(PLAYER_R + STEP + 1e-6);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("rockets explode on the cryo canister (taller than their flight) and overfly the waist-high console", () => {
    expect(ROCKET_Y).toBeLessThan(DRESSING_MODEL.cryo.size[1]);
    expect(ROCKET_Y).toBeGreaterThan(DRESSING_MODEL.console.size[1]);
    const def = FLOORS[0]!;
    const cryo = dressingPlacements(def, WALL_H).find((d) => d.kind === "cryo")!;
    const sim = calmSim(def);
    sim.state.player.x = cellCenter(cryo.cx - 3); sim.state.player.z = cellCenter(cryo.cz + 2);
    // fire along the wall line from two cells west of the canister, straight at it
    sim.fireRocket(cellCenter(cryo.cx - 2), cryo.z, 1, 0, false);
    let boom: { x: number; z: number } | undefined;
    for (let i = 0; i < 120 && !boom; i++) { sim.tick(1 / 60, NO); boom = sim.state.explosions[0]; }
    expect(boom).toBeDefined();
    expect(boom!.x).toBeLessThanOrEqual(cryo.x - cryo.footprint!.hx + 0.5);
    expect(boom!.x).toBeGreaterThan(cryo.x - cryo.footprint!.hx - 0.5);
  });
});
