import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STREET_LINES,
  buildBlocks,
  buildBuildings,
  buildPickups,
  buildTraffic,
  buildingSolids,
  collectPickups,
  districtOf,
  isPark,
  noise,
  stepTraffic,
  tickCombo,
  trafficContact
} from "../../../examples/drift-and-deliver-port/world";
import type { ReferenceReport } from "../../../tools/crayon-capture/drift-and-deliver-lib";

const reference = JSON.parse(readFileSync("evidence/crayon-capture/drift-and-deliver-reference.json", "utf8")) as ReferenceReport;
const census = reference.world.diag as Record<string, number>;

describe("city census equals the original's (evidence world.diag)", () => {
  const blocks = buildBlocks();
  it("225 blocks, 30 parks", () => {
    expect(blocks.length).toBe(census.blocks);
    expect(blocks.filter((b) => b.park).length).toBe(census.parks);
  });

  it("174 pickups: 150 coins, 14 stars, 10 hearts", () => {
    const p = buildPickups();
    expect(p.length).toBe(census.pickups);
    expect(p.filter((x) => x.kind === "coin").length).toBe(150);
    expect(p.filter((x) => x.kind === "star").length).toBe(14);
    expect(p.filter((x) => x.kind === "heart").length).toBe(10);
  });

  it("84 traffic cars", () => {
    expect(buildTraffic().length).toBe(census.traffic);
  });

  it("the seeded noise is the original's formula: stable, in [0, 1)", () => {
    const t = 43758.5453 * Math.sin(127.1 * 1 + 3.7);
    expect(noise(1)).toBe(t - Math.floor(t));
    for (let i = 0; i < 1000; i++) {
      const v = noise(i * 1.7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("districts follow the original rule and parks fall on every third block", () => {
    expect(districtOf(0, -1)).toBe("core");
    expect(districtOf(4, 0)).toBe("commerce");
    expect(districtOf(-4, 0)).toBe("residential");
    expect(districtOf(-6, 3)).toBe("outskirts");
    expect(isPark(-1, -1)).toBe(true);
    expect(isPark(0, 0)).toBe(false);
  });
});

describe("pickups", () => {
  const pickups = buildPickups();

  it("coins lie on a street centre line; stars and hearts sit on block edges", () => {
    for (const c of pickups.filter((p) => p.kind === "coin")) {
      const onStreetX = STREET_LINES.some((l) => Math.abs(l - c.x) < 1e-9);
      const onStreetZ = STREET_LINES.some((l) => Math.abs(l - c.z) < 1e-9);
      expect(onStreetX || onStreetZ).toBe(true);
    }
    for (const s of pickups.filter((p) => p.kind !== "coin")) expect(Math.abs(s.x)).toBeLessThanOrEqual(7 * 60 + 5);
  });

  it("collecting follows the loop's rule: radius sqrt(13), combo up to x20, star refills, heart adds 0.45", () => {
    const list = [
      { kind: "coin" as const, x: 0, z: 0, taken: false, spin: 0, scale: 1, y: 1 },
      { kind: "coin" as const, x: 1, z: 0, taken: false, spin: 0, scale: 1, y: 1 },
      { kind: "heart" as const, x: 0, z: 2, taken: false, spin: 0, scale: 1, y: 1 },
      { kind: "star" as const, x: 0, z: -2, taken: false, spin: 0, scale: 1, y: 1 },
      { kind: "coin" as const, x: 50, z: 0, taken: false, spin: 0, scale: 1, y: 1 }
    ];
    const state = { collected: 0, score: 0, combo: 0, comboTimer: 0, boost: 0.2 };
    const events = collectPickups(list, { x: 0, z: 0 }, state);
    expect(events.map((e) => e.kind)).toEqual(["coin", "coin", "heart", "star"]);
    expect(state.collected).toBe(4);
    expect(state.combo).toBe(4);
    expect(state.comboTimer).toBe(4.2);
    expect(state.boost).toBe(1);
    expect(state.score).toBe(10 * 1 + 10 * 2 + 60 * 3 + 120 * 4);
    expect(list[4]!.taken).toBe(false);
    expect(collectPickups(list, { x: 0, z: 0 }, state)).toEqual([]);
  });

  it("combo is capped at 20 and drops when the timer runs out", () => {
    const state = { collected: 0, score: 0, combo: 19, comboTimer: 0, boost: 1 };
    const list = Array.from({ length: 3 }, () => ({ kind: "coin" as const, x: 0, z: 0, taken: false, spin: 0, scale: 1, y: 1 }));
    collectPickups(list, { x: 0, z: 0 }, state);
    expect(state.combo).toBe(20);
    tickCombo(state, 4.3);
    expect(state.combo).toBe(0);
  });
});

describe("buildings and traffic", () => {
  const blocks = buildBlocks();
  const buildings = buildBuildings(blocks);

  it("buildings stay inside their blocks, so the streets are clear", () => {
    expect(buildings.length).toBeGreaterThan(1000);
    for (const b of buildings) {
      const bx = Math.round(b.x / 60) * 60;
      const bz = Math.round(b.z / 60) * 60;
      expect(Math.abs(b.x - bx) + b.hw).toBeLessThanOrEqual(21.5 + 1e-6);
      expect(Math.abs(b.z - bz) + b.hd).toBeLessThanOrEqual(21.5 + 1e-6);
    }
  });

  it("the spawn street (x = 30) has no building solid within the car's reach", () => {
    for (const s of buildingSolids(buildings)) {
      if (Math.abs(s.z) > 480) continue;
      expect(Math.abs(s.x - 30) - s.hw).toBeGreaterThan(5.5);
    }
  });

  it("traffic wraps around the city and is deterministic", () => {
    const a = buildTraffic();
    const b = buildTraffic();
    expect(a.map((t) => [t.x, t.z])).toEqual(b.map((t) => [t.x, t.z]));
    for (let i = 0; i < 4000; i++) stepTraffic(a, 1 / 60);
    for (const t of a) {
      expect(t.along).toBeGreaterThanOrEqual(-444);
      expect(t.along).toBeLessThanOrEqual(444);
    }
  });

  it("a car driving into traffic is shoved, shaken and loses its streak, once per fresh contact", () => {
    const t = buildTraffic()[0]!;
    const player = { x: t.x + 0.4, z: t.z + 0.4, vx: -3, vz: 0, shake: 0, combo: 5 };
    expect(trafficContact([t], player)).toBe(true);
    expect(player.shake).toBeGreaterThan(0);
    expect(player.combo).toBe(0);
    expect(trafficContact([t], { x: t.x + 0.4, z: t.z + 0.4, vx: 0, vz: 0, shake: 0, combo: 0 })).toBe(false);
  });
});
