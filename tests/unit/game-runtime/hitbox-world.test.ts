import { describe, expect, it } from "vitest";
import { game } from "../../../packages/engine/src";

describe("game combat hitbox world", () => {
  it("resolves hit, block, consume, and whiff events from public hitbox descriptors", () => {
    const world = game.combatWorld();
    world.addActor({ id: "attacker", team: "p1", position: [0, 0, 0], facing: 1, meter: 0 });
    world.addActor({ id: "defender", team: "p2", position: [0.8, 0, 0], facing: -1, health: 50 });
    world.beginAttack("attacker", {
      id: "jab",
      damage: 10,
      meterGain: 2,
      hitStun: 9,
      recovery: 5,
      activeFrames: [1, 1],
      durationFrames: 4,
      knockback: [0.2, 0, 0],
      hitboxes: [{ id: "jab-fist", offset: [0.7, 0.85, 0], size: [0.4, 0.4, 0.4] }]
    });

    const hit = world.update(1 / 60);
    const hitEvent = hit.events[0];
    const attacker = hit.actors.find((actor) => actor.id === "attacker");
    const defender = hit.actors.find((actor) => actor.id === "defender");

    expect(hitEvent).toMatchObject({ type: "hit", attackerId: "attacker", targetId: "defender", moveId: "jab", damage: 10, stun: 9 });
    expect(attacker?.meter).toBe(2);
    expect(defender?.health).toBe(40);
    expect(defender?.recovery).toBe(5);
    expect(defender?.position[0]).toBeCloseTo(1);
    expect(world.consumeEvents()).toEqual(hit.events);
    expect(world.events()).toEqual([]);

    const blockedWorld = game.combatWorld();
    blockedWorld.addActor({ id: "attacker", team: "p1", position: [0, 0, 0], facing: 1 });
    blockedWorld.addActor({ id: "guard", team: "p2", position: [0.8, 0, 0], facing: -1, health: 100, guard: 30, guarding: true });
    blockedWorld.beginAttack("attacker", {
      id: "guard-check",
      damage: 20,
      guardDamage: 4,
      blockStun: 7,
      activeFrames: [1, 1],
      durationFrames: 3,
      hitboxes: [{ id: "guard-check-volume", offset: [0.7, 0.9, 0], size: [0.5, 0.5, 0.5] }]
    });

    const blocked = blockedWorld.update(1 / 60);
    const guard = blocked.actors.find((actor) => actor.id === "guard");

    expect(blocked.events[0]).toMatchObject({ type: "blocked", guardDamage: 4, stun: 7 });
    expect(guard?.health).toBe(100);
    expect(guard?.guard).toBe(26);

    const whiffWorld = game.combatWorld();
    whiffWorld.addActor({ id: "attacker", team: "p1", position: [0, 0, 0], facing: 1 });
    whiffWorld.addActor({ id: "far-target", team: "p2", position: [4, 0, 0], facing: -1 });
    whiffWorld.beginAttack("attacker", {
      id: "short-poke",
      activeFrames: [1, 1],
      durationFrames: 2,
      hitboxes: [{ id: "short-poke-volume", offset: [0.5, 0.8, 0], size: [0.25, 0.25, 0.25] }]
    });

    whiffWorld.update(1 / 60);
    const whiff = whiffWorld.update(1 / 60);

    expect(whiff.events[0]).toMatchObject({ type: "whiff", attackerId: "attacker", moveId: "short-poke" });
    expect(whiff.activeAttacks).toEqual([]);
  });
});
