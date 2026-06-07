import { describe, expect, it } from "vitest";
import {
  cloneCollisionVolume,
  collisionVolumeDebugDrawDescriptors,
  collisionVolumeVisibleInNormalPass,
  guardbox,
  hitbox,
  hurtbox,
  pushbox,
  resolveCollisionVolume
} from "../../../packages/physics/src/CollisionVolumes";
import { HitboxWorld, type CombatEvent } from "../../../packages/physics/src/HitboxWorld";

function registerFighters(world: HitboxWorld, options: { rivalHealth?: number; rivalGuarding?: boolean } = {}): void {
  world.registerCombatant({
    id: "player",
    team: "blue",
    position: [0, 0, 0],
    facing: 1,
    health: 120,
    maxHealth: 120,
    guard: 50,
    maxGuard: 50,
    hurtboxes: [hurtbox({ id: "player-body", offset: [0, 0.9, 0], halfExtents: [0.32, 0.82, 0.25] })],
    guardBoxes: [guardbox({ id: "player-guard", offset: [0.08, 0.9, 0], halfExtents: [0.42, 0.86, 0.28] })],
    pushbox: pushbox({ id: "player-push", offset: [0, 0.7, 0], halfExtents: [0.28, 0.7, 0.24] })
  });
  world.registerCombatant({
    id: "rival",
    team: "gold",
    position: [0.82, 0, 0],
    facing: -1,
    health: options.rivalHealth ?? 120,
    maxHealth: 120,
    guard: 40,
    maxGuard: 40,
    blocking: options.rivalGuarding ?? false,
    hurtboxes: [hurtbox({ id: "rival-body", offset: [0, 0.9, 0], halfExtents: [0.32, 0.82, 0.25] })],
    guardBoxes: [guardbox({ id: "rival-guard", offset: [0.08, 0.9, 0], halfExtents: [0.42, 0.86, 0.28] })],
    pushbox: pushbox({ id: "rival-push", offset: [0, 0.7, 0], halfExtents: [0.28, 0.7, 0.24] })
  });
}

function spawnMove(
  world: HitboxWorld,
  moveId: "light" | "heavy" | "special",
  options: {
    damage: number;
    guardDamage?: number;
    activeFrames: { start: number; end: number };
    recoveryFrames?: number;
    hitstunFrames?: number;
    blockstunFrames?: number;
    hitStopFrames?: number;
    maxHits?: number;
  }
): void {
  world.spawnHitbox({
    id: `player-${moveId}`,
    ownerId: "player",
    moveId,
    boxes: [hitbox({ id: `${moveId}-strike`, offset: [0.7, 0.9, 0], halfExtents: [0.34, 0.32, 0.24] })],
    damage: options.damage,
    guardDamage: options.guardDamage,
    activeFrames: options.activeFrames,
    recoveryFrames: options.recoveryFrames ?? 5,
    hitstunFrames: options.hitstunFrames ?? 9,
    blockstunFrames: options.blockstunFrames ?? 6,
    hitStopFrames: options.hitStopFrames ?? 0,
    selfHitStopFrames: options.hitStopFrames ?? 0,
    knockback: [0.18, 0, 0],
    maxHits: options.maxHits
  });
}

function eventsOfType<T extends CombatEvent["type"]>(events: readonly CombatEvent[], type: T): Extract<CombatEvent, { type: T }>[] {
  return events.filter((event): event is Extract<CombatEvent, { type: T }> => event.type === type);
}

