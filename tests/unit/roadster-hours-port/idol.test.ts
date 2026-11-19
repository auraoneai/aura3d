import { describe, expect, it } from "vitest";
import { LEVELS, levelLayout } from "../../../examples/roadster-hours-port/course";
import { IDOL_HERO_BODY, IDOL_VEHICLE_VARIANTS, idolAsset, idolVehicleKey } from "../../../examples/roadster-hours-port/art/idol";
import { buildWorld } from "../../../examples/roadster-hours-port/world";

type Node = Record<string, unknown> & { readonly name?: string; readonly kind?: string };
function nodes(scene: { toJSON(): unknown }): Node[] {
  const out: Node[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") {
      const o = v as Node;
      if (typeof o.kind === "string" && typeof o.name === "string") out.push(o);
      for (const key of Object.keys(o)) if (key !== "geometry" && key !== "material" && key !== "asset") walk(o[key]);
    }
  };
  walk(scene.toJSON());
  return out;
}

describe("Saltwind Highway Idol models (render layer only)", () => {
  it("every admitted variant resolves to a typed model asset with bounds", () => {
    for (const key of [IDOL_HERO_BODY, ...Object.values(IDOL_VEHICLE_VARIANTS).flat()]) {
      const ref = idolAsset(key);
      expect(ref, key).not.toBeNull();
      expect(ref!.bounds?.every((v) => v > 0)).toBe(true);
    }
  });

  it("every car, pickup, bus, semi and tractor of every route draws as an Idol instance (box trucks, tankers, carriers stay procedural)", () => {
    LEVELS.forEach((level, i) => {
      const all0 = [...levelLayout(level).vehicles.map((v) => v.piece), ...level.traffic.map((t) => t.piece)];
      const procedural = new Set(["box_truck", "tanker", "car_carrier"]);
      all0.forEach((piece, idx) => expect(idolVehicleKey(piece, idx) === null, piece).toBe(procedural.has(piece)));
      const pieces = all0.filter((piece) => !procedural.has(piece));
      const all = nodes(buildWorld(i, "gu47").scene);
      const pools = all.filter((n) => /^vehicles-idol-sw/.test(n.name ?? ""));
      expect(pools.length).toBeGreaterThan(5);
      for (const pool of pools) {
        expect(pool.kind).toBe("model");
        expect(Array.isArray(pool.instances)).toBe(true);
      }
      const instanceCount = pools.reduce((n, p) => n + (p.instances as unknown[]).length, 0);
      expect(instanceCount).toBe(pieces.length);
    });
  });

  it("the hero body is one Idol GLB in the car-body runtime group; the four wire-spoke wheels stay procedural", () => {
    const all = nodes(buildWorld(0, "gu47").scene);
    const body = all.find((n) => n.name === "car-body")!;
    expect(body.kind).toBe("group");
    expect(all.some((n) => n.name === "car-body-idol" && n.kind === "model")).toBe(true);
    for (const tag of ["fl", "fr", "rl", "rr"]) expect(all.some((n) => n.name === `car-wheel-${tag}`)).toBe(true);
    expect(all.some((n) => n.name === "car-stripes")).toBe(false);
  });

  it("?idol=0 (idol: false) and ?look=original keep the procedural models", () => {
    for (const world of [buildWorld(0, "gu47", { idol: false }), buildWorld(0, "original")]) {
      expect(nodes(world.scene).some((n) => n.kind === "model")).toBe(false);
      expect(world.texturedNodes).toBe(0);
    }
    expect(buildWorld(0, "gu47").texturedNodes).toBeGreaterThan(10);
  });
});
