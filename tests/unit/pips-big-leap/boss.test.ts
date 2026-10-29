// Brambleback pattern (audit 2026-10-29 tests gap: no boss.ts sim tests).
import { describe, expect, it } from "vitest";
import { createBoss, damageBoss, stepBoss, type BossEvent } from "../../../apps/showcase-pips-big-leap/src/game/boss";

const DT = 1 / 60;

describe("pips-big-leap Brambleback", () => {
  it("wakes when Pip enters the arena, then cycles roll -> windup -> vulnerable", () => {
    const b = createBoss();
    expect(stepBoss(b, [0, 2.6, -40], DT).events).toHaveLength(0);
    const wake = stepBoss(b, [0, 2.6, -64], DT);
    expect(wake.events.map((e) => e.kind)).toEqual(["activate", "phase"]);
    const phases: string[] = [];
    for (let f = 0; f < 60 * 5; f += 1) {
      for (const e of stepBoss(b, [0, 2.6, -64], DT).events) if (e.kind === "phase") phases.push(e.phase!);
    }
    expect(phases.slice(0, 3)).toEqual(["windup", "vulnerable", "roll"]);
  });

  it("takes damage only while vulnerable and goes down after three hits", () => {
    const b = createBoss();
    const events: BossEvent[] = [];
    stepBoss(b, [0, 2.6, -64], DT);
    damageBoss(b, events);
    expect(b.hp).toBe(3);
    for (let hit = 0; hit < 3; hit += 1) {
      let guard = 0;
      while (b.phase !== "vulnerable" && guard++ < 600) stepBoss(b, [0, 2.6, -64], DT);
      expect(b.phase).toBe("vulnerable");
      expect(stepBoss(b, [0, 2.6, -64], DT).vulnerable).toBe(true);
      damageBoss(b, events);
    }
    expect(b.hp).toBe(0);
    expect(b.phase).toBe("down");
    expect(events.some((e) => e.kind === "down")).toBe(true);
    expect(stepBoss(b, [0, 2.6, -64], DT).vulnerable).toBe(false);
  });
});
