import { describe, expect, it } from "vitest";
import { FURNITURE_HALF, buildFurniture, furnitureSolids } from "../../../examples/drift-and-deliver-port/city";
import { planProps } from "../../../examples/drift-and-deliver-port/props";
import { NO_KEYS, createCar, stepCar, teleport, type Solid } from "../../../examples/drift-and-deliver-port/sim";
import { buildBlocks, buildBuildings } from "../../../examples/drift-and-deliver-port/world";

/** Audit row C5 (checklist M6): the car no longer drives through lamps, signals, trees, hydrants, shelters and people. */
const FOOT = { halfW: 0.9954000015020373, halfD: 2.14200003592372 };
const blocks = buildBlocks();
const furniture = buildFurniture(blocks);

function driveInto(target: { x: number; z: number }, solids: readonly Solid[]) {
  const car = createCar();
  teleport(car, target.x, target.z - 25, 0);
  let minDz = Infinity;
  for (let i = 0; i < 360; i++) {
    stepCar(car, 1 / 60, { ...NO_KEYS, w: true }, solids, FOOT);
    minDz = Math.min(minDz, Math.abs(car.z - target.z));
    if (car.z > target.z + 4) break;
  }
  return { car, passed: car.z > target.z + 1, minDz };
}

describe("street furniture colliders (C5)", () => {
  const solids = furnitureSolids(furniture);

  it("emits a post for every lamp and signal and a prop for every tree and pedestrian", () => {
    const posts = solids.filter((s) => s.kind === "post").length;
    const props = solids.filter((s) => s.kind === "prop").length;
    expect(posts).toBe(furniture.lamps.length + furniture.signals.length);
    expect(props).toBe(furniture.streetTrees.length + furniture.parkTrees.length + furniture.pedestrians.length);
    expect(solids.find((s) => s.kind === "post")!.hw).toBe(FURNITURE_HALF.lamp);
  });

  it("a car at full throttle cannot pass through a lamp post (it did with no collider)", () => {
    const lamp = furniture.lamps.find((p) => Math.abs(p.z % 60) > 20 && Math.abs(p.x) < 300)!;
    const post: Solid = { x: lamp.x, z: lamp.z, hw: FURNITURE_HALF.lamp, hd: FURNITURE_HALF.lamp, kind: "post" };
    expect(driveInto(lamp, []).passed).toBe(true);
    const hit = driveInto(lamp, [post]);
    expect(hit.passed).toBe(false);
  });

  it("a pedestrian gives a soft shove, slowing the car", () => {
    const ped = furniture.pedestrians[3]!;
    const solid: Solid = { x: ped.x, z: ped.z, hw: FURNITURE_HALF.pedestrian, hd: FURNITURE_HALF.pedestrian, kind: "prop" };
    const free = driveInto(ped, []);
    const bumped = driveInto(ped, [solid]);
    expect(Math.abs(bumped.car.speed) + Math.abs(bumped.car.vx)).toBeGreaterThan(0);
    expect(bumped.car.x !== free.car.x || bumped.car.speed < free.car.speed).toBe(true);
  });

  it("people stand off both traffic lanes (lanes end 5.2 m from the centre line)", () => {
    for (const p of furniture.pedestrians) {
      const offX = Math.min(...[-450, -390, -330, -270, -210, -150, -90, -30, 30, 90, 150, 210, 270, 330, 390, 450].map((l) => Math.abs(p.x - l)));
      const offZ = Math.min(...[-450, -390, -330, -270, -210, -150, -90, -30, 30, 90, 150, 210, 270, 330, 390, 450].map((l) => Math.abs(p.z - l)));
      expect(Math.min(offX, offZ)).toBeGreaterThan(5.2);
    }
  });

  it("hydrants and bus shelters come with prop solids from the prop plan", () => {
    const plan = planProps(furniture, blocks, buildBuildings(blocks), { x: 30.1, z: -120 });
    const hydrants = plan.placements.get("hydrant")?.length ?? 0;
    const shelters = plan.placements.get("shelter")?.length ?? 0;
    expect(hydrants + shelters).toBeGreaterThan(0);
    expect(plan.solids.length).toBe(hydrants + shelters);
    for (const s of plan.solids) expect(s.kind).toBe("prop");
  });

  it("the spawn street stays drivable: 8 s of full throttle from the start, no contact with any collider", () => {
    const all = [...solids, ...buildBuildings(blocks).map((b) => ({ x: b.x, z: b.z, hw: b.hw, hd: b.hd, kind: "hard" as const }))];
    const near = (x: number, z: number) => all.filter((s) => Math.abs(s.x - x) < 30 && Math.abs(s.z - z) < 30);
    const car = createCar();
    for (let i = 0; i < 480; i++) {
      const vz = car.vz;
      stepCar(car, 1 / 60, { ...NO_KEYS, w: true }, near(car.x, car.z), FOOT);
      expect(car.vz).toBeGreaterThanOrEqual(vz - 1e-9);
    }
    expect(car.z - -120).toBeGreaterThan(150);
    expect(Math.abs(car.x - 30.1)).toBeLessThan(1e-6);
  });
});
