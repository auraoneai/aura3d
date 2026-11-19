/**
 * Idol wow pass: each actor slot mounts one rigged Idol GLB, and the rig driver turns the procedural clip angles into
 * bone rotations whose posed joints land where a runner's hands and feet should be (render layer only).
 */
import { describe, expect, it } from "vitest";
import { buildProceduralActorNodes, sampleClipAngles } from "../../../examples/ninja-runner-port/art/proceduralActors";
import { IDOL_ACTORS, idolKeyFor, segmentsFromAngles } from "../../../examples/ninja-runner-port/art/idolActors";
import { createIdolRigDriver, qFromEngineEuler, qToEngineEuler } from "../../../examples/ninja-runner-port/art/idolRig";
import { IDOL_RIGS } from "../../../examples/ninja-runner-port/art/idolRigData";

describe("ninja-runner-port Idol actors", () => {
  it("mounts one world-scaled Idol model per actor slot", () => {
    expect(IDOL_ACTORS).toBe(true);
    const node = buildProceduralActorNodes(0, "hero", true)[0]!.toJSON() as { kind?: string; scaleMode?: string; asset?: { url?: string } };
    expect(node.kind).toBe("model");
    expect(node.scaleMode).toBe("world");
    expect(node.asset?.url).toMatch(/^\/aura-assets\/nrHero\.[0-9a-f]+\.glb$/);
    expect(idolKeyFor("hero", "clone")).toBe("nrHeroClone");
    expect(idolKeyFor("brute", "std")).toBe("nrBrute");
  });

  it("every rig has hips, spine, head and full arm and leg chains", () => {
    for (const [key, rig] of Object.entries(IDOL_RIGS)) {
      const m = rig.map;
      for (const chain of [m.armL, m.armR]) expect(chain.slice(1).every((b) => b >= 0 && b < rig.bones.length), key).toBe(true);
      for (const chain of [m.legL, m.legR]) expect(chain.slice(0, 3).every((b) => b >= 0 && b < rig.bones.length), key).toBe(true);
      expect(m.spine.length, key).toBeGreaterThan(0);
    }
  });

  it("idle hangs the T-pose arms down and the run swings legs and arms in opposition", () => {
    const d = createIdolRigDriver(IDOL_RIGS.nrHero);
    const m = d.data.map;
    d.solve(segmentsFromAngles(sampleClipAngles("idle", 0, 1.6)));
    const hand = d.jointPosition(m.armR[3]!), hips = d.jointPosition(m.hips);
    expect(hand[1]).toBeLessThan(hips[1] + 0.25);
    expect(Math.abs(hand[0])).toBeLessThan(0.45);
    // run at the quarter phase: the left leg is back (-Z), the left hand forward (+Z)
    d.solve(segmentsFromAngles(sampleClipAngles("run", 0.16, 0.64)));
    const footL = d.jointPosition(m.legL[2]!), handL = d.jointPosition(m.armL[3]!), footR = d.jointPosition(m.legR[2]!);
    expect(footL[2]).toBeLessThan(footR[2]);
    expect(handL[2]).toBeGreaterThan(d.jointPosition(m.armR[3]!)[2]);
  });

  it("engine Euler helpers round-trip (scene graph ZYX order)", () => {
    const e = [0.3, -0.7, 0.2];
    expect(qToEngineEuler(qFromEngineEuler(e)).map((v) => +v.toFixed(6))).toEqual(e);
  });
});
