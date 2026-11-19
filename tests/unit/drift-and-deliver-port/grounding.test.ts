import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCity, buildFurniture } from "../../../examples/drift-and-deliver-port/city";
import { planProps, propNodes } from "../../../examples/drift-and-deliver-port/props";
import { buildBlocks, buildBuildings } from "../../../examples/drift-and-deliver-port/world";
import { createCar } from "../../../examples/drift-and-deliver-port/sim";
import { PED_SINK, idolPedestrianNodes } from "../../../examples/drift-and-deliver-port/idol";
import { WALKER_SINK, placeWalkers } from "../../../examples/drift-and-deliver-port/walkers";
import { IDOL_WHEEL_LAYOUT, TYRE_SINK, bodyLift, wheelHubs } from "../../../examples/drift-and-deliver-port/wheels";

/**
 * Nothing floats: every Idol base sits 2-25 cm below the surface sampled under its footprint. The harbour city is flat
 * (road / sidewalk plane at y = 0, park and plaza decals 4 cm above it); rooftop tanks stand on the building's roof cap.
 */
const root = resolve(__dirname, "../../..");
const idolDir = resolve(root, "examples/drift-and-deliver-port/assets/idol");
/** Lowest vertex of each normalised Idol GLB (the base), from its provenance record. */
const baseOf = (key: string): number => (JSON.parse(readFileSync(resolve(idolDir, `${key}.idol.json`), "utf8")) as { normalized: { minY: number } }).normalized.minY;
/** Ground height sampled under a ground-level footprint: the road plane, or a park / plaza decal on top of it. */
const GROUND_Y = 0;
const DECAL_Y = 0.04;

const blocks = buildBlocks();
const buildings = buildBuildings(blocks);
const furniture = buildFurniture(blocks);
const city = buildCity(blocks, buildings);
const car = createCar();
const plan = planProps(furniture, blocks, buildings, { x: car.x, z: car.z }, city.roofs);

type Inst = { position?: number[]; scale?: number | number[] };
type NodeJson = { name?: string; position?: number[]; scale?: number; instances?: Inst[]; children?: NodeJson[] };

function expectSunk(label: string, baseY: number, surface: number): void {
  expect(baseY, label).toBeLessThanOrEqual(surface - 0.02 + 1e-9);
  expect(baseY, label).toBeGreaterThanOrEqual(surface - 0.25);
}

describe("Gridlock Courier Idol grounding (no floating or buried bases)", () => {
  const nodes = propNodes(plan, false, true).map((n) => n.toJSON() as NodeJson);
  const byName = new Map(nodes.map((n) => [n.name, n]));

  it("sinks the street props into the road / park plane", () => {
    for (const [kind, key] of [["tree", "gcTree"], ["palm", "gcPalm"], ["hydrant", "gcHydrant"], ["scooter", "gcScooter"]] as const) {
      const node = byName.get(`model-${kind}-idol`);
      if (!node) continue; // a kind may have no placements in this layout
      expect(node.instances!.length, kind).toBeGreaterThan(0);
      for (const t of node.instances!) {
        const s = typeof t.scale === "number" ? t.scale : 1;
        // under the footprint: the road plane, or the 4 cm park decal for park trees (a lower bound either way)
        expectSunk(kind, t.position![1]! + baseOf(key) * s, GROUND_Y);
        expect(t.position![1]! + baseOf(key) * s, kind).toBeLessThan(DECAL_Y);
      }
    }
  });

  it("sinks both landmarks into the plaza / quay", () => {
    for (const [kind, key] of [["clocktower", "gcClocktower"], ["lighthouse", "gcLighthouse"]] as const) {
      const node = byName.get(`landmark-${kind}`)!;
      expectSunk(kind, node.position![1]! + baseOf(key) * (node.scale ?? 1), GROUND_Y);
    }
  });

  it("stands every rooftop water tank on a flat roof cap of the building it is on", () => {
    const tanks = plan.placements.get("watertank") ?? [];
    expect(tanks.length).toBeGreaterThan(0);
    for (const t of tanks) {
      const [x, , z] = t.position;
      const i = buildings.findIndex((b) => {
        const r = city.roofs[buildings.indexOf(b)]!;
        return Math.abs(x - b.x) <= r.hw && Math.abs(z - b.z) <= r.hd;
      });
      expect(i, `tank at ${x},${z}`).toBeGreaterThanOrEqual(0);
      const roof = city.roofs[i]!;
      expect(roof.flat).toBe(true);
      // the 3.4 m tank's legs span ~2 m: the whole footprint is on the top tier
      expect(Math.abs(x - buildings[i]!.x) + 1, "tank footprint on the roof").toBeLessThanOrEqual(roof.hw);
      expectSunk("watertank", t.position[1] + baseOf("gcWatertank"), roof.y);
    }
  });

  it("puts the people's soles just under the sidewalk plane", () => {
    const peds = idolPedestrianNodes(furniture.pedestrians).map((n) => n.toJSON() as NodeJson);
    for (const n of peds) for (const t of n.instances!) expect(t.position![1]).toBeCloseTo(-PED_SINK, 9);
    expect(PED_SINK).toBeGreaterThan(0);
    expect(PED_SINK).toBeLessThan(0.06);
    const ys: number[] = [];
    placeWalkers(() => ({ setPosition: (_x: number, y: number) => ys.push(y), setRotation: () => 0, setVisible: () => 0 }), car.x, car.z, 3, []);
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) expect(y).toBeCloseTo(-WALKER_SINK, 9);
  });

  it("presses every tyre into the road and keeps every vehicle body above it", () => {
    for (const [key, layout] of Object.entries(IDOL_WHEEL_LAYOUT)) {
      for (const h of wheelHubs(layout)) expect(h.y - layout.radius, key).toBeCloseTo(-TYRE_SINK, 9);
      expect(baseOf(key), key).toBeCloseTo(0, 3);
      expect(bodyLift(layout), key).toBeGreaterThan(0);
    }
  });
});
