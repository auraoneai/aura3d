import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STATION_PROBE_RESOLUTION, stationProbes } from "../../../examples/last-train-port/lights";
import { buildWorld } from "../../../examples/last-train-port/world";
import type { RouteData, SimData, Tables } from "../../../examples/last-train-port/sim";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};
type ProbeJson = { kind: string; probe?: string; name?: string; options?: { update?: string; resolution?: number } };
const probeNodes = (json: unknown): ProbeJson[] => {
  const out: ProbeJson[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== "object") return;
    const o = n as ProbeJson & Record<string, unknown>;
    if (o.kind === "probe") out.push(o);
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  walk(json);
  return out;
};

describe("station reflection probes (GU47 WP-31 LT-08)", () => {
  it("one box probe per station, centred on the platform inside its box", () => {
    const ps = stationProbes(data);
    expect(ps).toHaveLength(6);
    expect(new Set(ps.map((p) => p.name)).size).toBe(6);
    for (const p of ps) for (let k = 0; k < 3; k++) {
      expect(p.position[k]!).toBeGreaterThan(p.box.min[k]!);
      expect(p.position[k]!).toBeLessThan(p.box.max[k]!);
    }
    // 6 cubes x 6 faces x 128^2 x 8 bytes (RGBA16F) x 4/3 mips stays inside the +12 MB row budget
    expect(6 * 6 * STATION_PROBE_RESOLUTION ** 2 * 8 * (4 / 3)).toBeLessThan(12 * 1024 * 1024);
  });

  it("every band scene carries the six probes (update once); ?look=original carries none", () => {
    const bands = buildWorld(data, "bands"), original = buildWorld(data, "original");
    for (const id of ["A", "D", "E"] as const) {
      const ps = probeNodes(bands.sceneFor(id).toJSON());
      expect(ps).toHaveLength(6);
      for (const p of ps) { expect(p.probe).toBe("reflection"); expect(p.options?.update).toBe("once"); }
    }
    expect(probeNodes(original.scene.toJSON())).toHaveLength(0);
  });
});
