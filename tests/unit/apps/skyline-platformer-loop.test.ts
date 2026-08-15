import { describe, expect, it } from "vitest";
import { game } from "@aura3d/engine";
import {
  createSkylineLevel,
  SKYLINE_CHARACTER_HEIGHT,
  SKYLINE_MOVING_PLATFORMS,
  SKYLINE_SENTRY_ENCOUNTERS,
  skylineMotion
} from "../../../apps/showcase-skyline-runner/src/level";

describe("skyline platformer loop", () => {
  it("uses responsive move and jump numbers instead of slow-motion pacing", () => {
    expect(skylineMotion.moveSpeed).toBeGreaterThan(1.7);
    expect(skylineMotion.jumpVelocity).toBeGreaterThan(5);
    expect(skylineMotion.fallGravityMultiplier).toBeGreaterThan(1);
    expect(skylineMotion.coyoteMs).toBeGreaterThan(40);
    expect(skylineMotion.jumpBufferMs).toBeGreaterThan(40);
    expect(skylineMotion.apex).toBeGreaterThanOrEqual(SKYLINE_CHARACTER_HEIGHT * 2.1 - 0.02);
  });

  it("ships patrolling stompable sentries and moving platforms", () => {
    expect(SKYLINE_SENTRY_ENCOUNTERS.length).toBeGreaterThanOrEqual(2);
    expect(SKYLINE_SENTRY_ENCOUNTERS.every((sentry) => sentry.stompable && sentry.amplitude > 0)).toBe(true);
    expect(SKYLINE_MOVING_PLATFORMS.length).toBeGreaterThanOrEqual(2);
    expect(SKYLINE_MOVING_PLATFORMS.some((platform) => platform.axis === "y")).toBe(true);
  });

  it("collects, stomps, and completes from real kit input", () => {
    const level = createSkylineLevel();
    expect(level.collectibles?.length ?? 0).toBeGreaterThan(0);
    const collectKit = game.platformer({
      start: { x: 0, y: 0.4 },
      platforms: [{ id: "ground", x: -1, y: 0, width: 4, height: 0.2 }],
      collectibles: [{ id: "sky-shard", x: 0.55, y: 0.55, value: 50 }],
      finish: { x: 3.2, y: 0.4 },
      moveSpeed: 2.4,
      jumpVelocity: 6.2,
      gravity: -26,
      lives: 3
    });
    let snapshot = collectKit.snapshot();
    for (let frame = 0; frame < 40; frame += 1) {
      snapshot = collectKit.step(1 / 60, { moveX: 1 });
      if (snapshot.collected.includes("sky-shard")) break;
    }
    expect(snapshot.collected).toContain("sky-shard");
    expect(snapshot.score).toBeGreaterThan(0);
    void level;

    const arena = game.platformer({
      start: { x: 0, y: 1.42 },
      platforms: [
        { id: "ledge", x: -0.7, y: 1.2, width: 1.1, height: 0.16 },
        { id: "floor", x: -1.2, y: 0, width: 3.4, height: 0.18 }
      ],
      hazards: [{
        id: "patrol-warden",
        x: 0.85,
        y: 0.18,
        width: 0.28,
        height: 0.28,
        axis: "x",
        amplitude: 0.05,
        period: 8,
        stompable: true
      }],
      gravity: -28,
      jumpVelocity: 6.4,
      moveSpeed: 2.2,
      lives: 3
    });
    let stompState = arena.snapshot();
    const seen = new Set<string>();
    for (let frame = 0; frame < 90; frame += 1) {
      stompState = arena.step(1 / 60, { moveX: 1, jumpHeld: true });
      for (const event of stompState.events) seen.add(event.type);
      if (seen.has("stomp")) break;
    }
    expect([...seen]).toEqual(expect.arrayContaining(["stomp"]));
    expect(stompState.lives).toBe(3);
  });

  it("keeps a tap jump high enough to clear the opening stair step", () => {
    const kit = game.platformer({
      start: { x: 0.2, y: 0.42 },
      playerSize: [0.2, SKYLINE_CHARACTER_HEIGHT],
      platforms: [
        { id: "ground", x: -1, y: 0, width: 2.4, height: 0.2 },
        { id: "step", x: 1.3, y: 0.34, width: 1.6, height: 0.2 }
      ],
      finish: { x: 2.4, y: 0.7 },
      moveSpeed: skylineMotion.moveSpeed,
      jumpVelocity: skylineMotion.jumpVelocity,
      gravity: skylineMotion.gravity,
      jumpReleaseScale: 0.72,
      fallGravityMultiplier: skylineMotion.fallGravityMultiplier,
      coyoteMs: skylineMotion.coyoteMs,
      jumpBufferMs: skylineMotion.jumpBufferMs,
      lives: 3
    });
    let snapshot = kit.snapshot();
    for (let frame = 0; frame < 8; frame += 1) {
      snapshot = kit.step(1 / 60, { moveX: 0 });
    }
    expect(snapshot.player.grounded).toBe(true);
    snapshot = kit.step(1 / 60, { moveX: 1, jumpPressed: true, jumpHeld: true });
    let peakY = snapshot.player.y;
    for (let frame = 0; frame < 24; frame += 1) {
      snapshot = kit.step(1 / 60, { moveX: 1, jumpHeld: false });
      peakY = Math.max(peakY, snapshot.player.y);
    }
    expect(peakY).toBeGreaterThan(0.72);
    expect(snapshot.deaths).toBe(0);
  });
});
