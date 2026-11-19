import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SET_PIECE_ISLETS } from "../../../examples/strange-orbit-port/art/idolModels";
import { rimHeight } from "../../../examples/strange-orbit-port/art/craterRim";
import { groundHeight } from "../../../examples/strange-orbit-port/course";
import { buildIslet } from "../../../examples/strange-orbit-port/meshes";
import { dressingPlan } from "../../../examples/strange-orbit-port/obstacles";
import { mainFrame } from "../../../examples/strange-orbit-port/track";
import { COLONY_STATIONS } from "../../../examples/strange-orbit-port/world";

// Read at runtime: a static import of the 7 MB root manifest makes tsc type the whole JSON literal.
const aurAssets = JSON.parse(readFileSync(new URL("../../../aura.assets.json", import.meta.url), "utf8")) as { assets: { id: string; bounds?: number[] }[] };

/** Ribbon half width on the main route (meshes.ts buildCourse) and its edge skirt. */
const RIBBON_HALF = 11.5;
const bounds = (id: string): number[] => aurAssets.assets.find((a) => a.id === id)!.bounds!;
/** Footprint [x, z] extents (m); manifest bounds are [x, y, z]. */
const TRUE_SIZE: Record<string, readonly [number, number]> = { cgGantry: [33.8, 5.83] }; // manifest bounds of the -135 deg gantry are inflated
const footprint = (key: string): readonly [number, number] => {
  const b = bounds(key);
  return TRUE_SIZE[key] ?? [b[0]!, b[2]!];
};

interface Placement { readonly key: keyof typeof SET_PIECE_ISLETS; readonly name: string; readonly s: number; readonly lateral: number; readonly drop: number; readonly scale: number }
const KEY = { habitat: "cgHabitat", dish: "cgDish", solar: "cgSolarArray", trailer: "cgTrailer", fuel: "cgFuelTank" } as const;
const placements: Placement[] = [
  ...dressingPlan().filter((d) => d.kind === "lander" || d.kind === "observatory").map((d) => ({ key: (d.kind === "lander" ? "cgLander" : "cgObservatory") as Placement["key"], name: d.name, s: d.s, lateral: d.lateral, drop: d.drop, scale: d.size })),
  ...COLONY_STATIONS.map((c) => ({ key: KEY[c.kind], name: c.name, s: c.s, lateral: c.lateral, drop: c.drop, scale: c.scale })),
  { key: "cgGantry", name: "start-finish-gantry", s: 72, lateral: 0, drop: -0.1, scale: 1 }
];

describe("Craterline GP Idol set pieces stand on something (grounding sweep)", () => {
  it("every placement sits at the course's own ground height (no float above it, no deep sink), measured at footprint corners + centre", () => {
    for (const p of placements) {
      const [bx, bz] = footprint(p.key);
      const half = (Math.max(bx, bz) / 2) * p.scale;
      for (const [dl, ds] of [[0, 0], [-half, -half], [half, -half], [-half, half], [half, half]]) {
        // the game's height function along the course frame: 0 on the main route (the ribbon plane)
        const g = groundHeight(p.s + ds!, p.lateral + dl!, "main");
        expect(g).toBe(0);
        // base plane sits at `drop` along the frame's up: at most 0.75 m below the ground plane, never above it
        expect(p.drop).toBeLessThanOrEqual(0);
        expect(p.drop).toBeGreaterThanOrEqual(-0.75);
      }
    }
  });

  it("puts a floating islet under every footprint that leaves the ribbon (the crater basin is 55-90 m below)", () => {
    for (const p of placements) {
      const f = mainFrame(p.s);
      const at = f.p.clone().addScaledVector(f.side, p.lateral).addScaledVector(f.up, p.drop);
      // nothing else under it: the basin floor is far below the prop
      expect(at.y - rimHeight(at.x, at.z)).toBeGreaterThan(50);
      const islets = SET_PIECE_ISLETS[p.key];
      expect(islets.length).toBeGreaterThan(0);
      const [bx, bz] = footprint(p.key);
      for (const islet of islets) {
        const m = buildIslet(islet.x, islet.z, islet.r, islet.r * 1.6, p.s);
        // top cap 3 cm under the prop's base (local y 0), bottom well below
        expect(m.positions[1]).toBeCloseTo(-0.03, 6);
        const ys = m.positions.filter((_, i) => i % 3 === 1);
        expect(Math.min(...ys)).toBeLessThan(-islet.r);
        if (p.key !== "cgGantry") {
          // the islet covers the whole footprint (radius >= half the model's larger side)
          expect(islet.r).toBeGreaterThanOrEqual(Math.max(bx, bz) / 2);
          // and the part of the footprint beyond the ribbon edge is what needed it
          expect(Math.abs(p.lateral) + (Math.max(bx, bz) / 2) * p.scale).toBeGreaterThan(RIBBON_HALF);
        } else {
          // gantry towers stand beyond the ribbon edge, each on its own islet that stays clear of the ribbon
          expect(Math.abs(islet.z) - islet.r).toBeGreaterThan(RIBBON_HALF);
          expect(Math.abs(islet.z) + islet.r).toBeGreaterThanOrEqual(bx / 2 - 0.5);
        }
      }
    }
  });
});
