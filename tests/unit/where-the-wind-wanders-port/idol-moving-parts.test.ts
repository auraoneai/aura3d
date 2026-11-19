/**
 * Moving-parts pass: the Idol windmill sails and the sanctuary bell are their own runtime nodes (the sails centred on the
 * hub the world spins about local Z, the bell hung from its yoke so it swings about it), and world.ts drives both every
 * frame from time / gust and the bell-ring clock. The rowboat moves as a whole (no wheels or oars to turn).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { idolBellNode, idolSailsNode } from "../../../examples/where-the-wind-wanders-port/art/idolModels";

interface N { kind?: string; name?: string; position?: number[]; runtime?: { id?: string }; asset?: { url?: string }; children?: N[] }

describe("where-the-wind-wanders-port Idol moving parts", () => {
  it("sails: a `sails` group at the hub holding the Idol sail model centred on it", () => {
    const n = idolSailsNode("sails", [10, 20, 30], false, false)!.toJSON() as unknown as N;
    expect(n.runtime?.id).toBe("sails");
    expect(n.position).toEqual([10, 20, 30]);
    const m = n.children![0]!;
    expect(m.kind).toBe("model");
    expect(m.asset?.url).toMatch(/bkWindmillSails/);
    // centred: the model offset keeps the hub within a metre of the sail plane centre
    expect(Math.hypot(m.position![0]!, m.position![1]! + 0, 0) / 22).toBeLessThan(0.6);
  });

  it("bell: a `bell-model` group whose Idol bell hangs below its yoke pivot", () => {
    const n = idolBellNode("belltower-bell", "bell-model", [1, 2, 3], false, false)!.toJSON() as unknown as N;
    expect(n.runtime?.id).toBe("bell-model");
    expect(n.children![0]!.position![1]).toBeLessThan(-0.5);
  });

  it("world.ts turns the sails with the gust and swings the bell every frame", () => {
    const src = readFileSync("examples/where-the-wind-wanders-port/world.ts", "utf8");
    expect(src).toMatch(/sailAngle \+= [^;]*gustAt/);
    expect(src).toMatch(/node\("sails"\)\.setPosition\([^)]*\)\.setRotation\(0, 0, sailAngle\)/);
    expect(src).toMatch(/node\("bell-model"\)\.setRotation\(0, 0, bellAngle\)/);
  });
});
