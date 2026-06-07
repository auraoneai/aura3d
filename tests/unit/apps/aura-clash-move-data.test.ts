import { describe, expect, it } from "vitest";
import {
  AURA_CLASH_SPECIAL_COOLDOWN,
  AURA_CLASH_SPECIAL_METER_COST,
  AURA_CLASH_START_METER,
  AURA_CLASH_WALK_SPEED,
  auraClashActionFrameData,
  auraClashMovementMoveTable,
  auraClashMoveTable,
  type AuraClashActionMoveId
} from "../../../apps/aura-clash-showcase/src/playable/combat/auraClashMoveData";

describe("Aura Clash move data", () => {
  it("defines canonical frame data for attacks and movement actions", () => {
    const required: readonly AuraClashActionMoveId[] = ["light", "heavy", "special", "guard", "jump", "down", "dash"];

    expect(Object.keys(auraClashActionFrameData).sort()).toEqual([...required].sort());
    for (const id of required) {
      const frameData = auraClashActionFrameData[id];
      expect(frameData.id).toBe(id);
      expect(frameData.duration).toBeGreaterThan(0);
      expect(frameData.activeEnd).toBeGreaterThanOrEqual(frameData.activeStart);
      expect(frameData.recovery).toBeGreaterThanOrEqual(0);
      expect(frameData.clipKey).toBeTruthy();
    }

    expect(auraClashActionFrameData.light.kind).toBe("attack");
    expect(auraClashActionFrameData.guard.kind).toBe("movement");
    expect(auraClashActionFrameData.jump.clipKey).toBe("air");
    expect(auraClashActionFrameData.down.clipKey).toBe("guard");
    expect(auraClashActionFrameData.dash.clipKey).toBe("run");
  });

  it("keeps movement tuning in the move-data source of truth", () => {
    expect(auraClashMoveTable.special.damage).toBeLessThan(360 / 2);
    expect(auraClashMovementMoveTable.guard.guardGrace).toBeGreaterThan(0);
    expect(auraClashMovementMoveTable.jump.jumpVelocity).toBeGreaterThan(8);
    expect(auraClashMovementMoveTable.jump.maxJumpY).toBeGreaterThan(2);
    expect(auraClashMovementMoveTable.down.fastFallVelocity).toBeLessThan(-18);
    expect(auraClashMovementMoveTable.down.downGrace).toBeGreaterThan(0);
    expect(auraClashMovementMoveTable.dash.runSpeed).toBeGreaterThan(AURA_CLASH_WALK_SPEED);
  });

  it("tunes special as an available power move instead of a rare weak poke", () => {
    expect(AURA_CLASH_START_METER).toBeGreaterThanOrEqual(AURA_CLASH_SPECIAL_METER_COST * 2);
    expect(AURA_CLASH_SPECIAL_COOLDOWN).toBeLessThan(0.6);
    expect(auraClashMoveTable.special.damage).toBeGreaterThanOrEqual(auraClashMoveTable.heavy.damage * 4);
    expect(auraClashMoveTable.special.range).toBeGreaterThan(auraClashMoveTable.heavy.range);
    expect(auraClashMoveTable.special.knockback).toBeGreaterThan(auraClashMoveTable.heavy.knockback);
  });
});
