import { describe, expect, it } from "vitest";
import { hitbox, hurtbox } from "../../../packages/physics/src/CollisionVolumes";
import { HitboxWorld } from "../../../packages/physics/src/HitboxWorld";

function registerDuel(world: HitboxWorld): void {
  world.registerCombatant({
    id: "player",
    team: "blue",
    position: [0, 0, 0],
    facing: 1,
    health: 100,
    hurtboxes: [hurtbox({ id: "body", halfExtents: [0.4, 0.8, 0.3] })]
  });
  world.registerCombatant({
    id: "rival",
    team: "gold",
    position: [0.7, 0, 0],
    facing: -1,
    health: 20,
    maxHealth: 100,
    hurtboxes: [hurtbox({ id: "body", halfExtents: [0.4, 0.8, 0.3] })]
  });
}

describe("HitboxWorld KO lock and reset", () => {
  it("locks combat after knockout, clears active hitboxes, and prevents post-KO hit spam", () => {
    const world = new HitboxWorld();
    registerDuel(world);

    world.spawnHitbox({
      id: "heavy-1",
      ownerId: "player",
      moveId: "heavy",
      boxes: [hitbox({ id: "fist", offset: [0.65, 0, 0], halfExtents: [0.25, 0.4, 0.25] })],
      damage: 25,
      activeFrames: { start: 0, end: 8 },
      recoveryFrames: 6,
      hitStopFrames: 0,
      selfHitStopFrames: 0
    });

    const events = world.step();

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["hitbox-spawned", "hit", "knockout", "hitbox-expired"])
    );
    expect(events.filter((event) => event.type === "hit")).toHaveLength(1);
    expect(world.snapshot()).toMatchObject({
      roundLocked: true,
      hitboxes: []
    });
    expect(world.getCombatant("rival")).toMatchObject({
      health: 0,
      knockedOut: true
    });

    const inert = world.spawnHitbox({
      id: "heavy-after-ko",
      ownerId: "player",
      moveId: "heavy",
      boxes: [hitbox({ id: "fist", offset: [0.65, 0, 0], halfExtents: [0.25, 0.4, 0.25] })],
      damage: 25
    });

    expect(inert).toMatchObject({ expired: true, hitCount: 0 });
    expect(world.step(5).some((event) => event.type === "hit")).toBe(false);
    expect(world.getCombatant("rival")).toMatchObject({ health: 0, knockedOut: true });
  });

  it("reset restores baseline health and clears timers, hitboxes, and KO lock", () => {
    const world = new HitboxWorld();
    registerDuel(world);
    world.spawnHitbox({
      id: "ko",
      ownerId: "player",
      moveId: "special",
      boxes: [hitbox({ id: "burst", offset: [0.65, 0, 0], halfExtents: [0.3, 0.5, 0.3] })],
      damage: 99,
      hitStopFrames: 4,
      selfHitStopFrames: 4
    });
    world.step();

    const reset = world.reset();

    expect(reset).toMatchObject({
      roundLocked: false,
      hitboxes: [],
      events: [{ type: "round-reset", combatants: ["player", "rival"] }]
    });
    expect(world.getCombatant("rival")).toMatchObject({
      health: 20,
      maxHealth: 100,
      knockedOut: false,
      hitStopFrames: 0,
      hitstunFrames: 0,
      blockstunFrames: 0,
      recoveryFrames: 0
    });

    world.spawnHitbox({
      id: "after-reset",
      ownerId: "player",
      moveId: "light",
      boxes: [hitbox({ id: "jab", offset: [0.65, 0, 0], halfExtents: [0.25, 0.4, 0.25] })],
      damage: 5,
      hitStopFrames: 0,
      selfHitStopFrames: 0
    });
    expect(world.step().some((event) => event.type === "hit")).toBe(true);
  });
});