describe("HitboxWorld fighting combat semantics", () => {
  it("keeps collision debug volumes opt-in and absent from normal rendering descriptors", () => {
    const visibleHitbox = hitbox({
      id: "debug-hit",
      offset: [0.7, 0.9, 0],
      halfExtents: [0.3, 0.25, 0.2],
      debug: { enabled: true, color: "#ff0044", opacity: 0.4, label: "active hit" }
    });
    const normalHurtbox = hurtbox({
      id: "normal-hurt",
      offset: [0, 0.9, 0],
      halfExtents: [0.32, 0.82, 0.25]
    });
    const resolved = [
      resolveCollisionVolume(visibleHitbox, [0, 0, 0], 1),
      resolveCollisionVolume(normalHurtbox, [0.8, 0, 0], -1)
    ];

    expect(collisionVolumeVisibleInNormalPass(visibleHitbox)).toBe(false);
    expect(collisionVolumeVisibleInNormalPass(normalHurtbox)).toBe(false);
    expect(collisionVolumeDebugDrawDescriptors(resolved)).toEqual([]);
    expect(collisionVolumeDebugDrawDescriptors(resolved, { enabled: false })).toEqual([]);
    expect(collisionVolumeDebugDrawDescriptors(resolved, { enabled: true })).toEqual([
      {
        id: "debug-hit",
        kind: "hitbox",
        center: [0.7, 0.9, 0],
        halfExtents: [0.3, 0.25, 0.2],
        color: "#ff0044",
        opacity: 0.4,
        label: "active hit"
      }
    ]);
    expect(cloneCollisionVolume(visibleHitbox).debug).toEqual(visibleHitbox.debug);
  });

  it("resolves light, heavy, and special move windows with distinct damage and recovery", () => {
    const world = new HitboxWorld({ detectPushboxOverlaps: false });
    registerFighters(world);

    spawnMove(world, "light", { damage: 8, activeFrames: { start: 1, end: 1 }, recoveryFrames: 4, hitstunFrames: 7 });

    expect(eventsOfType(world.step(), "hit")).toHaveLength(0);
    const lightEvents = world.step();

    expect(eventsOfType(lightEvents, "hit")).toMatchObject([{ moveId: "light", damage: 8, defenderHealth: 112 }]);
    expect(eventsOfType(lightEvents, "recovery-start")).toEqual([]);
    const postActiveEvents = world.step();
    expect(postActiveEvents.some((event) => event.type === "hit")).toBe(false);
    expect(postActiveEvents.some((event) => event.type === "recovery-start")).toBe(true);

    world.reset();
    spawnMove(world, "heavy", { damage: 18, activeFrames: { start: 0, end: 2 }, recoveryFrames: 9, hitstunFrames: 13 });
    const heavyEvents = world.step();

    expect(eventsOfType(heavyEvents, "hit")).toMatchObject([{ moveId: "heavy", damage: 18, defenderHealth: 102 }]);
    expect(world.getCombatant("rival")).toMatchObject({ hitstunFrames: 12 });

    world.reset();
    spawnMove(world, "special", { damage: 31, activeFrames: { start: 0, end: 3 }, recoveryFrames: 15, hitstunFrames: 18 });
    const specialEvents = world.step();

    expect(eventsOfType(specialEvents, "hit")).toMatchObject([{ moveId: "special", damage: 31, defenderHealth: 89 }]);
    expect(world.getCombatant("rival")).toMatchObject({ hitstunFrames: 17 });
  });

  it("routes guarded contact to blockstun and guard damage without reducing health", () => {
    const world = new HitboxWorld({ detectPushboxOverlaps: false });
    registerFighters(world, { rivalGuarding: true });

    spawnMove(world, "heavy", {
      damage: 20,
      guardDamage: 5,
      activeFrames: { start: 0, end: 1 },
      recoveryFrames: 8,
      blockstunFrames: 11
    });
    const events = world.step();

    expect(eventsOfType(events, "blocked")).toMatchObject([
      { moveId: "heavy", guardDamage: 5, defenderGuard: 35, blockstunFrames: 11 }
    ]);
    expect(eventsOfType(events, "hit")).toEqual([]);
    expect(world.getCombatant("rival")).toMatchObject({
      health: 120,
      guard: 35,
      blockstunFrames: 10
    });
  });

  it("enforces hit-once, locks on KO, rejects post-KO hitboxes, and reset restores baseline state", () => {
    const world = new HitboxWorld({ detectPushboxOverlaps: false });
    registerFighters(world, { rivalHealth: 28 });

    spawnMove(world, "special", {
      damage: 30,
      activeFrames: { start: 0, end: 5 },
      recoveryFrames: 12,
      hitstunFrames: 14,
      maxHits: 3
    });

    const koEvents = world.step(6);

    expect(eventsOfType(koEvents, "hit")).toHaveLength(1);
    expect(eventsOfType(koEvents, "knockout")).toMatchObject([{ combatantId: "rival", attackerId: "player", moveId: "special" }]);
    expect(world.snapshot()).toMatchObject({ roundLocked: true, hitboxes: [] });

    const denied = world.spawnHitbox({
      id: "after-ko-light",
      ownerId: "player",
      moveId: "light",
      boxes: [hitbox({ id: "after-ko-hitbox", offset: [0.7, 0.9, 0], halfExtents: [0.34, 0.32, 0.24] })],
      damage: 8
    });

    expect(denied).toMatchObject({ expired: true, hitCount: 0 });
    expect(eventsOfType(world.step(3), "hit")).toEqual([]);

    const reset = world.reset();

    expect(reset).toMatchObject({
      roundLocked: false,
      hitboxes: [],
      events: [{ type: "round-reset", combatants: ["player", "rival"] }]
    });
    expect(world.getCombatant("rival")).toMatchObject({
      health: 28,
      knockedOut: false,
      hitstunFrames: 0,
      blockstunFrames: 0,
      recoveryFrames: 0
    });

    spawnMove(world, "light", { damage: 8, activeFrames: { start: 0, end: 0 } });
    expect(eventsOfType(world.step(), "hit")).toHaveLength(1);
  });
});
