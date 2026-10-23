import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RouteData, Tables } from "../../../examples/last-train-port/sim";

const route = JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData;
const tables = JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables;

describe("last-train-port data (measured from the original)", () => {
  it("has six towns on a closed ring of six legs whose lengths match the route samples", () => {
    expect(tables.towns).toHaveLength(6);
    expect(route.legs).toHaveLength(6);
    route.legs.forEach((leg, i) => {
      expect(leg.length).toBeCloseTo(tables.legLengths[i]!, 3);
      expect(leg.count).toBe(Math.ceil(leg.length / leg.spacing) + 1);
      expect(leg.position).toHaveLength(leg.count * 3);
      expect(leg.physics).toHaveLength(leg.count * 4);
      expect([...leg.position, ...leg.physics].every(Number.isFinite)).toBe(true);
    });
  });

  it("legs join end to start (the ring closes within the measurement spacing)", () => {
    route.legs.forEach((leg, i) => {
      const next = route.legs[(i + 1) % route.legs.length]!;
      const end = leg.position.slice(-3), start = next.position.slice(0, 3);
      expect(Math.hypot(end[0]! - start[0]!, end[1]! - start[1]!, end[2]! - start[2]!)).toBeLessThan(2.5);
    });
  });

  it("carries the original's driving constants and difficulty 'low' table", () => {
    expect(tables.TM).toBe(17.5);
    expect(tables.AM.brisk).toBe(8.2);
    expect(tables.difficulty).toMatchObject({ steering: 0.9, damping: 2.35, instability: 0.32, disturbance: 0.55, maxRate: 0.36 });
    expect(tables.garage).toEqual({ motor: 1, sway: 1, brake: 1 });
    expect(tables.seats).toBe(12);
  });

  it("has station passenger tables for four circuits x six stations with valid destinations and temperaments", () => {
    expect(tables.passengerTable).toHaveLength(24);
    for (const row of tables.passengerTable) {
      for (const p of row.passengers) {
        expect(p.destination).toBeGreaterThanOrEqual(0);
        expect(p.destination).toBeLessThan(6);
        expect(["easy", "sightseer", "rushed", "sleeper"]).toContain(p.temperament);
      }
    }
  });

  it("has three driving gates per leg inside the leg", () => {
    tables.gates.forEach((gates, i) => {
      expect(gates).toHaveLength(3);
      for (const g of gates) { expect(g.distance).toBeGreaterThan(0); expect(g.distance).toBeLessThan(route.legs[i]!.length); expect(g.max).toBeGreaterThan(g.min); expect(g.bonus).toBe(25); }
    });
  });
});
