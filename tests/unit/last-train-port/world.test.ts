import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyMat3, matrixToEulerZYX, tramRotation } from "../../../examples/last-train-port/orient";
import { SEATS, buildWorld, hexToRgb, lehmer, ribbon, TEMPERAMENT_COLORS } from "../../../examples/last-train-port/world";
import type { RouteData, SimData, Tables } from "../../../examples/last-train-port/sim";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};

describe("last-train-port rendering helpers", () => {
  it("tram rotation maps local +Z to the travel direction and tilts with grade", () => {
    const f: [number, number, number] = [0.6, 0.1, 0.8];
    const len = Math.hypot(...f);
    const fwd: [number, number, number] = [f[0] / len, f[1] / len, f[2] / len];
    const out = applyMat3(tramRotation(fwd, 0), [0, 0, 1]);
    out.forEach((v, i) => expect(v).toBeCloseTo(fwd[i]!, 9));
    const up = applyMat3(tramRotation([0, 0, 1], 0), [0, 1, 0]);
    expect(up[1]).toBeCloseTo(1, 9);
  });

  it("roll tilts the roof sideways without moving the nose", () => {
    const rot = tramRotation([0, 0, 1], 0.3);
    expect(applyMat3(rot, [0, 0, 1])[2]).toBeCloseTo(1, 9);
    expect(Math.abs(applyMat3(rot, [0, 1, 0])[0])).toBeGreaterThan(0.25);
  });

  it("euler conversion round-trips a pure yaw", () => {
    const e = matrixToEulerZYX(tramRotation([Math.sin(0.7), 0, Math.cos(0.7)], 0));
    expect(e[1]).toBeCloseTo(0.7, 9);
    expect(e[0]).toBeCloseTo(0, 9);
    expect(e[2]).toBeCloseTo(0, 9);
  });

  it("ribbon builds two vertices per centreline point and two triangles per segment, flat on the ground plane", () => {
    const pts = [0, 0, 0, 0, 0, 2, 0, 1, 4];
    const r = ribbon(pts, 1, 0.1);
    expect(r.positions).toHaveLength(3 * 6);
    expect(r.indices).toHaveLength(12);
    expect(r.positions[0]).toBeCloseTo(-1, 9);
    expect(r.positions[3]).toBeCloseTo(1, 9);
    expect(r.positions[1]).toBeCloseTo(0.1, 9);
  });

  it("seats are twelve and distinct; temperaments have four colours; helpers are deterministic", () => {
    expect(SEATS).toHaveLength(12);
    expect(new Set(SEATS.map((s) => s.join(","))).size).toBe(12);
    expect(Object.keys(TEMPERAMENT_COLORS)).toHaveLength(4);
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
    const a = lehmer(5), b = lehmer(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("builds the whole scene (sky, cloud sea, six towns, tram, seats, weather, lighting rig) with unique node names", () => {
    const world = buildWorld(data);
    const json = JSON.stringify(world.scene.toJSON());
    for (const name of ["sky", "cloud-sea", "islands", "platforms", "tram-body", "pax-11-sleeper", "house-0-a-2", "house-5-b-1", "clock-tower-0", "lighthouse-1", "crates-3-0", "lamp-post-2--9", "weather", "track-bed", "track-rails", "sun", "lamps", "sleepers", "landmark-5", "motes", "facades-0", "roofs-2", "stonework", "plaza-cobbles"]) expect(json, name).toContain(`"${name}"`);
    const nightJson = JSON.stringify(world.nightScene.toJSON());
    expect(nightJson).toContain('"moon"');
    expect(nightJson).not.toContain('"sun"');
    // probes.reflection echoes its name inside `options` (GU47 LT-08): count node names only
    const names = [...json.matchAll(/(?<!"options":\{)"name":"([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(names).size).toBe(names.length);
  });
});
