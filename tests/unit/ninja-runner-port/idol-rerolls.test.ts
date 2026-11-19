/**
 * Idol re-rolls and the QA barricade: the shrine gate, the water wheel and the katana are admitted Idol models now; the
 * katana is re-aimed from its measured frame (grip -Z to tip +Z, unit length); the lane barrier (QA: read as a red
 * stall box) is the Idol roadblock crate, dropped back to the ground inside the node world.ts lifts 0.75 m.
 */
import { describe, expect, it } from "vitest";
import { IDOL_ASSETS } from "../../../apps/showcase-ninja-runner-port/src/idol-assets";
import { IDOL_BARRIER_LIFT, IDOL_BARRIER_SCALE, IDOL_WEAPON_FRAME, buildIdolBarrierNodes, buildIdolWeaponNode } from "../../../examples/ninja-runner-port/art/idolScenery";

interface N { kind?: string; position?: number[]; rotation?: number[]; scale?: number[] | number; runtime?: { id?: string }; children?: N[] }

describe("Shadowstep Idol re-rolls and barricade", () => {
  it("ships the re-rolled shrine gate, water wheel and katana and the barricade", () => {
    for (const k of ["nrShrineGate", "nrWaterWheel", "nrKatana", "nrBarricade"]) expect(IDOL_ASSETS[k], k).toBeTruthy();
  });

  it("the katana frame is the measured one (unit grip-to-tip axis, not the placeholder)", () => {
    const f = IDOL_WEAPON_FRAME.nrKatana;
    expect(Math.hypot(...f.axis)).toBeCloseTo(1, 3);
    expect(f.length).toBeGreaterThan(2);
    const n = buildIdolWeaponNode("nrKatana", "hero-blade")!.toJSON() as unknown as N;
    const m = n.children![0]!;
    expect((m.scale as number[])[0]).toBeCloseTo(1 / f.length, 6);
  });

  it("each pooled barrier is the Idol crate on the ground, facing the runner, with the band/top ids kept", () => {
    const nodes = buildIdolBarrierNodes(2)!.map((b) => b.toJSON() as unknown as N);
    expect(nodes.map((n) => n.runtime?.id)).toEqual(["barrier-2", "barrier-band-2", "barrier-top-2"]);
    const crate = nodes[0]!.children![0]!;
    expect(crate.position).toEqual([0, -IDOL_BARRIER_LIFT, 0]);
    expect(crate.rotation![1]).toBeCloseTo(Math.PI, 6);
    expect(crate.scale).toEqual([...IDOL_BARRIER_SCALE]);
    expect(Math.max(...IDOL_BARRIER_SCALE) / Math.min(...IDOL_BARRIER_SCALE)).toBeLessThan(1.33);
  });
});
