import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pushOut, resolve, sweep, type Collider } from "../../../examples/silt-and-signal-port/collide";
import { CHAPTER0_COLLIDERS } from "../../../examples/silt-and-signal-port/colliders-ch0";
import { CHAPTER0_WORLD_COLLIDERS, bridgeArch, canalCentre, floor0, ground0 } from "../../../examples/silt-and-signal-port/world-ch0";
import { IDLE, STEP, createSim, stepSim } from "../../../examples/silt-and-signal-port/sim";

interface TargetPoint { x: number; z: number; y: number; floor: number }
const report = JSON.parse(readFileSync("evidence/crayon-capture/silt-and-signal-reference.json", "utf8")) as { rides: { world: { targets: { id: string; points: TargetPoint[] }[] } }[] };

describe("chapter-0 floor (original `_`)", () => {
  it("reproduces the floor the original reported at every objective point", () => {
    let checked = 0;
    for (const target of report.rides[0]!.world.targets) {
      for (const p of target.points) {
        expect(floor0(p.x, p.z, p.y), `${target.id} at ${p.x},${p.z}`).toBeCloseTo(p.floor, 9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(14);
  });

  it("shapes the canal trench, the plain and the bridge arch", () => {
    expect(ground0(canalCentre(0), 0)).toBeCloseTo(-3, 9);
    expect(ground0(canalCentre(-200) + 24.9, -200)).toBeGreaterThan(0.4);
    expect(ground0(0, 130)).toBeCloseTo(0.15 + Math.sin(130 * 0.035) * 0.07, 9);
    expect(bridgeArch(84.5, -180)).toBeCloseTo(4.2, 9);
    expect(bridgeArch(10, -180)).toBeNull();
    expect(floor0(canalCentre(-50), -50, 4)).toBe(0);
  });

  it("lets the rider land on a terrace only when it is within 2.5 m above the deck", () => {
    expect(floor0(247, 45, 30)).toBe(21);
    expect(floor0(247, 45, 5)).toBeLessThan(21);
  });
});

describe("collision resolution (original `uS`, `ss`, `Bx`)", () => {
  const round: Collider = { x: 0, z: 0, r: 2, bottom: 0, top: 10 };
  const box: Collider = { x: 0, z: 0, r: 1, bottom: 0, top: 10, halfX: 3, halfZ: 5 };

  it("pushes out of a round collider along the contact normal and ignores other heights", () => {
    const push = pushOut({ x: 1, y: 5, z: 0 }, round, 1.85, 1)!;
    expect(push.x).toBeCloseTo(2 + 1.85 - 1 + 0.002, 9);
    expect(push.z).toBeCloseTo(0, 9);
    expect(pushOut({ x: 1, y: 12.5, z: 0 }, round, 1.85, 1)).toBeNull();
    expect(pushOut({ x: 9, y: 5, z: 0 }, round, 1.85, 1)).toBeNull();
  });

  it("pushes out of a box by its nearest face, also from inside", () => {
    const outside = pushOut({ x: 4, y: 5, z: 0 }, box, 1.85, 1)!;
    expect(outside.x).toBeCloseTo(1.85 - 1 + 0.002, 9);
    const inside = pushOut({ x: 2.5, y: 5, z: 0 }, box, 1.85, 1)!;
    expect(inside.x).toBeCloseTo(0.5 + 1.85 + 0.002, 9);
    expect(inside.z).toBe(0);
  });

  it("sweeps a fast move in sub-steps of at most 0.8 m so it cannot tunnel through a thin collider", () => {
    const wall: Collider = { x: 0, z: 0, r: 1, bottom: 0, top: 10, halfX: 20, halfZ: 0.2 };
    const pos = { x: 0, y: 5, z: -10 };
    pos.z = 10;
    const hits = sweep(pos, { x: 0, z: -10 }, [wall], { radius: 1.85, halfHeight: 1 });
    expect(hits).toBeGreaterThan(0);
    expect(pos.z).toBeLessThan(0);
    expect(resolve({ x: 0, y: 5, z: 20 }, [wall])).toBe(0);
  });

  it("stops a flying rider at a village building and registers one impact per cooldown", () => {
    const house = CHAPTER0_WORLD_COLLIDERS.find((c, i) => (CHAPTER0_COLLIDERS[i]![7] & 1) === 1 && c.r >= 4)!;
    const sim = createSim(0, 0, { floor: () => 0.6 }, { x: house.x, y: 6, z: house.z + 60, yaw: 0 });
    for (let i = 0; i < 600; i++) stepSim(sim, { ...IDLE, throttle: 1, lift: 0 }, STEP);
    expect(sim.flight.impacts).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(sim.state.x - house.x, sim.state.z - house.z)).toBeGreaterThan(house.r);
  });

  it("chapter 0 keeps the 1400 measured colliders; chapters 1-6 collide with their scattered props (audit C6)", () => {
    expect(createSim(0, 0).world.colliders?.length).toBe(1400);
    for (let c = 1; c <= 6; c++) expect(createSim(c, 0).world.colliders?.length ?? 0).toBeGreaterThan(600);
  });
});
