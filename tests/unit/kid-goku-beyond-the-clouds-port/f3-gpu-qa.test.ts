/**
 * F3 real-GPU QA (Cumulus): the cloud-steed rider is alive (lean into lane changes, balancing sway, arm counter-swing,
 * knee bob) instead of one held arms-out pose, and the storm tyrant's bite lunge no longer slides the body (tested in
 * idol-tyrant.test.ts).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHeroMotion, heroBody } from "../../../examples/kid-goku-beyond-the-clouds-port/art/heroMotion";
import { computeSkyKidHeroPose } from "../../../examples/kid-goku-beyond-the-clouds-port/art/proceduralModels";

describe("Cumulus F3 GPU QA", () => {
  it("the cloud rider's pose keeps changing and leans into lane changes", () => {
    const b = heroBody();
    const run = (laneVelocity: number) => {
      const hm = createHeroMotion();
      const palms: number[][] = [];
      let chest = [0, 0, 0, 1] as readonly number[];
      for (let f = 0; f < 120; f++) {
        const codePose = computeSkyKidHeroPose({ clip: "sit", clock: f / 60, animT: 0, gaitPhase: 0, groundSpeed: 0, lean: 0 } as never);
        const m = hm.frame({ clip: "sit", dt: 1 / 60, groundSpeed: 0, gaitPhase: 0, jump: 0, jumpVelocity: 0, falling: false, codePose, laneVelocity });
        if (f === 30 || f === 114) palms.push([...b.driver.palmPoints(m.input).left]);
        chest = m.input.rotations.chest ?? chest;
      }
      return { palms, chest };
    };
    const still = run(0);
    // two frames 1.4 s apart differ visibly (the F3 capture showed the same arms-out pose)
    expect(Math.hypot(...still.palms[0]!.map((v, k) => v - still.palms[1]![k]!))).toBeGreaterThan(0.04);
    const left = run(-6), right = run(6);
    // leaning one way and the other rolls the chest in opposite senses (z component of the roll)
    expect(Math.sign(left.chest[2]! - right.chest[2]!)).not.toBe(0);
    expect(Math.abs(left.chest[2]! - right.chest[2]!)).toBeGreaterThan(0.05);
  });

  it("world.ts hands the rider its lane velocity", () => {
    expect(readFileSync("examples/kid-goku-beyond-the-clouds-port/world.ts", "utf8")).toContain("laneVelocity: s.laneVelocity });");
  });

  it("the ride log is the Idol cedar log, centred on its rolling axis", async () => {
    const { idolRideLogNode, RIDE_LOG } = await import("../../../examples/kid-goku-beyond-the-clouds-port/idol");
    const n = idolRideLogNode().toJSON() as unknown as { runtime?: { id?: string }; children?: { position?: number[]; scale?: number | number[] }[] };
    expect(n.runtime?.id).toBe("ride-log");
    const m = n.children![0]!, k = RIDE_LOG.targetLength / RIDE_LOG.length;
    expect(JSON.stringify(n)).toContain("cdRideLog");
    expect(m.position![1]).toBeCloseTo(-RIDE_LOG.axisY * k, 6);
    // the drawn radius matches the procedural log's 0.96 m within 10%
    expect(Math.abs(1.3 * k - 0.96) / 0.96).toBeLessThan(0.1);
  });
});

