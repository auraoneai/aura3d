/**
 * Idol wow pass: the rigged Idol Bellkeeper takes the procedural `BellkeeperRigPose` (render layer only): planted and
 * swinging feet alternate along the walk, the staff hand rides forward of the body, and the hero group mounts the
 * Idol model with the carried staff.
 */
import { describe, expect, it } from "vitest";
import { createIdolRigDriver } from "../../../examples/where-the-wind-wanders-port/art/idolRig";
import { IDOL_RIGS } from "../../../examples/where-the-wind-wanders-port/art/idolRigData";
import { bellkeeperSegments, createIdolBellkeeperNode } from "../../../examples/where-the-wind-wanders-port/art/idolModels";
import { sampleBellkeeperRigPose } from "../../../examples/where-the-wind-wanders-port/art/proceduralModels";
import { group } from "@aura3d/engine";

describe("where-the-wind-wanders-port Idol Bellkeeper", () => {
  it("walk phases swap which foot leads, and the staff hand stays forward of the hips", () => {
    const d = createIdolRigDriver(IDOL_RIGS.bkHero);
    const m = d.data.map;
    const at = (phaseSeconds: number) => {
      d.solve(bellkeeperSegments(sampleBellkeeperRigPose({ gait: "Walk", phaseSeconds })));
      return { l: d.jointPosition(m.legL[2]!)[2], r: d.jointPosition(m.legR[2]!)[2], hand: d.jointPosition(m.armR[3]!), hips: d.jointPosition(m.hips) };
    };
    const a = at(0.05), b = at(0.05 + 1.0667 / 2);
    expect(Math.sign(a.l - a.r)).toBe(-Math.sign(b.l - b.r));
    expect(a.hand[2]).toBeGreaterThan(a.hips[2]);
    expect(a.hand[1]).toBeLessThan(a.hips[1] + 0.6);
  });

  it("the hero group carries the procedural staff; the rigged Idol body is a separate top-level model", () => {
    const part = group("p", []);
    const hero = createIdolBellkeeperNode({ name: "hero", id: "hero", castShadow: true, receiveShadow: true, staff: part as never, chime: part as never, ribbon: part as never, chimeOffset: [0, 0.5, 0.5], ribbonOffset: [0, 0.5, 0.4] })!;
    const json = hero.group.toJSON() as { children?: { kind?: string; name?: string }[] };
    expect(json.children?.map((c) => c.name)).toEqual(["hero-staff"]);
    const body = hero.body.toJSON() as { kind?: string; name?: string };
    expect(body.kind).toBe("model");
    expect(body.name).toBe("hero-idol");
  });
});
