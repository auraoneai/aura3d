import { describe, expect, it } from "vitest";
import { game } from "../../../packages/engine/src";
import { HitboxWorld, guardbox, hitbox, hurtbox, pushbox } from "@aura3d/physics";

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

  it("proves physics-level pushbox overlap, oriented knockback, and hitstop timer windows", () => {
    const world = new HitboxWorld();
    world.registerCombatant({
      id: "attacker",
      team: "p1",
      position: [0, 0, 0],
      facing: 1,
      hurtboxes: [hurtbox({ id: "attacker-body", halfExtents: [0.25, 0.5, 0.25] })],
      pushbox: pushbox({ id: "attacker-push", halfExtents: [0.35, 0.5, 0.25] })
    });
    world.registerCombatant({
      id: "defender",
      team: "p2",
      position: [0.55, 0, 0],
      facing: -1,
      health: 100,
      hurtboxes: [hurtbox({ id: "defender-body", halfExtents: [0.3, 0.5, 0.25] })],
      pushbox: pushbox({ id: "defender-push", halfExtents: [0.35, 0.5, 0.25] })
    });
    world.spawnHitbox({
      id: "heavy-active",
      ownerId: "attacker",
      moveId: "heavy",
      activeFrames: { start: 0, end: 0 },
      recoveryFrames: 2,
      boxes: [hitbox({ id: "heavy-fist", offset: [0.55, 0, 0], halfExtents: [0.25, 0.35, 0.25] })],
      damage: 12,
      hitstunFrames: 3,
      hitStopFrames: 2,
      selfHitStopFrames: 1,
      knockback: [0.45, 0.1, 0]
    });

    const firstFrame = world.step(1);
    const push = firstFrame.find((event) => event.type === "pushbox-overlap");
    const hit = firstFrame.find((event) => event.type === "hit");
    const starts = firstFrame.filter((event) => event.type.endsWith("-start"));

    expect(push).toMatchObject({
      type: "pushbox-overlap",
      combatantA: "attacker",
      combatantB: "defender",
      normal: [-1, 0, 0]
    });
    expect(push?.type === "pushbox-overlap" ? push.penetration : 0).toBeCloseTo(0.15);
    expect(hit).toMatchObject({
      type: "hit",
      attackerId: "attacker",
      defenderId: "defender",
      moveId: "heavy",
      damage: 12,
      hitstunFrames: 3,
      hitStopFrames: 2,
      knockback: [0.45, 0.1, 0]
    });
    expect(starts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "hitstun-start", combatantId: "defender", frames: 3 }),
      expect.objectContaining({ type: "hitstop-start", combatantId: "defender", frames: 2 }),
      expect.objectContaining({ type: "hitstop-start", combatantId: "attacker", frames: 1 })
    ]));
    expect(firstFrame).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "hitstop-end", combatantId: "attacker" })
    ]));
    expect(world.getCombatant("defender")).toMatchObject({
      health: 88,
      hitstunFrames: 2,
      hitStopFrames: 1
    });

    const secondFrame = world.step(1);
    const thirdFrame = world.step(1);

    expect(secondFrame).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "hitstop-end", combatantId: "defender" })
    ]));
    expect(thirdFrame).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "hitstun-end", combatantId: "defender" })
    ]));
    expect([...secondFrame, ...thirdFrame]).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "recovery-start", combatantId: "attacker", frames: 2 }),
      expect.objectContaining({ type: "recovery-end", combatantId: "attacker" })
    ]));

    const blockedWorld = new HitboxWorld();
    blockedWorld.registerCombatant({
      id: "right-side-attacker",
      team: "p1",
      position: [0.6, 0, 0],
      facing: -1,
      hurtboxes: [hurtbox({ id: "right-body", halfExtents: [0.25, 0.5, 0.25] })]
    });
    blockedWorld.registerCombatant({
      id: "guarding-defender",
      team: "p2",
      position: [0, 0, 0],
      facing: 1,
      blocking: true,
      guard: 20,
      guardBoxes: [guardbox({ id: "guard-volume", halfExtents: [0.35, 0.55, 0.25] })],
      hurtboxes: [hurtbox({ id: "guard-hurt", halfExtents: [0.3, 0.5, 0.25] })]
    });
    blockedWorld.spawnHitbox({
      id: "reverse-poke",
      ownerId: "right-side-attacker",
      moveId: "reverse-poke",
      activeFrames: { start: 0, end: 0 },
      boxes: [hitbox({ id: "reverse-poke-hand", offset: [0.55, 0, 0], halfExtents: [0.3, 0.35, 0.25] })],
      guardDamage: 5,
      blockstunFrames: 4,
      hitStopFrames: 2,
      selfHitStopFrames: 1,
      blockKnockback: [0.25, 0, 0]
    });

    const blocked = blockedWorld.step(1);
    const block = blocked.find((event) => event.type === "blocked");

    expect(block).toMatchObject({
      type: "blocked",
      attackerId: "right-side-attacker",
      defenderId: "guarding-defender",
      guardDamage: 5,
      defenderGuard: 15,
      blockstunFrames: 4,
      hitStopFrames: 2,
      knockback: [-0.25, 0, 0]
    });
    expect(blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "blockstun-start", combatantId: "guarding-defender", frames: 4 }),
      expect.objectContaining({ type: "hitstop-start", combatantId: "guarding-defender", frames: 2 })
    ]));
  });

  it("locks the combat world on knockout and resets round state", () => {
    const world = game.combatWorld();
    world.addActor({ id: "attacker", team: "p1", position: [0, 0, 0], facing: 1, health: 100 });
    world.addActor({ id: "defender", team: "p2", position: [0.8, 0, 0], facing: -1, health: 12 });

    world.beginAttack("attacker", {
      id: "finisher",
      damage: 20,
      activeFrames: [1, 1],
      durationFrames: 4,
      hitboxes: [{ id: "finisher-volume", offset: [0.7, 0.85, 0], size: [0.5, 0.5, 0.5] }]
    });

    const ko = world.update(1 / 60);

    expect(ko.events.map((event) => event.type)).toEqual(expect.arrayContaining(["hit", "knockout"]));
    expect(ko).toMatchObject({
      roundLocked: true,
      activeAttacks: []
    });
    expect(ko.actors.find((actor) => actor.id === "defender")).toMatchObject({
      health: 0,
      knockedOut: true,
      guarding: false
    });

    world.beginAttack("attacker", {
      id: "post-ko",
      damage: 20,
      activeFrames: [1, 1],
      durationFrames: 2,
      hitboxes: [{ id: "post-ko-volume", offset: [0.7, 0.85, 0], size: [0.5, 0.5, 0.5] }]
    });
    const locked = world.update(1 / 60);

    expect(locked.roundLocked).toBe(true);
    expect(locked.events).toEqual([]);
    expect(locked.activeAttacks).toEqual([]);

    const reset = world.reset();

    expect(reset).toMatchObject({
      roundLocked: false,
      events: [{ type: "round-reset" }]
    });
    expect(reset.actors.find((actor) => actor.id === "defender")).toMatchObject({
      health: 100,
      guard: 100,
      meter: 0,
      knockedOut: false
    });
  });
});
